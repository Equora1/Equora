\set ON_ERROR_STOP on
\pset pager off

begin transaction read only;

select current_database() as database_name,
  current_user as migration_user,
  current_setting('server_version') as postgres_version,
  clock_timestamp() as checked_at;

select current_setting('server_version_num')::integer >= 160000
  as postgres_16_or_newer
\gset
\if :postgres_16_or_newer
\else
  \echo 'NO-GO: Equora v57.61.0 benötigt PostgreSQL 16 oder neuer.'
  do $fail$ begin raise exception 'PREFLIGHT_POSTGRES_VERSION_UNSUPPORTED'; end $fail$;
\endif

select (
  has_schema_privilege(current_user, 'public', 'create')
  and has_database_privilege(current_user, current_database(), 'create')
  and exists (
    select 1
    from pg_roles executor_role
    where executor_role.rolname = current_user
      and executor_role.rolcreaterole
      and executor_role.rolbypassrls
      -- All ownership repair is pinned to postgres. A non-superuser executor
      -- is supported only when it is that exact Supabase platform role.
      and (executor_role.rolsuper or executor_role.rolname = 'postgres')
  )
  and exists (
    select 1 from pg_available_extensions where name = 'pgcrypto'
  )
) as executor_capable
\gset
\if :executor_capable
\else
  \echo 'NO-GO: Migrationsexecutor besitzt nicht alle benötigten Schema-/Rollen-/Extension-Rechte.'
  do $fail$ begin raise exception 'PREFLIGHT_EXECUTOR_CAPABILITY_INVALID'; end $fail$;
\endif

-- Supabase's standard non-grantable defaults for anon/authenticated/
-- service_role are expected and each layer revokes/reapplies its closed
-- runtime ACL. Bind object kind and privilege together: merely recognizing a
-- platform role is insufficient because a schema CREATE default would become
-- DDL authority as soon as an early layer creates a schema. PUBLIC is safe
-- only for PostgreSQL's function EXECUTE default.
select not exists (
  select 1
  from pg_default_acl default_acl
  join pg_roles default_owner on default_owner.oid = default_acl.defaclrole
  left join pg_namespace default_namespace
    on default_namespace.oid = default_acl.defaclnamespace
  cross join lateral aclexplode(default_acl.defaclacl) exploded
  left join pg_roles grantee_role on grantee_role.oid = exploded.grantee
  where default_owner.rolname = current_user
    and (
      default_acl.defaclnamespace = 0
      or default_namespace.nspname in (
        'public', 'equora_private', 'extensions'
      )
    )
    and exploded.grantee <> default_acl.defaclrole
    and not (
      exploded.is_grantable is false
      and (
        (
          exploded.grantee = 0
          and default_acl.defaclobjtype = 'f'
          and exploded.privilege_type = 'EXECUTE'
        )
        or (
          coalesce(grantee_role.rolname, '<missing-role>') in (
            'anon', 'authenticated', 'service_role'
          )
          and (
            (
              default_acl.defaclobjtype = 'r'
              and exploded.privilege_type in (
                'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                'REFERENCES', 'TRIGGER', 'MAINTAIN'
              )
            )
            or (
              default_acl.defaclobjtype = 'S'
              and exploded.privilege_type in ('USAGE', 'SELECT', 'UPDATE')
            )
            or (
              default_acl.defaclobjtype = 'f'
              and exploded.privilege_type = 'EXECUTE'
            )
            or (
              default_acl.defaclobjtype = 'T'
              and exploded.privilege_type = 'USAGE'
            )
            or (
              default_acl.defaclobjtype = 'n'
              and exploded.privilege_type = 'USAGE'
            )
          )
        )
      )
    )
) as default_acl_safe
\gset
\if :default_acl_safe
\else
  \echo 'NO-GO: Nicht erlaubte Default-ACL wuerde neue Brokerobjekte vor dem Postflight freigeben.'
  do $fail$ begin raise exception 'PREFLIGHT_DEFAULT_ACL_INVALID'; end $fail$;
\endif

-- pgcrypto may already live in public on a restored Supabase project or may
-- be installed into extensions by Layer 1. Validate the actual/prospective
-- namespace before any v57.61.0 DDL: only known platform owners/grantees are
-- accepted, API roles can never CREATE there, and no non-owner grant option is
-- allowed. The migration deliberately does not rewrite platform-managed ACLs.
with pgcrypto_target as (
  select coalesce((
      select namespace_row.nspname
      from pg_extension extension_row
      join pg_namespace namespace_row
        on namespace_row.oid = extension_row.extnamespace
      where extension_row.extname = 'pgcrypto'
    ), 'extensions') as schema_name,
    exists (
      select 1 from pg_extension where extname = 'pgcrypto'
    ) as extension_installed
), target_namespace as (
  select target.schema_name, target.extension_installed,
    namespace_row.oid as namespace_oid,
    owner_row.rolname as owner_name
  from pgcrypto_target target
  left join pg_namespace namespace_row
    on namespace_row.nspname = target.schema_name
  left join pg_roles owner_row on owner_row.oid = namespace_row.nspowner
)
select (
  target.schema_name in ('public', 'extensions')
  and (not target.extension_installed or target.namespace_oid is not null)
  and case when target.namespace_oid is null then true else
    target.owner_name in ('postgres', 'supabase_admin', 'pg_database_owner')
    and not exists (
      select 1
      from pg_namespace namespace_row
      cross join lateral aclexplode(coalesce(
        namespace_row.nspacl, acldefault('n', namespace_row.nspowner)
      )) exploded
      left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
      where namespace_row.oid = target.namespace_oid
        and exploded.grantee <> namespace_row.nspowner
        and not (
          exploded.is_grantable is false
          and (
            (
              target.schema_name = 'public'
              and coalesce(grantee_row.rolname, 'PUBLIC') = 'PUBLIC'
              and exploded.privilege_type = 'USAGE'
            )
            or (
              coalesce(grantee_row.rolname, 'PUBLIC') in (
                'anon', 'authenticated', 'service_role', 'authenticator',
                'supabase_auth_admin'
              )
              and exploded.privilege_type = 'USAGE'
            )
            or (
              coalesce(grantee_row.rolname, 'PUBLIC') in (
                'postgres', 'supabase_admin', 'dashboard_user'
              )
              and exploded.privilege_type in ('USAGE', 'CREATE')
            )
            or (
              target.schema_name = 'public'
              and coalesce(grantee_row.rolname, 'PUBLIC') =
                'equora_broker_capture_owner'
              and exploded.privilege_type = 'USAGE'
            )
          )
        )
    )
    and not has_schema_privilege('anon', target.schema_name, 'create')
    and not has_schema_privilege(
      'authenticated', target.schema_name, 'create'
    )
    and not has_schema_privilege('service_role', target.schema_name, 'create')
    and (
      target.schema_name = 'public'
      or not exists (
        select 1
        from pg_roles capture_owner
        where capture_owner.rolname = 'equora_broker_capture_owner'
          and has_schema_privilege(
            capture_owner.oid, target.namespace_oid, 'usage'
          )
      )
    )
  end
) as pgcrypto_namespace_secure
from target_namespace target
\gset
\if :pgcrypto_namespace_secure
\else
  \echo 'NO-GO: pgcrypto-Namespace-Owner/ACL ist nicht geschlossen.'
  do $fail$ begin raise exception 'PREFLIGHT_PGCRYPTO_SECURITY_INVALID'; end $fail$;
\endif

-- Supabase's auth schema is platform-managed and may legitimately have a
-- different owner than the local stub. Validate a closed allowlist and the
-- precise grant/reference capabilities needed later before any v57.61.0 DDL
-- can commit. Unknown schema grantees or CREATE authority fail closed.
with platform_objects as (
  select (
      select procedure_row.oid
      from pg_proc procedure_row
      join pg_namespace namespace_row
        on namespace_row.oid = procedure_row.pronamespace
      where namespace_row.nspname = 'auth'
        and procedure_row.proname = 'uid'
        and procedure_row.pronargs = 0
      order by procedure_row.oid
      limit 1
    ) as uid_oid,
    (
      select relation_row.oid
      from pg_class relation_row
      join pg_namespace namespace_row
        on namespace_row.oid = relation_row.relnamespace
      where namespace_row.nspname = 'auth'
        and relation_row.relname = 'users'
        and relation_row.relkind in ('r', 'p')
      order by relation_row.oid
      limit 1
    ) as users_oid
)
select (
  exists (select 1 from pg_namespace where nspname = 'auth')
  and platform_objects.users_oid is not null
  and platform_objects.uid_oid is not null
  and exists (
    select 1
    from pg_namespace namespace_row
    join pg_roles owner_row on owner_row.oid = namespace_row.nspowner
    where namespace_row.nspname = 'auth'
      and owner_row.rolname in (
        'postgres', 'supabase_admin', 'supabase_auth_admin'
      )
  )
  and not exists (
    select 1
    from pg_proc procedure_row
    cross join lateral aclexplode(coalesce(
      procedure_row.proacl, acldefault('f', procedure_row.proowner)
    )) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where procedure_row.oid = platform_objects.uid_oid
      and exploded.grantee <> procedure_row.proowner
      and (
        exploded.privilege_type <> 'EXECUTE'
        or exploded.is_grantable
        or coalesce(grantee_row.rolname, 'PUBLIC') not in (
          'PUBLIC', 'anon', 'authenticated', 'service_role', 'authenticator',
          'dashboard_user', 'postgres', 'supabase_admin',
          'supabase_auth_admin'
        )
      )
  )
  and not exists (
    select 1
    from pg_namespace namespace_row
    cross join lateral aclexplode(coalesce(
      namespace_row.nspacl, acldefault('n', namespace_row.nspowner)
    )) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where namespace_row.nspname = 'auth'
      and exploded.grantee <> namespace_row.nspowner
      and not (
        exploded.is_grantable = false
        and (
          (
            coalesce(grantee_row.rolname, 'PUBLIC') in (
              'anon', 'authenticated', 'service_role', 'authenticator'
            )
            and exploded.privilege_type = 'USAGE'
          )
          or (
            coalesce(grantee_row.rolname, 'PUBLIC') = 'dashboard_user'
            and exploded.privilege_type in ('USAGE', 'CREATE')
          )
          or (
            coalesce(grantee_row.rolname, 'PUBLIC') in (
              'postgres', 'supabase_admin', 'supabase_auth_admin'
            )
            and exploded.privilege_type in ('USAGE', 'CREATE')
          )
        )
      )
  )
  and exists (
    select 1
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    join pg_roles owner_row on owner_row.oid = procedure_row.proowner
    where procedure_row.oid = platform_objects.uid_oid
      and namespace_row.nspname = 'auth'
      and procedure_row.prorettype = 'uuid'::regtype
      and owner_row.rolname in (
        'postgres', 'supabase_admin', 'supabase_auth_admin'
      )
  )
  and exists (
    select 1
    from pg_attribute attribute_row
    where attribute_row.attrelid = platform_objects.users_oid
      and attribute_row.attname = 'id'
      and attribute_row.atttypid = 'uuid'::regtype
      and attribute_row.attnotnull
      and not attribute_row.attisdropped
  )
  and exists (
    select 1
    from pg_constraint constraint_row
    join pg_attribute attribute_row
      on attribute_row.attrelid = constraint_row.conrelid
      and attribute_row.attnum = any(constraint_row.conkey)
      where constraint_row.conrelid = platform_objects.users_oid
      and constraint_row.contype in ('p', 'u')
      and constraint_row.convalidated
      and cardinality(constraint_row.conkey) = 1
      and attribute_row.attname = 'id'
  )
  and has_schema_privilege(current_user, 'auth', 'usage')
  and has_function_privilege(
    current_user, platform_objects.uid_oid, 'execute'
  )
  and has_column_privilege(
    current_user, platform_objects.users_oid, 'id', 'references'
  )
) as platform_prerequisites_valid
from platform_objects
\gset
\if :platform_prerequisites_valid
\else
  \echo 'NO-GO: Supabase-auth-Owner/ACL oder Grant-/FK-Voraussetzungen sind nicht unterstuetzt.'
  do $fail$ begin raise exception 'PREFLIGHT_PLATFORM_SECURITY_INVALID'; end $fail$;
\endif

-- Bind the platform-owned auth ACLs to this psql session. The migration must
-- neither grant nor revoke anything on Supabase's auth schema or auth.uid().
select md5(
    owner_row.rolname || E'\n' || coalesce(string_agg(
      coalesce(grantee_row.rolname, 'PUBLIC') || '|'
        || exploded.privilege_type || '|' || exploded.is_grantable::text,
      E'\n' order by coalesce(grantee_row.rolname, 'PUBLIC'),
        exploded.privilege_type, exploded.is_grantable
    ), '')
  ) as equora_auth_schema_acl_digest
from pg_namespace namespace_row
join pg_roles owner_row on owner_row.oid = namespace_row.nspowner
cross join lateral aclexplode(coalesce(
  namespace_row.nspacl, acldefault('n', namespace_row.nspowner)
)) exploded
left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
where namespace_row.nspname = 'auth'
group by owner_row.rolname
\gset

select md5(
    owner_row.rolname || E'\n' || coalesce(string_agg(
      coalesce(grantee_row.rolname, 'PUBLIC') || '|'
        || exploded.privilege_type || '|' || exploded.is_grantable::text,
      E'\n' order by coalesce(grantee_row.rolname, 'PUBLIC'),
        exploded.privilege_type, exploded.is_grantable
    ), '')
  ) as equora_auth_uid_acl_digest
from pg_proc procedure_row
join pg_roles owner_row on owner_row.oid = procedure_row.proowner
cross join lateral aclexplode(coalesce(
  procedure_row.proacl, acldefault('f', procedure_row.proowner)
)) exploded
left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
where procedure_row.oid = to_regprocedure('auth.uid()')
group by owner_row.rolname
\gset

select (
  to_regclass('public.trades') is not null
  and to_regclass('public.broker_connections') is not null
  and to_regclass('public.broker_credentials') is not null
  and to_regclass('public.media_cleanup_outbox') is not null
  and to_regprocedure('public.equora_import_trades_v1(uuid,jsonb,jsonb)') is not null
  and exists (
    select 1 from pg_constraint
    where conrelid = to_regclass('public.trades')
      and conname = 'trades_monetary_values_require_currency_v57601'
      -- v57.60.1 deliberately leaves this legacy-data constraint NOT VALID:
      -- it protects every new/changed row without inventing a currency for
      -- historical rows. A validated flag here would not identify the pinned
      -- baseline; it would instead claim a separate data-remediation step.
      and convalidated = false
  )
) as v57601_structure_valid
\gset
\if :v57601_structure_valid
\else
  \echo 'NO-GO: Ziel besitzt nicht die gepinnte v57.60.1-Baseline.'
  do $fail$ begin raise exception 'PREFLIGHT_BASELINE_INVALID'; end $fail$;
\endif

select to_regclass('equora_private.schema_migrations') is not null
  as migration_table_present
\gset
\set v5761_marker_present false
\set v5761_marker_partial false
\set v5761_marker_complete false
\if :migration_table_present
  select count(*) > 0 as v5761_marker_present,
    count(*) between 1 and 5 as v5761_marker_partial,
    count(*) = 6 as v5761_marker_complete
  from equora_private.schema_migrations
  where migration_id like 'equora_v57.61.0%'
  \gset
\endif

\if :v5761_marker_partial
  \echo 'NO-GO: partieller v57.61.0-Stand erfordert Restore der geprüften v57.60.1-Baseline.'
  do $fail$ begin raise exception 'PREFLIGHT_PARTIAL_MIGRATION_RESTORE_REQUIRED'; end $fail$;
\endif

\if :v5761_marker_present
  with expected(ordinal, migration_id, contract_fingerprint) as (values
    (1, 'equora_v57.61.0_broker_capture_v1',
      '492ebad5496806ad60425abd58e9801c58a58b421e38392d54e6082d7fa2b083'),
    (2, 'equora_v57.61.0_g1_capture_control_v1',
      'c133d5e0c987e7f927963db4465ef5ab2f6f4c174cfdc96a3ed1cffb5cd62be5'),
    (3, 'equora_v57.61.0_g1_lane_authority_v1',
      '6be313155e81e0f14c48d0c71301e28a75b792a90e49542bc49ffe638f56c68d'),
    (4, 'equora_v57.61.0_g1_activation_authority_v1',
      'b074a756a015b34a7e3da804f3d3955100a40f9a6391855a75c1e415cbbb2abb'),
    (5, 'equora_v57.61.0_g1_scheduler_control_v2',
      '87158546782b900817d3f36501a2e43b5619906a2f07636d0cb1167b042e5ab7'),
    (6, 'equora_v57.61.0_g1_runtime_deployment_v1',
      '892f1587e8e37937a538dad1239ec931d43bd1f65d2f224d56ab7b9356f89e96')
  ), present as (
    select expected.ordinal, expected.migration_id,
      actual.contract_fingerprint = expected.contract_fingerprint as exact
    from expected
    join equora_private.schema_migrations actual
      on actual.migration_id = expected.migration_id
  )
  select (
    :'v5761_marker_complete'::boolean
    and
    not exists (select 1 from present where exact is distinct from true)
    and (select count(*) from present) = 6
    and not exists (
      select 1 from equora_private.schema_migrations actual
      where actual.migration_id like 'equora_v57.61.0%'
        and not exists (
          select 1 from expected where expected.migration_id = actual.migration_id
        )
    )
  ) as migration_state_resumable
  \gset
  \if :migration_state_resumable
    -- A full exact marker set is not current-state evidence. Revalidate the
    -- complete semantic contract before the driver is allowed to skip layers.
    \ir verify-v57.61.0-contract.sql
  \endif
\else
  select to_regnamespace('equora_private') is null
    as fresh_private_schema_absent
  \gset
  \if :fresh_private_schema_absent
  \else
    \echo 'NO-GO: Markerfreie Installation verlangt ein vollstaendig abwesendes equora_private-Schema.'
    do $fail$ begin raise exception 'PREFLIGHT_PRIVATE_SCHEMA_STATE_INVALID'; end $fail$;
  \endif
  \ir verify-v57.60.1-baseline.sql
  \set migration_state_resumable true
\endif
\if :migration_state_resumable
\else
  \echo 'NO-GO: v57.61.0-Marker sind unbekannt, driftend oder kein vollständiger Sechs-Marker-Satz.'
  do $fail$ begin raise exception 'PREFLIGHT_MIGRATION_STATE_INVALID'; end $fail$;
\endif

select count(*) = 0 as credentials_consistent
from public.broker_connections connection
left join public.broker_credentials credential
  on credential.id = connection.credential_reference
  and credential.user_id = connection.user_id
  and credential.provider = connection.provider
where connection.credential_reference is not null
  and credential.id is null
\gset
\if :credentials_consistent
\else
  \echo 'NO-GO: Broker-Verbindungen besitzen ungültige Credential-Referenzen.'
  do $fail$ begin raise exception 'PREFLIGHT_CREDENTIAL_REFERENCE_INVALID'; end $fail$;
\endif

select not exists (
  select 1
  from pg_class relation_row
  cross join lateral aclexplode(coalesce(
    relation_row.relacl, acldefault('r', relation_row.relowner)
  )) exploded
  left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
  where relation_row.oid = 'public.broker_credentials'::regclass
    and exploded.grantee <> relation_row.relowner
    and exploded.privilege_type = 'SELECT'
    and (
      exploded.is_grantable
      or not (
        grantee_row.rolname = 'equora_broker_capture_owner'
        or (
          :'v5761_marker_present'::boolean is false
          and grantee_row.rolname = 'service_role'
        )
      )
    )
) as credential_acl_closed
\gset
\if :credential_acl_closed
\else
  \echo 'NO-GO: Broker-Credentials besitzen einen SELECT-Grant auÃŸerhalb der dedizierten NOLOGIN-Authority.'
  do $fail$ begin raise exception 'PREFLIGHT_CREDENTIAL_ACL_INVALID'; end $fail$;
\endif

select count(*)::bigint as equora_baseline_trade_count,
  (select count(*)::bigint from public.broker_connections)
    as equora_baseline_connection_count,
  (select count(*)::bigint from public.broker_credentials)
    as equora_baseline_credential_count
from public.trades
\gset

\echo 'Preflight PASS: PostgreSQL 16+, Baseline oder vollständiger Markerstand, Executor und Credential-ACL sind geschlossen.'
\echo 'Trade-Baseline: ' :equora_baseline_trade_count

commit;

-- psql-session sentinel consumed by deploy-v57.61.0.sql. It is deliberately
-- set only after every read-only gate and the transaction commit succeeded.
\set equora_v5761_preflight_ok true
