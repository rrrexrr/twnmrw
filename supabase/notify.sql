-- =============================================================
--  我们的小站 · 邮件提醒（可选）
--  点了菜 / 完成了里程碑 / 新留言 → 自动发一封邮件
--
--  前提：schema.sql 已经运行过；Google Apps Script 那边已经部署好（见 README「邮件提醒」）
--  用法：Supabase 后台 → SQL Editor → New query → 粘贴整个文件
--        ★ 在 SQL Editor 里 ★ 把最底部的网址换成你的 Apps Script 网址 → Run
--        （不要把真网址改进这个文件再 push，仓库是公开的）
--  可以重复运行：口令不会变。
--    · 只是更新功能（比如加了留言提醒）：什么都不用改，直接整个 Run
--    · 要换网址：改最底部的网址再 Run
-- =============================================================

-- pg_net：让数据库可以往外发 HTTP 请求（在事务提交后异步发，不会拖慢保存）
create extension if not exists pg_net with schema extensions;
create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

-- 发到哪里 + 口令。和其他表一样：网页上的公开 key 完全碰不到
create table if not exists public.hq_notify (
  id       int primary key default 1 check (id = 1),
  url      text not null,
  token    text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  enabled  boolean not null default true
);

-- 发过的提醒（用来防止同一个里程碑来回点，连发好几封）
create table if not exists public.hq_notify_log (
  item_id  uuid not null,
  event    text not null,
  at       timestamptz not null default now()
);

alter table public.hq_notify     enable row level security;
alter table public.hq_notify_log enable row level security;
revoke all on public.hq_notify, public.hq_notify_log from anon, authenticated;

-- ---------- 内部：真正去发 ----------
create or replace function public._hq_notify_send(p_event text, p_data jsonb, p_extra jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg hq_notify;
begin
  select * into cfg from hq_notify where id = 1;
  if not found or not cfg.enabled then return null; end if;

  return net.http_post(
    url     := cfg.url,
    body    := jsonb_build_object('token', cfg.token, 'event', p_event, 'data', p_data) || p_extra,
    timeout_milliseconds := 15000
  );
end;
$$;

revoke execute on function public._hq_notify_send(text, jsonb, jsonb) from public, anon, authenticated;

-- ---------- 触发器：什么时候发 ----------
--  · 新的点单（kind = order，新插入）
--  · 新的留言（kind = note，新插入）
--  · 里程碑从「未完成」变成「完成」（同一个里程碑 1 小时内只发一次）
create or replace function public._hq_notify_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_done  int;
  v_total int;
begin
  if new.kind = 'order' and tg_op = 'INSERT' then
    perform _hq_notify_send('order', new.data);

  elsif new.kind = 'note' and tg_op = 'INSERT' then
    perform _hq_notify_send('note', new.data);

  elsif new.kind = 'milestone'
        and new.data->>'done' = 'true'
        and (tg_op = 'INSERT' or coalesce(old.data->>'done', 'false') <> 'true') then

    if exists (select 1 from hq_notify_log
               where item_id = new.id and event = 'milestone' and at > now() - interval '1 hour') then
      return new;
    end if;

    select count(*) filter (where data->>'done' = 'true'), count(*)
      into v_done, v_total
      from hq_items where kind = 'milestone';

    perform _hq_notify_send('milestone', new.data, jsonb_build_object('done', v_done, 'total', v_total));
    delete from hq_notify_log where at < now() - interval '7 days';
    insert into hq_notify_log (item_id, event) values (new.id, 'milestone');
  end if;

  return new;
exception when others then
  -- 发提醒出了任何问题，都不能影响保存本身
  raise warning 'hq notify skipped: %', sqlerrm;
  return new;
end;
$$;

revoke execute on function public._hq_notify_trigger() from public, anon, authenticated;

drop trigger if exists hq_items_notify on public.hq_items;
create trigger hq_items_notify
  after insert or update of data on public.hq_items
  for each row execute function public._hq_notify_trigger();

-- ---------- 手动测试：在 SQL Editor 里运行 select hq_notify_test(); ----------
create or replace function public.hq_notify_test()
returns bigint
language sql
security definer
set search_path = public, extensions
as $$
  select _hq_notify_send('test', '{}'::jsonb);
$$;

revoke execute on function public.hq_notify_test() from public, anon, authenticated;

-- =============================================================
--  ↓↓↓ 在 SQL Editor 里把网址换成你的 Apps Script 网址，再点 Run ↓↓↓
--  （部署 Apps Script 时给你的那一串，以 /exec 结尾）
--  之前已经填过、这次只是更新功能的话，保持原样不用改
-- =============================================================
do $$
declare
  v_url text := '在这里填Apps Script网址';   -- 例如 'https://script.google.com/macros/s/AKfy.../exec'
begin
  if v_url = '在这里填Apps Script网址' and exists (select 1 from public.hq_notify where id = 1) then
    raise notice '网址没改，沿用之前填过的';
    return;
  end if;
  if v_url !~ '^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec$' then
    raise exception '请先把上面的 v_url 换成 Apps Script 的网址（https://script.google.com/macros/s/.../exec），再点 Run';
  end if;
  insert into public.hq_notify (id, url) values (1, v_url)
  on conflict (id) do update set url = excluded.url, enabled = true;
end;
$$;

-- 运行完，下面会显示一串口令：复制它，填到 Apps Script 的「脚本属性」TOKEN 里
select token as "把这串口令填到 Apps Script → 脚本属性 → TOKEN" from public.hq_notify where id = 1;
