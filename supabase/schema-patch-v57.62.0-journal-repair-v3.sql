-- LOCAL PREPARATION ONLY. Not in migrations; no execution authorized by this file.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
set local idle_in_transaction_session_timeout = '15s';

do $$begin
 if to_regprocedure('public.equora_create_trade_v2(uuid,jsonb,text[],uuid)') is not null
 or to_regprocedure('public.equora_update_trade_v2(uuid,jsonb,text[],uuid)') is not null
 or to_regprocedure('public.equora_review_source_v3(uuid,uuid[])') is not null
 or to_regprocedure('public.equora_commit_review_snapshot_v3(uuid,uuid,uuid[],text,jsonb,jsonb)') is not null
 or to_regprocedure('public.equora_assert_exit_price_basis_v1(jsonb)') is not null
 or to_regprocedure('public.equora_invalidate_exit_price_basis_v1()') is not null
 or exists(select 1 from pg_attribute where attrelid='public.trades'::regclass and attname='exit_price_basis' and not attisdropped) then
  raise exception 'JOURNAL_REPAIR_CONTRACT_ALREADY_PRESENT_REQUIRES_DRIFT_REVIEW';
 end if;
 if to_regprocedure('public.equora_create_trade_v1(uuid,jsonb,text[],uuid)') is null
 or to_regprocedure('public.equora_update_trade_v1(uuid,jsonb,text[],uuid)') is null
 or to_regprocedure('public.equora_review_source_v2(uuid,uuid[])') is null then
  raise exception 'JOURNAL_REPAIR_BASELINE_MISSING';
 end if;
 if (select count(*) from pg_attribute where attrelid='public.review_sessions'::regclass and not attisdropped and not attnotnull
  and not atthasdef and not atthasmissing and attgenerated='' and attidentity=''
  and ((attname='calculation_version' and atttypid='text'::regtype)
    or (attname in('r_count','excluded_r_count') and atttypid='integer'::regtype)))<>3 then
  raise exception 'REVIEW_PROVENANCE_BASELINE_MISSING';
 end if;
end$$;

-- Existing metadata-only UPDATE grants must not permit forged metric/version rows.
do $$declare principal text;col text;begin
 foreach principal in array array['anon','authenticated'] loop
  if has_table_privilege(principal,'public.review_sessions','INSERT') or has_any_column_privilege(principal,'public.review_sessions','INSERT') then raise exception 'UNSAFE_REVIEW_INSERT_GRANT';end if;
  foreach col in array array['user_id','trade_ids','trade_count','visible_trade_count','net_pnl','currency','monetary_scope_kind','average_r','win_rate','winners','losers','breakeven','top_tags','best_trade_id','worst_trade_id','calculation_version','r_count','excluded_r_count'] loop
   if has_column_privilege(principal,'public.review_sessions',col,'UPDATE') then raise exception 'UNSAFE_REVIEW_METRIC_UPDATE_GRANT';end if;
  end loop;
 end loop;
end$$;

-- No backfill: historical unknown prices remain unknown.
alter table public.trades add column exit_price_basis text
 check (exit_price_basis is null or exit_price_basis='weighted-remainder-v1');

create function public.equora_assert_exit_price_basis_v1(p_trade jsonb)
returns text language plpgsql immutable security invoker set search_path='' as $$
declare basis text;coverage numeric;
begin
 if p_trade is null or jsonb_typeof(p_trade)<>'object' or not p_trade ? 'exit_price_basis' then
  raise exception 'EXIT_PRICE_BASIS_CONTRACT_REQUIRED';
 end if;
 basis:=p_trade->>'exit_price_basis';
 if basis is null then return null;end if;
 if basis<>'weighted-remainder-v1' or jsonb_typeof(p_trade->'exit') is distinct from 'number'
 or (p_trade->>'exit')::numeric<=0
 or jsonb_typeof(p_trade->'partial_exits') is distinct from 'array' then
  raise exception 'INVALID_EXIT_PRICE_BASIS';
 end if;
 if exists(select 1 from jsonb_array_elements(p_trade->'partial_exits') leg
  where jsonb_typeof(leg->'percent') is distinct from 'number' or jsonb_typeof(leg->'price') is distinct from 'number'
   or (leg->>'percent')::numeric<=0 or (leg->>'price')::numeric<=0) then
  raise exception 'INVALID_EXIT_PRICE_BASIS';
 end if;
 select sum((leg->>'percent')::numeric) into coverage from jsonb_array_elements(p_trade->'partial_exits') leg;
 if coverage is null or coverage<=0 or round(100-coverage,4)<=0.0001 then
  raise exception 'INVALID_EXIT_PRICE_BASIS';
 end if;
 return basis;
end$$;

-- Older writers cannot retain a stale assertion after changing the exit/legs.
create function public.equora_invalidate_exit_price_basis_v1()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.exit is distinct from old.exit or new.partial_exits is distinct from old.partial_exits then
  new.exit_price_basis:=null;
 end if;
 return new;
end$$;
create trigger trades_invalidate_exit_price_basis_v1 before update of exit,partial_exits on public.trades
for each row execute function public.equora_invalidate_exit_price_basis_v1();

-- Existing atomic owner-scoped mutations remain authoritative; the assertion is
-- written in that same RPC transaction. It describes owner/application price
-- semantics, never broker provenance or an independently verified fill.
create function public.equora_create_trade_v2(
 p_trade_id uuid,p_trade jsonb,p_tags text[] default '{}'::text[],p_setup_id uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid();basis text;result jsonb;
begin
 if owner_id is null then raise exception 'UNAUTHENTICATED';end if;
 basis:=public.equora_assert_exit_price_basis_v1(p_trade);
 result:=public.equora_create_trade_v1(p_trade_id,p_trade,p_tags,p_setup_id);
 -- Never relabel an existing idempotent row from a caller's later payload.
 if coalesce((result->>'alreadyApplied')::boolean,false) then return result;end if;
 update public.trades set exit_price_basis=basis where id=p_trade_id and user_id=owner_id;
 if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN';end if;
 return result;
end$$;

create function public.equora_update_trade_v2(
 p_trade_id uuid,p_trade jsonb,p_tags text[] default '{}'::text[],p_setup_id uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid();basis text;result jsonb;
begin
 if owner_id is null then raise exception 'UNAUTHENTICATED';end if;
 basis:=public.equora_assert_exit_price_basis_v1(p_trade);
 perform 1 from public.trades where id=p_trade_id and user_id=owner_id for update;
 if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN';end if;
 result:=public.equora_update_trade_v1(p_trade_id,p_trade,p_tags,p_setup_id);
 update public.trades set exit_price_basis=basis where id=p_trade_id and user_id=owner_id;
 if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN';end if;
 return result;
end$$;

revoke all on function public.equora_assert_exit_price_basis_v1(jsonb) from public,anon;
revoke all on function public.equora_invalidate_exit_price_basis_v1() from public,anon,authenticated;
revoke all on function public.equora_create_trade_v2(uuid,jsonb,text[],uuid) from public,anon;
revoke all on function public.equora_update_trade_v2(uuid,jsonb,text[],uuid) from public,anon;
grant execute on function public.equora_assert_exit_price_basis_v1(jsonb) to authenticated;
grant execute on function public.equora_create_trade_v2(uuid,jsonb,text[],uuid) to authenticated;
grant execute on function public.equora_update_trade_v2(uuid,jsonb,text[],uuid) to authenticated;

-- v2 remains untouched for stored history and rollback compatibility. New app
-- calculations explicitly use v3; never silently reinterpret existing rows.
create or replace function public.equora_review_source_v3(p_user_id uuid,p_trade_ids uuid[])
returns text language plpgsql volatile security definer set search_path='' as $$
declare ids uuid[];snapshot jsonb;source_text text;
begin
 if current_setting('transaction_isolation') is distinct from 'read committed' then raise exception 'REVIEW_REQUIRES_READ_COMMITTED';end if;
 if p_user_id is null then raise exception 'INVALID_OWNER';end if;
 select array_agg(id order by id) into ids from (select distinct unnest(p_trade_ids) id)s;
 if coalesce(cardinality(ids),0)=0 or cardinality(ids)>2000 or array_position(ids,null) is not null then raise exception 'INVALID_TRADE_SCOPE';end if;
 -- One statement snapshot includes every input consumed by the mapper/summary.
 with scoped as materialized(select t.* from public.trades t where t.user_id=p_user_id and t.id=any(ids)),
 tag_rows as materialized(select tag.* from public.trade_tags tag join scoped t on t.id=tag.trade_id order by tag.id limit 100001)
 select jsonb_build_object('version','review-source-v3','owner',p_user_id,
  'trades',coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from scoped t),'[]'::jsonb),
  'tags',coalesce((select jsonb_agg(to_jsonb(tag.*) order by tag.id) from tag_rows tag),'[]'::jsonb)) into snapshot;
 if jsonb_array_length(snapshot->'trades')<>cardinality(ids) then raise exception 'TRADE_NOT_FOUND_OR_FORBIDDEN';end if;
 if jsonb_array_length(snapshot->'tags')>100000 then raise exception 'TAG_SCOPE_TOO_LARGE';end if;
 source_text:=snapshot::text;
 if octet_length(source_text)>4194304 then raise exception 'SOURCE_TOO_LARGE';end if;
 return source_text;
end$$;

create or replace function public.equora_commit_review_snapshot_v3(
 p_user_id uuid,p_session_id uuid,p_trade_ids uuid[],p_source_text text,p_summary jsonb,p_meta jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' set lock_timeout='3s' as $$
declare
 ids uuid[];expected_ids jsonb;current_source text;result public.review_sessions;
 n integer;rc integer;excluded integer;avg_r numeric;money numeric;wr numeric;wins integer;losses integer;flat integer;
 scope text;unit text;best uuid;worst uuid;title text;kind text;status text;
begin
 if current_setting('transaction_isolation') is distinct from 'read committed' then raise exception 'REVIEW_REQUIRES_READ_COMMITTED';end if;
 if p_user_id is null or p_session_id is null or p_source_text is null or octet_length(p_source_text)>4194304 then raise exception 'INVALID_INPUT';end if;
 select array_agg(id order by id) into ids from (select distinct unnest(p_trade_ids) id)s;
 if coalesce(cardinality(ids),0)=0 or cardinality(ids)>2000 or array_position(ids,null) is not null then raise exception 'INVALID_TRADE_SCOPE';end if;
 select jsonb_agg(id order by id) into expected_ids from unnest(ids)id;
 if jsonb_typeof(p_summary)<>'object' or not p_summary ?& array['calculationVersion','tradeIds','tradeCount','visibleTradeCount','netPnL','currency','monetaryScopeKind','averageR','rCount','excludedRCount','winRate','winners','losers','breakeven','topTags','bestTradeId','worstTradeId'] then raise exception 'INVALID_SUMMARY';end if;
 if p_summary->>'calculationVersion'<>'finalized-outcomes-v3' or p_summary->'tradeIds' is distinct from expected_ids then raise exception 'INVALID_SUMMARY_VERSION_OR_SCOPE';end if;
 n:=(p_summary->>'tradeCount')::integer;rc:=(p_summary->>'rCount')::integer;excluded:=(p_summary->>'excludedRCount')::integer;
 if n is null or n<>cardinality(ids) or (p_summary->>'visibleTradeCount')::integer is distinct from n
 or rc is null or excluded is null or rc<0 or excluded<0 or rc+excluded<>n then raise exception 'INVALID_OBSERVATION_COUNTS';end if;
 if (rc=0 and p_summary->'averageR' is distinct from 'null'::jsonb) or (rc>0 and jsonb_typeof(p_summary->'averageR') is distinct from 'number') then raise exception 'INVALID_AVERAGE';end if;
 avg_r:=(p_summary->>'averageR')::numeric;
 if jsonb_typeof(p_summary->'netPnL') is distinct from 'number' or jsonb_typeof(p_summary->'winRate') is distinct from 'number' then raise exception 'INVALID_NUMERIC_SUMMARY';end if;
 money:=(p_summary->>'netPnL')::numeric;wr:=(p_summary->>'winRate')::numeric;
 wins:=(p_summary->>'winners')::integer;losses:=(p_summary->>'losers')::integer;flat:=(p_summary->>'breakeven')::integer;
 if wins is null or losses is null or flat is null or wins<0 or losses<0 or flat<0 or wins+losses+flat>n or wr<0 or wr>100 then raise exception 'INVALID_OUTCOME_COUNTS';end if;
 scope:=p_summary->>'monetaryScopeKind';unit:=p_summary->>'currency';
 if scope is null or scope not in('single','mixed','empty','unknown') or (scope='single' and (unit is null or unit not in('EUR','USD','GBP','USDT','USDC')))
 or (scope<>'single' and (unit is not null or money<>0)) then raise exception 'INVALID_MONETARY_SCOPE';end if;
 best:=(p_summary->>'bestTradeId')::uuid;worst:=(p_summary->>'worstTradeId')::uuid;
 if (best is not null and not best=any(ids)) or (worst is not null and not worst=any(ids)) or (scope<>'single' and (best is not null or worst is not null)) then raise exception 'INVALID_RANKED_SCOPE';end if;
 if jsonb_typeof(p_summary->'topTags') is distinct from 'array' or jsonb_array_length(p_summary->'topTags')>8
 or exists(select 1 from jsonb_array_elements(p_summary->'topTags')v where jsonb_typeof(v) is distinct from 'string') then raise exception 'INVALID_TAG_SUMMARY';end if;
 if p_meta is null or jsonb_typeof(p_meta)<>'object' or octet_length(p_meta::text)>65536 then raise exception 'INVALID_META';end if;
 title:=btrim(coalesce(p_meta->>'title',''));kind:=coalesce(p_meta->>'sessionType','spotlight');status:=coalesce(p_meta->>'sessionStatus','open');
 if title='' or length(title)>160 or kind not in('spotlight','review') or status not in('open','watch','closed') then raise exception 'INVALID_META';end if;
 if (p_meta ? 'chips' and jsonb_typeof(p_meta->'chips') is distinct from 'array') or (p_meta ? 'labels' and jsonb_typeof(p_meta->'labels') is distinct from 'array') then raise exception 'INVALID_META_ARRAYS';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_meta->'chips','[]'::jsonb))v where jsonb_typeof(v)<>'string')
 or exists(select 1 from jsonb_array_elements(coalesce(p_meta->'labels','[]'::jsonb))v where jsonb_typeof(v)<>'string') then raise exception 'INVALID_META_ARRAYS';end if;

 -- Table-level SHARE fences every normal DML writer, including absent/new tags.
 -- Row locks alone cannot fence insertion of previously absent tag rows.
 -- Fixed lock order, timeout, no network/calculation inside the write fence.
 lock table public.trades in share mode;
 lock table public.trade_tags in share mode;
 current_source:=public.equora_review_source_v3(p_user_id,ids);
 if current_source is distinct from p_source_text then raise exception 'REVIEW_SOURCE_CHANGED';end if;

 insert into public.review_sessions(
 id,user_id,title,note,focus_title,focus_description,chips,labels,trade_ids,trade_count,visible_trade_count,
 net_pnl,currency,monetary_scope_kind,average_r,win_rate,winners,losers,breakeven,top_tags,best_trade_id,worst_trade_id,
 session_type,session_status,is_pinned,period_preset,period_label,period_start,period_end,created_at,
 calculation_version,r_count,excluded_r_count
 )values(
 p_session_id,p_user_id,title,nullif(btrim(p_meta->>'note'),''),nullif(btrim(p_meta->>'focusTitle'),''),nullif(btrim(p_meta->>'focusDescription'),''),
 array(select distinct btrim(value) from jsonb_array_elements_text(coalesce(p_meta->'chips','[]'::jsonb))v(value) where btrim(value)<>'' limit 50),
 array(select distinct btrim(value) from jsonb_array_elements_text(coalesce(p_meta->'labels','[]'::jsonb))v(value) where btrim(value)<>'' limit 50),
 ids,n,n,money,unit,scope,avg_r,wr,wins,losses,flat,array(select jsonb_array_elements_text(p_summary->'topTags')),best,worst,
 kind,status,coalesce((p_meta->>'isPinned')::boolean,false),nullif(p_meta->>'periodPreset',''),nullif(btrim(p_meta->>'periodLabel'),''),
 nullif(p_meta->>'periodStart','')::timestamptz,nullif(p_meta->>'periodEnd','')::timestamptz,now(),
 'finalized-outcomes-v3',rc,excluded) returning * into result;
 return to_jsonb(result);
end$$;
revoke all on function public.equora_review_source_v3(uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.equora_commit_review_snapshot_v3(uuid,uuid,uuid[],text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.equora_review_source_v3(uuid,uuid[]) to service_role;
grant execute on function public.equora_commit_review_snapshot_v3(uuid,uuid,uuid[],text,jsonb,jsonb) to service_role;
do $$declare principal text;begin
 foreach principal in array array['anon','authenticated'] loop
  if has_function_privilege(principal,'public.equora_review_source_v3(uuid,uuid[])','EXECUTE')
  or has_function_privilege(principal,'public.equora_commit_review_snapshot_v3(uuid,uuid,uuid[],text,jsonb,jsonb)','EXECUTE') then
   raise exception 'UNSAFE_INHERITED_REVIEW_EXECUTE_GRANT';
  end if;
 end loop;
end$$;
commit;
