-- Read-only semantic drift gate for the complete v57.61.0 broker surface.
-- This file is included by postflight after all seven exact markers are
-- present. Preflight also uses it for the exact six-marker predecessor: only
-- that state may still carry the former broker_providers RLS=false relation
-- hash while the forward-only seventh layer is pending.
-- It does not write data and is intentionally independent of marker age.
do $$
declare
  v_columns text;
  v_constraints text;
  v_indexes text;
  v_relations text;
  v_functions text;
  v_triggers text;
  v_schemas text;
  v_authority_security text;
  v_pgcrypto_schema text;
  v_six_marker_predecessor_exact boolean;
begin
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
      '892f1587e8e37937a538dad1239ec931d43bd1f65d2f224d56ab7b9356f89e96')
  ), present as (
    select expected.migration_id,
      actual.contract_fingerprint = expected.contract_fingerprint as exact
    from expected
    left join equora_private.schema_migrations actual
      on actual.migration_id = expected.migration_id
  )
  select (select count(*) from equora_private.schema_migrations
          where migration_id like 'equora_v57.61.0%') = 6
    and (select count(*) from present where exact) = 6
    and not exists (select 1 from present where exact is distinct from true)
  into v_six_marker_predecessor_exact;

  select namespace_row.nspname into v_pgcrypto_schema
  from pg_extension extension_row
  join pg_namespace namespace_row
    on namespace_row.oid = extension_row.extnamespace
  where extension_row.extname = 'pgcrypto';

  if v_pgcrypto_schema is null then
    raise exception 'POSTFLIGHT_PGCRYPTO_EXTENSION_MISSING';
  end if;

  if v_pgcrypto_schema not in ('public', 'extensions')
    or not exists (
      select 1
      from pg_namespace namespace_row
      join pg_roles owner_row on owner_row.oid = namespace_row.nspowner
      where namespace_row.nspname = v_pgcrypto_schema
        and owner_row.rolname in (
          'postgres', 'supabase_admin', 'pg_database_owner'
        )
    )
    or exists (
      select 1
      from pg_namespace namespace_row
      cross join lateral aclexplode(coalesce(
        namespace_row.nspacl, acldefault('n', namespace_row.nspowner)
      )) exploded
      left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
      where namespace_row.nspname = v_pgcrypto_schema
        and exploded.grantee <> namespace_row.nspowner
        and not (
          exploded.is_grantable is false
          and (
            (
              v_pgcrypto_schema = 'public'
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
              v_pgcrypto_schema = 'public'
              and coalesce(grantee_row.rolname, 'PUBLIC') =
                'equora_broker_capture_owner'
              and exploded.privilege_type = 'USAGE'
            )
          )
        )
    )
    or has_schema_privilege('anon', v_pgcrypto_schema, 'create')
    or has_schema_privilege('authenticated', v_pgcrypto_schema, 'create')
    or has_schema_privilege('service_role', v_pgcrypto_schema, 'create')
    or (
      v_pgcrypto_schema = 'extensions'
      and has_schema_privilege(
        'equora_broker_capture_owner', v_pgcrypto_schema, 'usage'
      )
    )
  then
    raise exception 'POSTFLIGHT_PGCRYPTO_SCHEMA_SECURITY_DRIFT';
  end if;

  select encode(public.equora_pgcrypto_digest_v1(convert_to(coalesce(
    string_agg(
      namespace_row.nspname || '|' || relation_row.relname || '|'
      || attribute_row.attname || '|'
      || pg_catalog.format_type(attribute_row.atttypid, attribute_row.atttypmod)
      || '|' || attribute_row.attnotnull::text || '|'
      || attribute_row.attidentity::text || '|'
      || attribute_row.attgenerated::text || '|'
      || coalesce(pg_get_expr(default_row.adbin, default_row.adrelid), ''),
      E'\n' order by namespace_row.nspname, relation_row.relname,
        attribute_row.attname
    ), ''), 'UTF8'), 'sha256'), 'hex') into v_columns
  from pg_class relation_row
  join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
  join pg_attribute attribute_row on attribute_row.attrelid = relation_row.oid
    and attribute_row.attnum > 0 and not attribute_row.attisdropped
  left join pg_attrdef default_row on default_row.adrelid = relation_row.oid
    and default_row.adnum = attribute_row.attnum
  where relation_row.relkind in ('r','p')
    and namespace_row.nspname in ('public', 'equora_private');

  select encode(public.equora_pgcrypto_digest_v1(convert_to(coalesce(
    string_agg(
      namespace_row.nspname || '|' || relation_row.relname || '|'
      || constraint_row.conname || '|' || constraint_row.contype::text || '|'
      || constraint_row.convalidated::text || '|'
      || pg_get_constraintdef(constraint_row.oid, true),
      E'\n' order by namespace_row.nspname, relation_row.relname,
        constraint_row.conname
    ), ''), 'UTF8'), 'sha256'), 'hex') into v_constraints
  from pg_constraint constraint_row
  join pg_class relation_row on relation_row.oid = constraint_row.conrelid
  join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
  where relation_row.relkind in ('r','p')
    and namespace_row.nspname in ('public', 'equora_private');

  select encode(public.equora_pgcrypto_digest_v1(convert_to(coalesce(
    string_agg(
      index_row.schemaname || '|' || index_row.tablename || '|'
      || index_row.indexname || '|' || index_row.indexdef,
      E'\n' order by index_row.schemaname, index_row.tablename,
        index_row.indexname
    ), ''), 'UTF8'), 'sha256'), 'hex') into v_indexes
  from pg_indexes index_row
  where index_row.schemaname in ('public', 'equora_private');

  with contract_rows(value) as (
    select namespace_row.nspname || '|' || relation_row.relname || '|relation|'
      || relation_row.relkind::text || '|' || owner_row.rolname || '|'
      || relation_row.relrowsecurity::text || '|'
      || relation_row.relforcerowsecurity::text
    from pg_class relation_row
    join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
    join pg_roles owner_row on owner_row.oid = relation_row.relowner
    where relation_row.relkind in ('r','p')
      and namespace_row.nspname in ('public', 'equora_private')
    union all
    select schemaname || '|' || tablename || '|policy|' || policyname || '|'
      || permissive || '|' || roles::text || '|' || cmd || '|'
      || coalesce(qual, '') || '|' || coalesce(with_check, '')
    from pg_policies
    where schemaname in ('public', 'equora_private')
    union all
    select namespace_row.nspname || '|' || relation_row.relname || '|acl|'
      || coalesce(grantee_row.rolname, 'PUBLIC') || '|'
      || exploded.privilege_type || '|' || exploded.is_grantable::text
    from pg_class relation_row
    join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
    cross join lateral aclexplode(coalesce(
      relation_row.relacl, acldefault('r', relation_row.relowner)
    )) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where relation_row.relkind in ('r','p')
      and namespace_row.nspname in ('public', 'equora_private')
  )
  select encode(public.equora_pgcrypto_digest_v1(convert_to(coalesce(
    string_agg(value, E'\n' order by value), ''
  ), 'UTF8'), 'sha256'), 'hex') into v_relations
  from contract_rows;

  with contract_rows(value) as (
    select namespace_row.nspname || '|' || procedure_row.oid::regprocedure::text
      || '|function|' || owner_row.rolname || '|'
      || language_row.lanname || '|' || procedure_row.provolatile::text || '|'
      || procedure_row.proisstrict::text || '|'
      || procedure_row.prosecdef::text || '|'
      || coalesce((
        select string_agg(config_entry, ',' order by config_entry)
        from unnest(coalesce(procedure_row.proconfig, array[]::text[])) config_entry
      ), '') || '|' || replace(replace(
        regexp_replace(
          pg_get_functiondef(procedure_row.oid), E'\r\n?', E'\n', 'g'
        ),
        format('select %I.digest', v_pgcrypto_schema),
        'select <pgcrypto>.digest'
      ),
        format('select %I.hmac', v_pgcrypto_schema),
        'select <pgcrypto>.hmac'
      )
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    join pg_roles owner_row on owner_row.oid = procedure_row.proowner
    join pg_language language_row on language_row.oid = procedure_row.prolang
    where (
        namespace_row.nspname = 'public'
        and procedure_row.proname like 'equora\_%' escape '\'
      ) or procedure_row.oid = to_regprocedure(
        'equora_private.equora_request_context_uid_v1()'
      )
    union all
    select namespace_row.nspname || '|' || procedure_row.oid::regprocedure::text
      || '|acl|' || coalesce(grantee_row.rolname, 'PUBLIC') || '|'
      || exploded.privilege_type || '|' || exploded.is_grantable::text
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    cross join lateral aclexplode(coalesce(
      procedure_row.proacl, acldefault('f', procedure_row.proowner)
    )) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where (
        namespace_row.nspname = 'public'
        and procedure_row.proname like 'equora\_%' escape '\'
      ) or procedure_row.oid = to_regprocedure(
        'equora_private.equora_request_context_uid_v1()'
      )
  )
  select encode(public.equora_pgcrypto_digest_v1(convert_to(coalesce(
    string_agg(value, E'\n' order by value), ''
  ), 'UTF8'), 'sha256'), 'hex') into v_functions
  from contract_rows;

  with contract_rows(value) as (
    select
      namespace_row.nspname || '|' || relation_row.relname || '|'
      || coalesce(constraint_row.conname, '') || '|'
      || case when trigger_row.tgisinternal then 'internal_constraint'
        else trigger_row.tgname end || '|'
      || trigger_row.tgisinternal::text || '|'
      || trigger_row.tgenabled::text || '|'
      || trigger_row.tgdeferrable::text || '|'
      || trigger_row.tginitdeferred::text || '|'
      || case when trigger_row.tgisinternal then
        'function=' || trigger_row.tgfoid::regprocedure::text
        || '|type=' || trigger_row.tgtype::text
        || '|attr=' || trigger_row.tgattr::text
      else pg_get_triggerdef(trigger_row.oid, true) end
    from pg_trigger trigger_row
    join pg_class relation_row on relation_row.oid = trigger_row.tgrelid
    join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
    left join pg_constraint constraint_row
      on constraint_row.oid = trigger_row.tgconstraint
    where namespace_row.nspname in ('public', 'equora_private')
      and (
        trigger_row.tgisinternal is false
        or constraint_row.oid is not null
      )
  )
  select encode(public.equora_pgcrypto_digest_v1(convert_to(coalesce(
    string_agg(value, E'\n' order by value), ''
  ), 'UTF8'), 'sha256'), 'hex') into v_triggers
  from contract_rows;

  -- Schema authority is a separate contract grain. Effective checks for one
  -- owner are insufficient because an unrelated grantee, grant option or
  -- owner drift is itself DDL authority. Bind owner and the full normalized
  -- ACL for every application-owned schema used by SECURITY DEFINER code.
  -- The Supabase-managed auth schema is validated separately below through a
  -- closed platform allowlist; pinning the local stub's raw ACL would reject a
  -- legitimate Supabase target while still failing to prove grant authority.
  with contract_rows(value) as (
    select 'schema|' || namespace_row.nspname || '|owner|'
      || owner_row.rolname
    from pg_namespace namespace_row
    join pg_roles owner_row on owner_row.oid = namespace_row.nspowner
    where namespace_row.nspname in ('public', 'equora_private')
    union all
    select 'schema|' || namespace_row.nspname || '|acl|'
      || coalesce(grantee_row.rolname, 'PUBLIC') || '|'
      || exploded.privilege_type || '|' || exploded.is_grantable::text
    from pg_namespace namespace_row
    cross join lateral aclexplode(coalesce(
      namespace_row.nspacl, acldefault('n', namespace_row.nspowner)
    )) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where namespace_row.nspname in ('public', 'equora_private')
  )
  select encode(public.equora_pgcrypto_digest_v1(convert_to(coalesce(
    string_agg(value, E'\n' order by value), ''
  ), 'UTF8'), 'sha256'), 'hex') into v_schemas
  from contract_rows;

  with contract_rows(value) as (
    select 'role|equora_broker_capture_owner|'
      || role_row.rolsuper::text || '|' || role_row.rolinherit::text || '|'
      || role_row.rolcreaterole::text || '|' || role_row.rolcreatedb::text || '|'
      || role_row.rolcanlogin::text || '|' || role_row.rolreplication::text || '|'
      || role_row.rolbypassrls::text
    from pg_roles role_row
    where role_row.rolname = 'equora_broker_capture_owner'
    union all
    select 'membership_invalid_count|' || count(*)::text
    from pg_auth_members membership_row
    join pg_roles granted_role on granted_role.oid = membership_row.roleid
    join pg_roles member_role on member_role.oid = membership_row.member
    where member_role.rolname = 'equora_broker_capture_owner'
      or (
        granted_role.rolname = 'equora_broker_capture_owner'
        and (
          member_role.rolname <> 'postgres'
          or membership_row.admin_option is distinct from true
          or membership_row.inherit_option is distinct from false
          or membership_row.set_option is distinct from false
        )
      )
    union all
    select 'schema_effective|' || schema_name || '|create='
      || has_schema_privilege(
        'equora_broker_capture_owner', schema_name, 'create'
      )::text || '|usage=' || has_schema_privilege(
        'equora_broker_capture_owner', schema_name, 'usage'
      )::text
    from (values ('public'), ('equora_private')) expected_schema(schema_name)
    union all
    select 'pgcrypto_namespace|supported|'
      || (v_pgcrypto_schema in ('public', 'extensions'))::text
    union all
    select 'pgcrypto_namespace|trusted_owner|'
      || (exists (
        select 1
        from pg_namespace namespace_row
        join pg_roles owner_row on owner_row.oid = namespace_row.nspowner
        where namespace_row.nspname = v_pgcrypto_schema
          and owner_row.rolname in (
            'postgres', 'supabase_admin', 'pg_database_owner'
          )
      ))::text
    union all
    select 'pgcrypto_namespace|invalid_nonowner_acl_count|' || count(*)::text
    from pg_namespace namespace_row
    cross join lateral aclexplode(coalesce(
      namespace_row.nspacl, acldefault('n', namespace_row.nspowner)
    )) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where namespace_row.nspname = v_pgcrypto_schema
      and exploded.grantee <> namespace_row.nspowner
      and not (
        exploded.is_grantable is false
        and (
          (
            v_pgcrypto_schema = 'public'
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
            v_pgcrypto_schema = 'public'
            and coalesce(grantee_row.rolname, 'PUBLIC') =
              'equora_broker_capture_owner'
            and exploded.privilege_type = 'USAGE'
          )
        )
      )
    union all
    select 'pgcrypto_namespace|api_create_count|'
      || (
        has_schema_privilege('anon', v_pgcrypto_schema, 'create')::integer
        + has_schema_privilege(
          'authenticated', v_pgcrypto_schema, 'create'
        )::integer
        + has_schema_privilege(
          'service_role', v_pgcrypto_schema, 'create'
        )::integer
      )::text
    union all
    select 'pgcrypto_namespace|capture_owner_usage_valid|'
      || (case when v_pgcrypto_schema = 'extensions' then
        not has_schema_privilege(
          'equora_broker_capture_owner', v_pgcrypto_schema, 'usage'
        )
      else has_schema_privilege(
        'equora_broker_capture_owner', v_pgcrypto_schema, 'usage'
      ) end)::text
    union all
    select 'auth_explicit_capture_owner_acl_count|' || count(*)::text
    from (
      select exploded.grantee
      from pg_namespace namespace_row
      cross join lateral aclexplode(coalesce(
        namespace_row.nspacl, acldefault('n', namespace_row.nspowner)
      )) exploded
      join pg_roles grantee_row on grantee_row.oid = exploded.grantee
      where namespace_row.nspname = 'auth'
        and grantee_row.rolname = 'equora_broker_capture_owner'
      union all
      select exploded.grantee
      from pg_proc procedure_row
      cross join lateral aclexplode(coalesce(
        procedure_row.proacl, acldefault('f', procedure_row.proowner)
      )) exploded
      join pg_roles grantee_row on grantee_row.oid = exploded.grantee
      where procedure_row.oid = 'auth.uid()'::regprocedure
        and grantee_row.rolname = 'equora_broker_capture_owner'
    ) direct_auth_acl
    union all
    select 'request_context_uid_adapter|function|'
      || owner_row.rolname || '|' || language_row.lanname || '|'
      || procedure_row.provolatile::text || '|'
      || procedure_row.prosecdef::text || '|'
      || coalesce((
        select string_agg(config_entry, ',' order by config_entry)
        from unnest(coalesce(
          procedure_row.proconfig, array[]::text[]
        )) config_entry
      ), '') || '|' || pg_get_functiondef(procedure_row.oid)
    from pg_proc procedure_row
    join pg_roles owner_row on owner_row.oid = procedure_row.proowner
    join pg_language language_row on language_row.oid = procedure_row.prolang
    where procedure_row.oid = to_regprocedure(
      'equora_private.equora_request_context_uid_v1()'
    )
    union all
    select 'request_context_uid_adapter|acl|'
      || coalesce(grantee_row.rolname, 'PUBLIC') || '|'
      || exploded.privilege_type || '|' || exploded.is_grantable::text
    from pg_proc procedure_row
    cross join lateral aclexplode(coalesce(
      procedure_row.proacl, acldefault('f', procedure_row.proowner)
    )) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where procedure_row.oid = to_regprocedure(
      'equora_private.equora_request_context_uid_v1()'
    )
  )
  select encode(public.equora_pgcrypto_digest_v1(convert_to(coalesce(
    string_agg(value, E'\n' order by value), ''
  ), 'UTF8'), 'sha256'), 'hex') into v_authority_security
  from contract_rows;

  -- Supabase owns the auth surface. Bind the complete ACL to a closed set of
  -- supported platform roles and prove the exact capabilities needed by this
  -- release without assuming the local stub owner/ACL is production truth.
  if not exists (
    select 1
    from pg_namespace namespace_row
    join pg_roles owner_row on owner_row.oid = namespace_row.nspowner
    where namespace_row.nspname = 'auth'
      and owner_row.rolname in (
        'postgres', 'supabase_admin', 'supabase_auth_admin'
      )
  ) or exists (
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
  ) or to_regprocedure('auth.uid()') is null
    or to_regclass('auth.users') is null
    or not exists (
      select 1
      from pg_proc procedure_row
      join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
      join pg_roles owner_row on owner_row.oid = procedure_row.proowner
      where procedure_row.oid = 'auth.uid()'::regprocedure
        and namespace_row.nspname = 'auth'
        and procedure_row.prorettype = 'uuid'::regtype
        and owner_row.rolname in (
          'postgres', 'supabase_admin', 'supabase_auth_admin'
        )
    )
    or exists (
      select 1
      from pg_proc procedure_row
      cross join lateral aclexplode(coalesce(
        procedure_row.proacl, acldefault('f', procedure_row.proowner)
      )) exploded
      left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
      where procedure_row.oid = 'auth.uid()'::regprocedure
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
    or not exists (
      select 1
      from pg_attribute attribute_row
      where attribute_row.attrelid = 'auth.users'::regclass
        and attribute_row.attname = 'id'
        and attribute_row.atttypid = 'uuid'::regtype
        and attribute_row.attnotnull
        and not attribute_row.attisdropped
    )
    or not exists (
      select 1
      from pg_constraint constraint_row
      join pg_attribute attribute_row
        on attribute_row.attrelid = constraint_row.conrelid
        and attribute_row.attnum = any(constraint_row.conkey)
      where constraint_row.conrelid = 'auth.users'::regclass
        and constraint_row.contype in ('p', 'u')
        and constraint_row.convalidated
        and cardinality(constraint_row.conkey) = 1
        and attribute_row.attname = 'id'
    )
    or has_schema_privilege(
      'equora_broker_capture_owner', 'auth', 'usage'
    )
    or has_schema_privilege(
      'equora_broker_capture_owner', 'auth', 'create'
    )
    or exists (
      select 1
      from pg_proc procedure_row
      cross join lateral aclexplode(coalesce(
        procedure_row.proacl, acldefault('f', procedure_row.proowner)
      )) exploded
      join pg_roles grantee_row on grantee_row.oid = exploded.grantee
      where procedure_row.oid = 'auth.uid()'::regprocedure
        and grantee_row.rolname = 'equora_broker_capture_owner'
    )
    or not exists (
      select 1
      from pg_proc procedure_row
      join pg_namespace namespace_row
        on namespace_row.oid = procedure_row.pronamespace
      join pg_roles owner_row on owner_row.oid = procedure_row.proowner
      join pg_language language_row on language_row.oid = procedure_row.prolang
      where procedure_row.oid = to_regprocedure(
        'equora_private.equora_request_context_uid_v1()'
      )
        and namespace_row.nspname = 'equora_private'
        and owner_row.rolname = 'postgres'
        and language_row.lanname = 'sql'
        and procedure_row.prorettype = 'uuid'::regtype
        and procedure_row.pronargs = 0
        and procedure_row.provolatile = 's'
        and procedure_row.prosecdef = true
        and procedure_row.proconfig @> array['search_path=""']::text[]
        and procedure_row.proconfig <@ array['search_path=""']::text[]
        and regexp_replace(
          procedure_row.prosrc, '[[:space:]]+', '', 'g'
        ) = 'selectauth.uid()'
    )
    or exists (
      select 1
      from pg_proc procedure_row
      cross join lateral aclexplode(coalesce(
        procedure_row.proacl, acldefault('f', procedure_row.proowner)
      )) exploded
      left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
      where procedure_row.oid =
        'equora_private.equora_request_context_uid_v1()'::regprocedure
        and exploded.grantee <> procedure_row.proowner
        and (
          grantee_row.rolname is distinct from 'equora_broker_capture_owner'
          or exploded.privilege_type is distinct from 'EXECUTE'
          or exploded.is_grantable is distinct from false
        )
    )
    or not exists (
      select 1
      from pg_proc procedure_row
      cross join lateral aclexplode(coalesce(
        procedure_row.proacl, acldefault('f', procedure_row.proowner)
      )) exploded
      join pg_roles grantee_row on grantee_row.oid = exploded.grantee
      where procedure_row.oid =
        'equora_private.equora_request_context_uid_v1()'::regprocedure
        and grantee_row.rolname = 'equora_broker_capture_owner'
        and exploded.privilege_type = 'EXECUTE'
        and exploded.is_grantable = false
    )
    or exists (
      select 1
      from pg_proc procedure_row
      join pg_roles owner_row on owner_row.oid = procedure_row.proowner
      where owner_row.rolname = 'equora_broker_capture_owner'
        and case when procedure_row.prokind in ('f', 'p') then
          pg_get_functiondef(procedure_row.oid) ~ 'auth[.]uid[(][)]'
        else false end
    )
  then
    raise exception 'POSTFLIGHT_PLATFORM_SECURITY_CONTRACT_DRIFT';
  end if;

  raise notice
    'EQUORA_CONTRACT_HASHES columns=% constraints=% indexes=% relations=% functions=% triggers=% schemas=% authority_security=%',
    v_columns, v_constraints, v_indexes, v_relations, v_functions,
    v_triggers, v_schemas, v_authority_security;

  if v_columns is distinct from
      '91306cab2e10611b78ddc975b178317d2d44fd633c02b2da7aff30a7194c1e20'
  then
    raise exception 'POSTFLIGHT_COLUMN_CONTRACT_DRIFT';
  end if;
  if v_constraints is distinct from
      '2f943b4bc2672842d23004a95e3f69188e6a0c5e6048170c97886c11a9a1a359'
  then
    raise exception 'POSTFLIGHT_CONSTRAINT_CONTRACT_DRIFT';
  end if;
  if v_indexes is distinct from
      '1b9f219d66bf586ca5ec98d736ecde49a1e46e5dc8a0751c6fef2655c62b9586'
  then
    raise exception 'POSTFLIGHT_INDEX_CONTRACT_DRIFT';
  end if;
  if v_relations is distinct from
      'd44f7661d68f9623bd1d3ef79da5af48e0ecee94f25aa3a24b829bc75a3fa8b8'
    and not (
      v_six_marker_predecessor_exact
      and v_relations =
        'acd317c2a68f2028cb2573a94ba3ac917112af480a98aa7d68adef7e8e4a2ce8'
    )
  then
    raise exception 'POSTFLIGHT_RELATION_SECURITY_CONTRACT_DRIFT';
  end if;
  if v_functions is distinct from
      'c3ce058a00fb5f6c7e6f40ed32a70eb5e80e161a859098d11e64d18105c4eb60'
  then
    raise exception 'POSTFLIGHT_FUNCTION_CONTRACT_DRIFT';
  end if;
  if v_triggers is distinct from
      'eea9953ad30c53f83b3c94a8b9e315ef6b007222a759dafbe7922a3f50f6215a'
  then
    raise exception 'POSTFLIGHT_TRIGGER_CONTRACT_DRIFT';
  end if;
  if v_schemas is distinct from
      'dc03fc52f8302cde82531aede2b06fa1a05207162cc3fde12f2dedb30ae1c42e'
  then
    raise exception 'POSTFLIGHT_SCHEMA_ACL_CONTRACT_DRIFT';
  end if;
  if v_authority_security is distinct from
      'f14e56c198abf499e69213f6875225c3b8cd10e922f46644774c37c8d6952ca6'
  then
    raise exception 'POSTFLIGHT_AUTHORITY_SECURITY_CONTRACT_DRIFT';
  end if;
end;
$$;
