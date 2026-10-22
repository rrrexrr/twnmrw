-- =============================================================
--  我们的小站 · 回忆（照片）需要的数据库更新
--  用法：Supabase 后台 → SQL Editor → New query → 粘贴整个文件 → Run
--  什么都不用改，可以重复运行，不会动已有数据。
--
--  做了两件事：
--   1. hq_save 按种类放宽大小：照片（memory_photo）最大约 1.5MB，回忆卡片（memory，带小缩略图）200KB，其他还是 20KB
--   2. 新增 hq_get：按 id 取一条记录（看大图时才去取，不用一次把所有照片都下载下来）
-- =============================================================

set search_path = public, extensions;

create or replace function public.hq_save(p_code text, p_kind text, p_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v     text := _hq_check(p_code);
  rec   hq_items;
  v_max int := case p_kind when 'memory_photo' then 1500000 when 'memory' then 200000 else 20000 end;
begin
  if v <> 'ok' then return jsonb_build_object('ok', false, 'error', v); end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_data');
  end if;
  if octet_length(p_data::text) > v_max then
    return jsonb_build_object('ok', false, 'error', 'too_big');
  end if;

  if p_id is null then
    insert into hq_items (kind, data) values (p_kind, p_data) returning * into rec;
  else
    insert into hq_items (id, kind, data) values (p_id, p_kind, p_data)
    on conflict (id) do update set data = excluded.data, updated_at = now()
    returning * into rec;
  end if;

  -- 照片存好后只回传 id，不把 1MB 的图片再原样传回网页
  if p_kind = 'memory_photo' then
    return jsonb_build_object('ok', true, 'item',
      jsonb_build_object('id', rec.id, 'kind', rec.kind, 'data', '{}'::jsonb,
                         'created_at', rec.created_at, 'updated_at', rec.updated_at));
  end if;
  return jsonb_build_object('ok', true, 'item', to_jsonb(rec));
end;
$$;

create or replace function public.hq_get(p_code text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v   text := _hq_check(p_code);
  rec hq_items;
begin
  if v <> 'ok' then return jsonb_build_object('ok', false, 'error', v); end if;
  select * into rec from hq_items where id = p_id;
  if not found then return jsonb_build_object('ok', true, 'item', null); end if;
  return jsonb_build_object('ok', true, 'item', to_jsonb(rec));
end;
$$;

revoke execute on function public.hq_get(text, uuid) from public;
grant execute on function
  public.hq_save(text, text, uuid, jsonb),
  public.hq_get(text, uuid)
to anon, authenticated;

select 'memories.sql 更新完成' as status;
