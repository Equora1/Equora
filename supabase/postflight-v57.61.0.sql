\set ON_ERROR_STOP on
\pset pager off

begin transaction read only;

\if :{?equora_baseline_trade_count}
\else
  \echo 'NO-GO: Postflight muss in derselben psql-Sitzung wie der Preflight laufen.'
  do $fail$ begin raise exception 'POSTFLIGHT_BASELINE_EVIDENCE_MISSING'; end $fail$;
\endif

\if :{?equora_auth_schema_acl_digest}
\else
  \echo 'NO-GO: Auth-Schema-ACL-Evidenz aus dem Preflight fehlt.'
  do $fail$ begin raise exception 'POSTFLIGHT_AUTH_SCHEMA_EVIDENCE_MISSING'; end $fail$;
\endif
\if :{?equora_auth_uid_acl_digest}
\else
  \echo 'NO-GO: auth.uid()-ACL-Evidenz aus dem Preflight fehlt.'
  do $fail$ begin raise exception 'POSTFLIGHT_AUTH_UID_EVIDENCE_MISSING'; end $fail$;
\endif

select (
    select md5(
      owner_row.rolname || E'\n' || coalesce(string_agg(
        coalesce(grantee_row.rolname, 'PUBLIC') || '|'
          || exploded.privilege_type || '|' || exploded.is_grantable::text,
        E'\n' order by coalesce(grantee_row.rolname, 'PUBLIC'),
          exploded.privilege_type, exploded.is_grantable
      ), '')
    )
    from pg_namespace namespace_row
    join pg_roles owner_row on owner_row.oid = namespace_row.nspowner
    cross join lateral aclexplode(coalesce(
      namespace_row.nspacl, acldefault('n', namespace_row.nspowner)
    )) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where namespace_row.nspname = 'auth'
    group by owner_row.rolname
  ) = :'equora_auth_schema_acl_digest'
  and (
    select md5(
      owner_row.rolname || E'\n' || coalesce(string_agg(
        coalesce(grantee_row.rolname, 'PUBLIC') || '|'
          || exploded.privilege_type || '|' || exploded.is_grantable::text,
        E'\n' order by coalesce(grantee_row.rolname, 'PUBLIC'),
          exploded.privilege_type, exploded.is_grantable
      ), '')
    )
    from pg_proc procedure_row
    join pg_roles owner_row on owner_row.oid = procedure_row.proowner
    cross join lateral aclexplode(coalesce(
      procedure_row.proacl, acldefault('f', procedure_row.proowner)
    )) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where procedure_row.oid = 'auth.uid()'::regprocedure
    group by owner_row.rolname
  ) = :'equora_auth_uid_acl_digest'
  as auth_platform_acl_unchanged
\gset
\if :auth_platform_acl_unchanged
\else
  \echo 'NO-GO: Migration hat die Supabase-auth-Plattform-ACL veraendert.'
  do $fail$ begin raise exception 'POSTFLIGHT_AUTH_PLATFORM_ACL_DRIFT'; end $fail$;
\endif

select migration_id, contract_fingerprint, applied_at
from equora_private.schema_migrations
where migration_id in (
  'equora_v57.61.0_broker_capture_v1',
  'equora_v57.61.0_g1_capture_control_v1',
  'equora_v57.61.0_g1_lane_authority_v1',
  'equora_v57.61.0_g1_activation_authority_v1',
  'equora_v57.61.0_g1_scheduler_control_v2',
  'equora_v57.61.0_g1_runtime_deployment_v1',
  'equora_v57.61.0_broker_provider_rls_v1'
)
order by migration_id;

with expected(migration_id, contract_fingerprint) as (values
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
)
select count(actual.migration_id) = 7
  and (
    select count(*) from equora_private.schema_migrations marker
    where marker.migration_id like 'equora_v57.61.0%'
  ) = 7
  and not exists (
    select 1 from equora_private.schema_migrations marker
    where marker.migration_id like 'equora_v57.61.0%'
      and not exists (
        select 1 from expected
        where expected.migration_id = marker.migration_id
      )
  ) as all_v57610_markers_present
from expected
left join equora_private.schema_migrations actual
  on actual.migration_id = expected.migration_id
  and actual.contract_fingerprint = expected.contract_fingerprint
\gset

\if :all_v57610_markers_present
\else
  \echo 'NO-GO: Nicht alle sieben v57.61.0-Migrationsmarker sind vorhanden.'
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

-- The Hosted migration executor is deliberately not a member of the NOLOGIN
-- authority owner and therefore cannot read its private runtime tables. The
-- exact catalog contract above proves those tables without weakening ACLs.
select count(*) as postflight_trade_count
from public.trades;

\echo 'POSTFLIGHT PASS: sieben Marker, globaler Semantikvertrag, Runtime-ACL und Journal-Tradezahl sind unverändert geschlossen.'

commit;
