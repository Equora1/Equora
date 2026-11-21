begin;

create function public.equora_delete_trades_v1(p_trade_ids uuid[])
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_requested integer := cardinality(p_trade_ids);
  v_matched integer;
  v_deleted integer;
  v_paths text[];
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if array_ndims(p_trade_ids) is distinct from 1 or v_requested not between 1 and 10000 then
    raise exception 'Invalid trade selection' using errcode = 'EQD01';
  end if;

  select count(distinct requested.id) into v_matched
  from unnest(p_trade_ids) as requested(id);
  if v_matched <> v_requested then
    raise exception 'Invalid trade selection' using errcode = 'EQD01';
  end if;

  -- Lock in ID order so overlapping submissions cannot acquire the same locks
  -- in opposite orders. A missing or inaccessible trade invalidates the selection.
  perform trade.id
  from public.trades as trade
  where trade.user_id = v_user_id and trade.id = any(p_trade_ids)
  order by trade.id
  for update;
  get diagnostics v_matched = row_count;
  if v_matched <> v_requested then
    raise exception 'Trade selection no longer available' using errcode = 'EQD02';
  end if;

  select coalesce(array_agg(distinct media.storage_path order by media.storage_path), '{}'::text[])
  into v_paths
  from public.trade_media as media
  where media.user_id = v_user_id
    and media.trade_id = any(p_trade_ids)
    and btrim(media.storage_path) <> '';

  -- Foreign keys remove shared submissions. The media trigger queues all
  -- detached paths in the same transaction so cleanup can run after commit.
  delete from public.trades as trade
  where trade.user_id = v_user_id and trade.id = any(p_trade_ids);
  get diagnostics v_deleted = row_count;
  if v_deleted <> v_requested then
    raise exception 'Trade selection no longer available' using errcode = 'EQD02';
  end if;

  return jsonb_build_object(
    'deletedCount', v_deleted,
    'cleanupPathCount', cardinality(v_paths),
    'storagePaths', v_paths[1:20]
  );
end;
$$;

revoke all on function public.equora_delete_trades_v1(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.equora_delete_trades_v1(uuid[]) to authenticated;

commit;
