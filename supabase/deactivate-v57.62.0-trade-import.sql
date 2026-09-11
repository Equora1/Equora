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
  if current_user <> 'postgres' then
    raise exception 'TRADE_IMPORT_DEACTIVATION_TARGET_INVALID';
  end if;
  -- Hold the target definition stable before inspecting executable effects.
  -- Wait for admitted imports/activation before taking any row lock.
  -- EXCLUSIVE avoids a ROW SHARE -> ROW EXCLUSIVE lock-upgrade cycle.
  lock table only public.equora_runtime_capability_gates
    in exclusive mode;
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
  ) or exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid='public.equora_runtime_capability_gates'::regclass
      and attnum > 0 and not attisdropped and attgenerated <> ''
  ) or exists (
    select 1 from pg_catalog.pg_class
    where oid='public.equora_runtime_capability_gates'::regclass
      and relforcerowsecurity
  ) then raise exception 'TRADE_IMPORT_DEACTIVATION_TARGET_EFFECTS_INVALID'; end if;

  -- NOT VALID still evaluates on future writes. Inspect every present CHECK.
  -- Missing or unvalidated *known* checks cannot introduce executable effects;
  -- tolerate those so an inconsistent gate can still be closed operationally.
  -- Installation/activation continue to require the full verifier's inventory.
  perform pg_catalog.set_config('search_path','pg_catalog',true);
  -- Only the known built-in PK index may execute during target maintenance.
  -- An absent index is safe for closing; STRICT below binds row cardinality.
  if exists (
    select 1 from pg_catalog.pg_index actual
    where actual.indrelid='public.equora_runtime_capability_gates'::regclass
      and (actual.indexprs is not null or actual.indpred is not null
        or not actual.indisvalid or not actual.indisready or not actual.indisunique
        or array(select unnest(actual.indclass)) is distinct from array[
          (select oid from pg_catalog.pg_opclass where opcname='text_ops'
            and opcnamespace='pg_catalog'::regnamespace
            and opcmethod=(select oid from pg_catalog.pg_am where amname='btree')),
          (select oid from pg_catalog.pg_opclass where opcname='text_ops'
            and opcnamespace='pg_catalog'::regnamespace
            and opcmethod=(select oid from pg_catalog.pg_am where amname='btree'))
        ]::oid[]
        or pg_catalog.pg_get_indexdef(actual.indexrelid,0,false) is distinct from
          'CREATE UNIQUE INDEX equora_runtime_capability_gates_pkey ON public.equora_runtime_capability_gates USING btree (capability_key, contract_version)')
  ) then raise exception 'TRADE_IMPORT_DEACTIVATION_INDEX_EFFECTS_INVALID'; end if;
  -- Unanalyzed expression statistics can execute at SELECT planning time.
  -- No extended statistics belong to this target's release contract.
  if exists (
    select 1 from pg_catalog.pg_statistic_ext
    where stxrelid='public.equora_runtime_capability_gates'::regclass
  ) then raise exception 'TRADE_IMPORT_DEACTIVATION_STATISTICS_EFFECTS_INVALID'; end if;
  if exists (
    select 1 from pg_catalog.pg_constraint actual
    left join (values
      ('equora_runtime_capability_gates_activation_check',
       $checkdef$CHECK (((enabled AND (activated_at IS NOT NULL)) OR ((NOT enabled) AND (activated_at IS NULL))))$checkdef$),
      ('equora_runtime_capability_gates_contract_check',
       $checkdef$CHECK (((char_length(contract_version) >= 3) AND (char_length(contract_version) <= 120)))$checkdef$),
      ('equora_runtime_capability_gates_key_check',
       $checkdef$CHECK (((char_length(capability_key) >= 3) AND (char_length(capability_key) <= 80)))$checkdef$)
    ) expected(constraint_name,definition)
      on actual.conname = expected.constraint_name
    where actual.conrelid = 'public.equora_runtime_capability_gates'::regclass
      and actual.contype = 'c'
      and (expected.constraint_name is null
        or not actual.conislocal or actual.coninhcount <> 0 or actual.connoinherit
        or pg_catalog.pg_get_constraintdef(actual.oid,false)
          is distinct from expected.definition ||
            case when actual.convalidated then '' else ' NOT VALID' end)
  ) then raise exception 'TRADE_IMPORT_DEACTIVATION_CHECK_EFFECTS_INVALID'; end if;
  perform pg_catalog.set_config('search_path','',true);

  -- The table lock has already serialized admitted imports and target DDL.
  begin
    select enabled, activated_at into strict v_enabled, v_activated_at
    from public.equora_runtime_capability_gates
    where capability_key = 'journal_file_import_persistence_v2'
      and contract_version = 'equora-broker-file-import-capability-v1'
    for update;
  exception
    when no_data_found then raise exception 'TRADE_IMPORT_DEACTIVATION_GATE_MISSING';
    when too_many_rows then raise exception 'TRADE_IMPORT_DEACTIVATION_GATE_AMBIGUOUS';
  end;

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
        and contract_version = 'equora-broker-file-import-capability-v1') <> 1
    or (select count(*) from public.equora_runtime_capability_gates
      where capability_key = 'journal_file_import_persistence_v2'
        and contract_version = 'equora-broker-file-import-capability-v1'
        and not enabled and activated_at is null) <> 1
  then raise exception 'TRADE_IMPORT_DEACTIVATION_CAS_FAILED'; end if;
end;
$equora_v5762_deactivate$;

commit;
\echo 'v57.62.0 trade-import deactivation COMMITTED; database gate disabled.'
