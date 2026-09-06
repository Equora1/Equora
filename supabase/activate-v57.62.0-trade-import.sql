\set ON_ERROR_STOP on
\pset pager off

-- Separate hard gate requiring explicit production authorization.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
set local idle_in_transaction_session_timeout = '45s';

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
