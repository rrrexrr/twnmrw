-- =============================================================
--  我们的小站 · Supabase 数据库
--  用法：Supabase 后台 → SQL Editor → New query → 粘贴整个文件
--        先把最底部的暗号改成你们自己的数字 → Run
--  可以重复运行（不会删数据），改暗号也是改最底部那行再运行一次。
-- =============================================================

create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

-- 所有数据都放在这一张表里：kind 区分用途（milestone / dish / order ...）
create table if not exists public.hq_items (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (char_length(kind) between 1 and 40),
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists hq_items_kind_idx on public.hq_items (kind, created_at);

-- 暗号（只存加密后的哈希，看不到原文）
create table if not exists public.hq_secret (
  id         int primary key default 1 check (id = 1),
  code_hash  text not null
);

-- 输错暗号的记录，用来防止被暴力猜
create table if not exists public.hq_attempts (
  at  timestamptz not null default now()
);

-- 打开行级安全、且不建任何规则 = 网页上的公开 key 无法直接读写这三张表
-- 唯一的入口是下面这几个函数，而函数每次都会先核对暗号
alter table public.hq_items    enable row level security;
alter table public.hq_secret   enable row level security;
alter table public.hq_attempts enable row level security;

revoke all on public.hq_items, public.hq_secret, public.hq_attempts from anon, authenticated;

-- ---------- 内部：核对暗号 ----------
-- 返回 'ok' / 'wrong_code' / 'locked'；10 分钟内输错 20 次就先锁 10 分钟
create or replace function public._hq_check(p_code text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_fails int;
  v_hash  text;
begin
  delete from hq_attempts where at < now() - interval '1 day';

  select count(*) into v_fails from hq_attempts where at > now() - interval '10 minutes';
  if v_fails >= 20 then
    return 'locked';
  end if;

  select code_hash into v_hash from hq_secret where id = 1;
  if v_hash is not null and p_code is not null and v_hash = crypt(p_code, v_hash) then
    return 'ok';
  end if;

  insert into hq_attempts default values;
  return 'wrong_code';
end;
$$;

revoke execute on function public._hq_check(text) from public, anon, authenticated;

-- ---------- 对外的四个函数 ----------
-- 注意：它们不会抛异常，而是返回 {ok:false, error:...}，
-- 这样输错暗号的记录不会因为回滚而丢失。

create or replace function public.hq_verify(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v text := _hq_check(p_code);
begin
  if v <> 'ok' then return jsonb_build_object('ok', false, 'error', v); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.hq_list(p_code text, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v text := _hq_check(p_code);
begin
  if v <> 'ok' then return jsonb_build_object('ok', false, 'error', v); end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(to_jsonb(i) order by i.created_at)
    from hq_items i where i.kind = p_kind
  ), '[]'::jsonb));
end;
$$;

create or replace function public.hq_save(p_code text, p_kind text, p_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v    text := _hq_check(p_code);
  rec  hq_items;
begin
  if v <> 'ok' then return jsonb_build_object('ok', false, 'error', v); end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_data');
  end if;
  if octet_length(p_data::text) > 20000 then
    return jsonb_build_object('ok', false, 'error', 'too_big');
  end if;

  if p_id is null then
    insert into hq_items (kind, data) values (p_kind, p_data) returning * into rec;
  else
    insert into hq_items (id, kind, data) values (p_id, p_kind, p_data)
    on conflict (id) do update set data = excluded.data, updated_at = now()
    returning * into rec;
  end if;
  return jsonb_build_object('ok', true, 'item', to_jsonb(rec));
end;
$$;

create or replace function public.hq_remove(p_code text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v text := _hq_check(p_code);
begin
  if v <> 'ok' then return jsonb_build_object('ok', false, 'error', v); end if;
  delete from hq_items where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- 保活：GitHub Actions 定时来敲一下门，免费项目就不会因为太久没人用被暂停
create or replace function public.hq_ping()
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object('ok', true, 'items', (select count(*) from hq_items));
$$;

grant execute on function
  public.hq_verify(text),
  public.hq_list(text, text),
  public.hq_save(text, text, uuid, jsonb),
  public.hq_remove(text, uuid),
  public.hq_ping()
to anon, authenticated;

-- =============================================================
--  ↓↓↓ 在这里设置你们的暗号（4~12 位数字），改完再点 Run ↓↓↓
--  不要用生日、纪念日这种别人能猜到的数字；建议 8 位以上
-- =============================================================
do $$
declare
  v_code text := '在这里填暗号';   -- 例如 '52013148'
begin
  if v_code !~ '^[0-9]{4,12}$' then
    raise exception '请先把上面的 v_code 改成 4~12 位数字的暗号，再点 Run';
  end if;
  insert into public.hq_secret (id, code_hash)
  values (1, crypt(v_code, gen_salt('bf')))
  on conflict (id) do update set code_hash = excluded.code_hash;
end;
$$;
