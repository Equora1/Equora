\set ON_ERROR_STOP on
\pset pager off

-- Separate hard gate requiring explicit production authorization.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
set local idle_in_transaction_session_timeout = '45s';

-- Stabilize the target before either verifier or row lock; the read-only
-- verifier itself must remain usable without a write-conflicting table lock.
do $equora_v5762_activation_lock$
begin
  if current_user <> 'postgres' then
    raise exception 'TRADE_IMPORT_ACTIVATION_EXECUTOR_INVALID';
  end if;
  -- FOR ALL TABLES and FOR TABLES IN SCHEMA require a superuser. Bind the
  -- release executor to the non-superuser boundary: it must neither be a
  -- superuser nor inherit one. Concurrent external superuser DDL cannot be
  -- serialized by this role and is therefore an explicit operational freeze
  -- precondition. Relation-bound publication DDL remains serialized by the
  -- target locks below.
  if exists (
    select 1 from pg_catalog.pg_roles role_row
    where role_row.rolname = current_user
      and role_row.rolsuper
  ) or exists (
    select 1 from pg_catalog.pg_roles role_row
    where role_row.rolsuper
      and pg_catalog.pg_has_role(current_user, role_row.oid, 'MEMBER')
  ) then
    raise exception 'TRADE_IMPORT_ACTIVATION_EXECUTOR_PRIVILEGE_INVALID';
  end if;
  -- Stabilize the migration family guard in the same transaction as the gate
  -- update. Every receipt INSERT/UPDATE takes ROW EXCLUSIVE and must wait.
  lock table only equora_private.schema_migrations
    in share row exclusive mode;
  lock table only public.equora_runtime_capability_gates
    in exclusive mode;
  -- Bind both SECURITY DEFINER write targets against trigger, rule, index,
  -- inheritance and statistics DDL. These modes remain compatible with normal
  -- row writers. Keep migrations -> gate -> account -> source until COMMIT.
  lock table only public.journal_import_accounts
    in share update exclusive mode;
  lock table only public.trade_import_source_keys
    in share update exclusive mode;
end;
$equora_v5762_activation_lock$;

do $equora_v5762_activation_marker_guard$
begin
  if exists (
    select 1
    from equora_private.schema_migrations
    where migration_id like 'equora_v57.62.0%'
      and migration_id <>
        'equora_v57.62.0_trade_import_persistence_v1'
  ) then
    raise exception 'TRADE_IMPORT_ACTIVATION_UNKNOWN_MARKER';
  end if;
end;
$equora_v5762_activation_marker_guard$;

\ir verify-v57.62.0-trade-import.sql

do $equora_v5762_activate$
declare
  v_enabled boolean;
  v_activated_at timestamptz;
begin
  select enabled, activated_at into v_enabled, v_activated_at
  from public.equora_runtime_capability_gates
  where capability_key = 'journal_file_import_persistence_v2'
    and contract_version = 'equora-broker-file-import-capability-v1'
  for update;
  if not found then
    raise exception 'TRADE_IMPORT_ACTIVATION_GATE_MISSING';
  elsif v_enabled and v_activated_at is not null then
    raise notice 'Trade-import persistence gate already enabled; no effect.';
  elsif not v_enabled and v_activated_at is null then
    update public.equora_runtime_capability_gates
    set enabled = true, activated_at = transaction_timestamp(),
        updated_at = transaction_timestamp()
    where capability_key = 'journal_file_import_persistence_v2'
      and contract_version = 'equora-broker-file-import-capability-v1'
      and not enabled and activated_at is null;
    if not found then raise exception 'TRADE_IMPORT_ACTIVATION_CAS_FAILED'; end if;
  else
    raise exception 'TRADE_IMPORT_ACTIVATION_GATE_DRIFT';
  end if;
end;
$equora_v5762_activate$;

-- Verify within the same transaction. Global journal counters cannot attribute
-- concurrent user writes to this gate-only operation and are not used here.
\ir verify-v57.62.0-trade-import.sql
commit;
\echo 'v57.62.0 trade-import activation COMMITTED; database gate enabled.'
