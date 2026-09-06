\set ON_ERROR_STOP on
\pset pager off

begin transaction read only;

set local statement_timeout = '45s';
set local idle_in_transaction_session_timeout = '60s';

\ir verify-v57.62.0-trade-import.sql

\if :{?v5762_pre_trades_count}
\else
  do $fail$ begin
    raise exception 'TRADE_IMPORT_POSTFLIGHT_BASELINE_MISSING';
  end $fail$;
\endif
\if :{?v5762_pre_batches_count}
\else
  do $fail$ begin
    raise exception 'TRADE_IMPORT_POSTFLIGHT_BASELINE_MISSING';
  end $fail$;
\endif

select (
  (select count(*) from public.trades) =
    :'v5762_pre_trades_count'::bigint
  and (select count(*) from public.trade_import_batches) =
    :'v5762_pre_batches_count'::bigint
) as v5762_existing_row_counts_unchanged
\gset
\if :v5762_existing_row_counts_unchanged
\else
  \echo 'NO-GO: Zähler weichen vom Preflight ab; parallele Journalaktionen separat prüfen. Keine Rollbackbehauptung.'
  do $fail$ begin
    raise exception 'TRADE_IMPORT_POSTFLIGHT_EXISTING_DATA_CHANGED';
  end $fail$;
\endif

select capability_key,
  contract_version,
  enabled,
  activated_at,
  updated_at
from public.equora_runtime_capability_gates
where capability_key = 'journal_file_import_persistence_v2'
  and contract_version = 'equora-broker-file-import-capability-v1';

select count(*) as import_account_count
from public.journal_import_accounts;
select count(*) as source_key_count
from public.trade_import_source_keys;

rollback;

\echo 'v57.62.0 trade-import postflight PASS.'
