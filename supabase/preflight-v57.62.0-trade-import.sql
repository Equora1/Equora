\set ON_ERROR_STOP on
\pset pager off

begin transaction read only;

set local statement_timeout = '45s';
set local idle_in_transaction_session_timeout = '60s';

select current_database() as database_name,
  current_user as migration_user,
  current_setting('server_version') as postgres_version,
  clock_timestamp() as checked_at;

select (
  current_user = 'postgres'
  and current_setting('server_version_num')::integer >= 160000
  and has_schema_privilege(current_user, 'public', 'create')
  and has_schema_privilege(current_user, 'equora_private', 'usage')
  and has_table_privilege(
    current_user,
    'equora_private.schema_migrations',
    'select'
  )
  and has_table_privilege(
    current_user,
    'equora_private.schema_migrations',
    'insert'
  )
) as v5762_executor_valid
\gset
\if :v5762_executor_valid
\else
  \echo 'NO-GO: v57.62.0 benötigt den gepinnten postgres-Migrationsexecutor und PostgreSQL 16+.'
  do $fail$ begin
    raise exception 'TRADE_IMPORT_PREFLIGHT_EXECUTOR_INVALID';
  end $fail$;
\endif

select (
  (select count(*)
   from (values
    ('equora_v57.61.0_broker_capture_v1',
      '492ebad5496806ad60425abd58e9801c58a58b421e38392d54e6082d7fa2b083'),
    ('equora_v57.61.0_g1_capture_control_v1',
      'c133d5e0c987e7f927963db4465ef5ab2f6f4c174cfdc96a3ed1cffb5cd62be5'),
    ('equora_v57.61.0_g1_lane_authority_v1',
      '6be313155e81e0f14c48d0c71301e28a75b792a90e49542bc49ffe638f56c68d'),
    ('equora_v57.61.0_g1_activation_authority_v1',
      'b074a756a015b34a7e3da804f3d3955100a40f9a6391855a75c1e415cbbb2abb'),
    ('equora_v57.61.0_g1_scheduler_control_v2',
      '87158546782b900817d3f36501a2e43b5619906a2f07636d0cb1167b042e5ab7'),
    ('equora_v57.61.0_g1_runtime_deployment_v1',
      '892f1587e8e37937a538dad1239ec931d43bd1f65d2f224d56ab7b9356f89e96'),
    ('equora_v57.61.0_broker_provider_rls_v1',
      'd72047ce5e28e1400869a9abdcdad650a4f1b3b11e1e1b7cb07a9b37157eca47')
   ) expected(migration_id, contract_fingerprint)
   join equora_private.schema_migrations actual
     using (migration_id, contract_fingerprint)) = 7
  and (select count(*)
       from equora_private.schema_migrations
       where migration_id like 'equora_v57.61.0%') = 7
  and to_regclass('public.trades') is not null
  and to_regclass('public.trade_import_batches') is not null
  and to_regprocedure(
    'public.equora_import_trades_v1(uuid,jsonb,jsonb)'
  ) is not null
) as v5762_base_valid
\gset
\if :v5762_base_valid
\else
  \echo 'NO-GO: Ziel besitzt nicht den exakten v57.61.0-Sieben-Marker-Vorgänger.'
  do $fail$ begin
    raise exception 'TRADE_IMPORT_PREFLIGHT_BASE_INVALID';
  end $fail$;
\endif

select count(*)::bigint as v5762_pre_trades_count
from public.trades
\gset
select count(*)::bigint as v5762_pre_batches_count
from public.trade_import_batches
\gset

select exists (
    select 1
    from equora_private.schema_migrations
    where migration_id =
      'equora_v57.62.0_trade_import_persistence_v1'
  ) as v5762_marker_present,
  exists (
    select 1
    from equora_private.schema_migrations
    where migration_id =
      'equora_v57.62.0_trade_import_persistence_v1'
      and contract_fingerprint =
        '014731e263ec2f0ffc9b0e16962b5d5574516a0c975a1713580740fa3bc6413d'
  ) as v5762_marker_exact,
  exists (
    select 1
    from equora_private.schema_migrations
    where migration_id like 'equora_v57.62.0%'
      and migration_id <>
        'equora_v57.62.0_trade_import_persistence_v1'
  ) as v5762_unknown_marker_present
\gset

\if :v5762_unknown_marker_present
  \echo 'NO-GO: Unbekannter v57.62.0-Marker erkannt.'
  do $fail$ begin
    raise exception 'TRADE_IMPORT_PREFLIGHT_UNKNOWN_MARKER';
  end $fail$;
\endif

\if :v5762_marker_present
  \if :v5762_marker_exact
    \set v5762_apply_required false
    \ir verify-v57.62.0-trade-import.sql
  \else
    \echo 'NO-GO: v57.62.0-Marker besitzt einen unbekannten Fingerprint.'
    do $fail$ begin
      raise exception 'TRADE_IMPORT_PREFLIGHT_MARKER_DRIFT';
    end $fail$;
  \endif
\else
  \set v5762_apply_required true
  select (
    to_regclass('public.equora_runtime_capability_gates') is null
    and to_regclass('public.journal_import_accounts') is null
    and to_regclass('public.trade_import_source_keys') is null
    and to_regprocedure(
      'public.equora_upsert_import_account_v1(uuid,text,text,text)'
    ) is null
    and to_regprocedure(
      'public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)'
    ) is null
    and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and (
          (table_name = 'trades' and column_name = 'import_account_id')
          or (
            table_name = 'trade_import_batches'
            and column_name in (
              'import_account_id', 'request_digest', 'source_manifest',
              'source_manifest_digest', 'source_row_count', 'invalid_count'
            )
          )
        )
    )
  ) as v5762_clean_predecessor
  \gset
  \if :v5762_clean_predecessor
  \else
    \echo 'NO-GO: Markerloser Teil- oder Driftstand der v57.62.0-Importmigration erkannt.'
    do $fail$ begin
      raise exception 'TRADE_IMPORT_PREFLIGHT_PARTIAL_STATE';
    end $fail$;
  \endif
\endif

rollback;

\echo 'v57.62.0 trade-import preflight PASS; apply_required=' :v5762_apply_required
