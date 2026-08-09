-- Read-only semantic drift gate for the complete v57.61.0 broker surface.
-- This file is included by postflight after all six exact markers are present.
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
begin
  select encode(public.equora_pgcrypto_digest_v1(convert_to(coalesce(
    string_agg(
      namespace_row.nspname || '|' || relation_row.relname || '|'
      || attribute_row.attnum::text || '|' || attribute_row.attname || '|'
      || pg_catalog.format_type(attribute_row.atttypid, attribute_row.atttypmod)
      || '|' || attribute_row.attnotnull::text || '|'
      || attribute_row.attidentity::text || '|'
      || attribute_row.attgenerated::text || '|'
      || coalesce(pg_get_expr(default_row.adbin, default_row.adrelid), ''),
      E'\n' order by namespace_row.nspname, relation_row.relname,
        attribute_row.attnum
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
      ), '') || '|' || pg_get_functiondef(procedure_row.oid)
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    join pg_roles owner_row on owner_row.oid = procedure_row.proowner
    join pg_language language_row on language_row.oid = procedure_row.prolang
    where namespace_row.nspname = 'public'
      and procedure_row.proname like 'equora\_%' escape '\'
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
    where namespace_row.nspname = 'public'
      and procedure_row.proname like 'equora\_%' escape '\'
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
    from (values ('public'), ('equora_private'), ('auth')) expected_schema(schema_name)
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
      and owner_row.rolname in ('postgres', 'supabase_auth_admin', current_user)
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
        coalesce(grantee_row.rolname, 'PUBLIC') in (
          'PUBLIC', 'anon', 'authenticated', 'service_role', 'authenticator',
          'dashboard_user', 'equora_broker_capture_owner'
        )
        and exploded.privilege_type = 'USAGE'
        and exploded.is_grantable = false
        or coalesce(grantee_row.rolname, 'PUBLIC') in (
          'postgres', 'supabase_auth_admin', current_user
        )
        and exploded.privilege_type in ('USAGE', 'CREATE')
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
        and owner_row.rolname in ('postgres', 'supabase_auth_admin', current_user)
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
            'dashboard_user', 'equora_broker_capture_owner', 'postgres',
            'supabase_auth_admin', current_user
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
    or not has_schema_privilege(
      'equora_broker_capture_owner', 'auth', 'usage'
    )
    or has_schema_privilege(
      'equora_broker_capture_owner', 'auth', 'create'
    )
    or not has_function_privilege(
      'equora_broker_capture_owner', 'auth.uid()', 'execute'
    )
  then
    raise exception 'POSTFLIGHT_PLATFORM_SECURITY_CONTRACT_DRIFT';
  end if;

  raise notice
    'EQUORA_CONTRACT_HASHES columns=% constraints=% indexes=% relations=% functions=% triggers=% schemas=% authority_security=%',
    v_columns, v_constraints, v_indexes, v_relations, v_functions,
    v_triggers, v_schemas, v_authority_security;

  if v_columns is distinct from
      'efdca6c88c6057375983bafc76673ab8a654c470fd98b4627e3caba12a4d3702'
  then
    raise exception 'POSTFLIGHT_COLUMN_CONTRACT_DRIFT';
  end if;
  if v_constraints is distinct from
      '43034bacc0d1009534c0f823408467917683cd2b8b98db122c3e9c5d13dc3e4e'
  then
    raise exception 'POSTFLIGHT_CONSTRAINT_CONTRACT_DRIFT';
  end if;
  if v_indexes is distinct from
      '1b9f219d66bf586ca5ec98d736ecde49a1e46e5dc8a0751c6fef2655c62b9586'
  then
    raise exception 'POSTFLIGHT_INDEX_CONTRACT_DRIFT';
  end if;
  if v_relations is distinct from
      'c50d852586bb6934b3465c1ad82707cd75158d4c760f2366a19263dc4af7624f'
  then
    raise exception 'POSTFLIGHT_RELATION_SECURITY_CONTRACT_DRIFT';
  end if;
  if v_functions is distinct from
      'ceb0d9f999b196c35fc43a8346edcf727a0505d15b5b1f88d175b93a00d2a2a5'
  then
    raise exception 'POSTFLIGHT_FUNCTION_CONTRACT_DRIFT';
  end if;
  if v_triggers is distinct from
      '7687af2781ba2ada56ff9aea96735305526e5b19118febe474f2e77a24f2a4c7'
  then
    raise exception 'POSTFLIGHT_TRIGGER_CONTRACT_DRIFT';
  end if;
  if v_schemas is distinct from
      '0938ba568b01de34de69568102a3194ffdb08c310f8080adf8dcd15092b7c222'
  then
    raise exception 'POSTFLIGHT_SCHEMA_ACL_CONTRACT_DRIFT';
  end if;
  if v_authority_security is distinct from
      '68b020173090f658a95fb3133ee9656ce3e47fbe026d880cfd8a2e92b185dfd6'
  then
    raise exception 'POSTFLIGHT_AUTHORITY_SECURITY_CONTRACT_DRIFT';
  end if;
end;
$$;
