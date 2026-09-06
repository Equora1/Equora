\set ON_ERROR_STOP on
\pset pager off

-- Operational fail-closed switch. It preserves schema and financial history.
-- Unrelated receipt, function, ACL or snapshot drift must not block closing.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
set local idle_in_transaction_session_timeout = '45s';
set local search_path = '';

do $equora_v5762_deactivate$
declare
  v_enabled boolean;
  v_activated_at timestamptz;
  v_changed integer;
begin
  if current_user <> 'postgres' or not exists (
    select 1 from pg_catalog.pg_class
    where oid = to_regclass('public.equora_runtime_capability_gates')
      and relkind = 'r'
      and relowner = (select oid from pg_catalog.pg_roles where rolname='postgres')
  ) then raise exception 'TRADE_IMPORT_DEACTIVATION_TARGET_INVALID'; end if;
  if (select count(*) from (values
    ('capability_key','text'::regtype),('contract_version','text'::regtype),
    ('enabled','boolean'::regtype),('activated_at','timestamptz'::regtype),
    ('updated_at','timestamptz'::regtype)
  ) expected(column_name,column_type)
  join pg_catalog.pg_attribute actual
    on actual.attrelid='public.equora_runtime_capability_gates'::regclass
    and actual.attname=expected.column_name and actual.atttypid=expected.column_type
    and not actual.attisdropped) <> 5
  then raise exception 'TRADE_IMPORT_DEACTIVATION_TARGET_INVALID'; end if;
  -- Include internal FK triggers: cascading updates are effects too.
  if exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.equora_runtime_capability_gates'::regclass
  ) or exists (
    select 1 from pg_catalog.pg_rewrite
    where ev_class = 'public.equora_runtime_capability_gates'::regclass
  ) or exists (
    select 1 from pg_catalog.pg_inherits
    where inhparent='public.equora_runtime_capability_gates'::regclass
      or inhrelid='public.equora_runtime_capability_gates'::regclass
  ) then raise exception 'TRADE_IMPORT_DEACTIVATION_TARGET_EFFECTS_INVALID'; end if;

  -- Conflicts with the transaction-wide FOR SHARE held by admitted imports.
  select enabled, activated_at into v_enabled, v_activated_at
  from public.equora_runtime_capability_gates
  where capability_key = 'journal_file_import_persistence_v2'
    and contract_version = 'equora-broker-file-import-capability-v1'
  for update;
  if not found then raise exception 'TRADE_IMPORT_DEACTIVATION_GATE_MISSING'; end if;

  if not v_enabled and v_activated_at is null then
    raise notice 'Trade-import persistence gate already disabled; no effect.';
  else
    -- Also close inconsistent enabled/timestamp states.
    update public.equora_runtime_capability_gates
    set enabled = false, activated_at = null,
        updated_at = transaction_timestamp()
    where capability_key = 'journal_file_import_persistence_v2'
      and contract_version = 'equora-broker-file-import-capability-v1';
    get diagnostics v_changed = row_count;
    if v_changed <> 1 then raise exception 'TRADE_IMPORT_DEACTIVATION_CAS_FAILED'; end if;
  end if;
  if (select count(*) from public.equora_runtime_capability_gates
      where capability_key = 'journal_file_import_persistence_v2'
        and contract_version = 'equora-broker-file-import-capability-v1'
        and not enabled and activated_at is null) <> 1
  then raise exception 'TRADE_IMPORT_DEACTIVATION_CAS_FAILED'; end if;
end;
$equora_v5762_deactivate$;

commit;
\echo 'v57.62.0 trade-import deactivation COMMITTED; database gate disabled.'
