\set ON_ERROR_STOP on
\pset pager off

begin transaction read only;

\if :{?equora_baseline_trade_count}
\else
  \echo 'NO-GO: Postflight muss in derselben psql-Sitzung wie der Preflight laufen.'
  do $fail$ begin raise exception 'POSTFLIGHT_BASELINE_EVIDENCE_MISSING'; end $fail$;
\endif

select migration_id, contract_fingerprint, applied_at
from equora_private.schema_migrations
where migration_id in (
  'equora_v57.61.0_broker_capture_v1',
  'equora_v57.61.0_g1_capture_control_v1',
  'equora_v57.61.0_g1_lane_authority_v1',
  'equora_v57.61.0_g1_activation_authority_v1',
  'equora_v57.61.0_g1_scheduler_control_v2',
  'equora_v57.61.0_g1_runtime_deployment_v1'
)
order by migration_id;

with expected(migration_id, contract_fingerprint) as (values
  ('equora_v57.61.0_broker_capture_v1',
    'ab08958bdeb88b9637351e2690c08f311d1653f3dba33d4cf11c61d4a81399b6'),
  ('equora_v57.61.0_g1_capture_control_v1',
    '6560d159d0756f83049a0e89834b2897ce58dae3fe2c112ae0f2aa159b9caf27'),
  ('equora_v57.61.0_g1_lane_authority_v1',
    '955a175d3b05c34f680b94d54a494261d0a51dca2ecaba8ddf2311c20b9bcae5'),
  ('equora_v57.61.0_g1_activation_authority_v1',
    'ef73a48fb05299c4e78908fd1771c61ca1b8241b629cf31bc7f89af594d66c2c'),
  ('equora_v57.61.0_g1_scheduler_control_v2',
    '87158546782b900817d3f36501a2e43b5619906a2f07636d0cb1167b042e5ab7'),
  ('equora_v57.61.0_g1_runtime_deployment_v1',
    'e78049f738ed26d4ab96188f4da1c52ae00a2b3583db5aeaf4be608cdcc95457')
)
select count(actual.migration_id) = 6 as all_v57610_markers_present
from expected
left join equora_private.schema_migrations actual
  on actual.migration_id = expected.migration_id
  and actual.contract_fingerprint = expected.contract_fingerprint
\gset

\if :all_v57610_markers_present
\else
  \echo 'NO-GO: Nicht alle sechs v57.61.0-Migrationsmarker sind vorhanden.'
  do $fail$ begin raise exception 'POSTFLIGHT_MIGRATION_MARKER_MISSING'; end $fail$;
\endif

select relname, relrowsecurity, owner_role.rolname as owner
from pg_class relation_row
join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
join pg_roles owner_role on owner_role.oid = relation_row.relowner
where namespace_row.nspname = 'public'
  and relation_row.relname in (
    'broker_connection_setup_commands',
    'broker_capture_scope_finalization_receipts'
  )
order by relname;

with expected_function(signature, runtime_role) as (values
  ('public.equora_request_mexc_connection_setup_v1(uuid,text,jsonb,boolean)',
    'authenticated'),
  ('public.equora_apply_mexc_connection_setup_v1(uuid,text,text,text,text,text)',
    'service_role'),
  ('public.equora_request_mexc_connection_revocation_v1(uuid,uuid)',
    'authenticated'),
  ('public.equora_apply_mexc_connection_revocation_v1(uuid)',
    'service_role'),
  ('public.equora_find_claimable_broker_capture_work_unit_v1()',
    'service_role'),
  ('public.equora_find_pending_yielded_broker_capture_work_unit_v1()',
    'service_role'),
  ('public.equora_find_pending_broker_capture_scope_finalization_v1()',
    'service_role'),
  ('public.equora_load_broker_capture_material_v1(uuid)',
    'service_role'),
  ('public.equora_finalize_broker_capture_scope_v1(uuid,uuid)',
    'service_role')
), expected_table(relation_name) as (values
  ('broker_connection_setup_commands'),
  ('broker_capture_scope_finalization_receipts')
)
select (
  not exists (
    select 1
    from expected_function expected
    left join pg_proc procedure_row
      on procedure_row.oid = to_regprocedure(expected.signature)
    left join pg_roles owner_row on owner_row.oid = procedure_row.proowner
    where procedure_row.oid is null
      or procedure_row.prosecdef is distinct from true
      or owner_row.rolname is distinct from 'equora_broker_capture_owner'
      or not has_function_privilege(
        expected.runtime_role, procedure_row.oid, 'execute'
      )
  )
  and not exists (
    select 1
    from expected_function expected
    join pg_proc procedure_row
      on procedure_row.oid = to_regprocedure(expected.signature)
    cross join lateral aclexplode(coalesce(
      procedure_row.proacl, acldefault('f', procedure_row.proowner)
    )) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where exploded.privilege_type = 'EXECUTE'
      and exploded.grantee <> procedure_row.proowner
      and (
        grantee_row.rolname is distinct from expected.runtime_role
        or exploded.is_grantable
      )
  )
  and not exists (
    select 1
    from expected_table expected
    left join pg_class relation_row
      on relation_row.oid = to_regclass('public.' || expected.relation_name)
    left join pg_roles owner_row on owner_row.oid = relation_row.relowner
    where relation_row.oid is null
      or relation_row.relrowsecurity is distinct from true
      or owner_row.rolname is distinct from 'equora_broker_capture_owner'
  )
  and not exists (
    select 1
    from expected_table expected
    join pg_class relation_row
      on relation_row.oid = to_regclass('public.' || expected.relation_name)
    cross join lateral aclexplode(coalesce(
      relation_row.relacl, acldefault('r', relation_row.relowner)
    )) exploded
    where exploded.grantee <> relation_row.relowner
  )
  and not has_table_privilege('service_role',
    'public.broker_credentials', 'select')
  and not has_table_privilege('authenticated',
    'public.broker_credentials', 'select')
  and not has_table_privilege('anon',
    'public.broker_credentials', 'select')
  and not has_table_privilege('service_role',
    'equora_private.broker_capture_integrity_keys', 'select')
) as runtime_acl_closed
\gset

\if :runtime_acl_closed
\else
  \echo 'NO-GO: Runtime-RPC- oder Secret-Tabellen-ACL ist nicht geschlossen.'
  do $fail$ begin raise exception 'POSTFLIGHT_RUNTIME_ACL_INVALID'; end $fail$;
\endif

\ir verify-v57.61.0-contract.sql

select count(*)::bigint = :'equora_baseline_trade_count'::bigint
  as journal_trade_count_unchanged
from public.trades
\gset
\if :journal_trade_count_unchanged
\else
  \echo 'NO-GO: Migration hat die Anzahl der Journal-Trades verändert.'
  do $fail$ begin raise exception 'POSTFLIGHT_TRADE_COUNT_DRIFT'; end $fail$;
\endif

select
  (select count(*) from public.trades) as postflight_trade_count,
  (select count(*) from public.broker_connection_setup_commands) as setup_command_count,
  (select count(*) from public.broker_capture_work_units) as work_unit_count,
  (select count(*) from public.broker_capture_scope_finalization_receipts)
    as finalization_receipt_count;

\echo 'POSTFLIGHT PASS: sechs Marker, globaler Semantikvertrag, Runtime-ACL und Journal-Tradezahl sind unverÃ¤ndert geschlossen.'

commit;
