-- Exact read-only fingerprint for a clean v57.60.1 public schema. This gate is
-- executed only before the first v57.61.0 marker exists, so an incompatible or
-- drifted baseline fails before any v57.61.0 DDL can commit.
do $$
declare
  v_baseline_contract text;
begin
  with contract_rows(value) as (
    -- Physical attnum reflects migration history, not the logical column
    -- contract. Bind name/type/nullability/default and sort the final set.
    select 'column|' || relation_row.relname || '|'
      || attribute_row.attname || '|'
      || pg_catalog.format_type(attribute_row.atttypid, attribute_row.atttypmod)
      || '|' || attribute_row.attnotnull::text || '|'
      || attribute_row.attidentity::text || '|'
      || attribute_row.attgenerated::text || '|'
      || coalesce(pg_get_expr(default_row.adbin, default_row.adrelid), '')
    from pg_class relation_row
    join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
    join pg_attribute attribute_row on attribute_row.attrelid = relation_row.oid
      and attribute_row.attnum > 0 and not attribute_row.attisdropped
    left join pg_attrdef default_row on default_row.adrelid = relation_row.oid
      and default_row.adnum = attribute_row.attnum
    where namespace_row.nspname = 'public' and relation_row.relkind in ('r','p')
    union all
    select 'constraint|' || relation_row.relname || '|'
      || constraint_row.conname || '|' || constraint_row.contype::text || '|'
      || constraint_row.convalidated::text || '|'
      || pg_get_constraintdef(constraint_row.oid, true)
    from pg_constraint constraint_row
    join pg_class relation_row on relation_row.oid = constraint_row.conrelid
    join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
    where namespace_row.nspname = 'public' and relation_row.relkind in ('r','p')
    union all
    select 'index|' || index_row.tablename || '|' || index_row.indexname
      || '|' || index_row.indexdef
    from pg_indexes index_row
    where index_row.schemaname = 'public'
    union all
    select 'relation|' || relation_row.relname || '|'
      || relation_row.relkind::text || '|' || owner_row.rolname || '|'
      || relation_row.relrowsecurity::text || '|'
      || relation_row.relforcerowsecurity::text
    from pg_class relation_row
    join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
    join pg_roles owner_row on owner_row.oid = relation_row.relowner
    where namespace_row.nspname = 'public' and relation_row.relkind in ('r','p')
    union all
    select 'policy|' || tablename || '|' || policyname || '|'
      || permissive || '|' || roles::text || '|' || cmd || '|'
      || coalesce(qual, '') || '|' || coalesce(with_check, '')
    from pg_policies
    where schemaname = 'public'
    union all
    select 'relation_acl|' || relation_row.relname || '|'
      || coalesce(grantee_row.rolname, 'PUBLIC') || '|'
      || exploded.privilege_type || '|' || exploded.is_grantable::text
    from pg_class relation_row
    join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
    cross join lateral aclexplode(coalesce(
      relation_row.relacl, acldefault('r', relation_row.relowner)
    )) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where namespace_row.nspname = 'public' and relation_row.relkind in ('r','p')
    union all
    select 'trigger|' || relation_row.relname || '|'
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
    where namespace_row.nspname = 'public'
      and relation_row.relkind in ('r','p')
      -- Functional triggers and PostgreSQL's internal constraint/FK triggers
      -- are both authority-bearing. A disabled FK trigger must never pass only
      -- because pg_constraint still reports the unchanged validated FK.
      and (
        trigger_row.tgisinternal is false
        or constraint_row.oid is not null
      )
    union all
    select 'function|' || procedure_row.oid::regprocedure::text || '|'
      || owner_row.rolname || '|' || language_row.lanname || '|'
      || procedure_row.provolatile::text || '|'
      || procedure_row.proisstrict::text || '|'
      || procedure_row.prosecdef::text || '|'
      || coalesce((
        select string_agg(config_entry, ',' order by config_entry)
        from unnest(coalesce(procedure_row.proconfig, array[]::text[])) config_entry
      ), '') || '|' || regexp_replace(
        pg_get_functiondef(procedure_row.oid), E'\r\n?', E'\n', 'g'
      )
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    join pg_roles owner_row on owner_row.oid = procedure_row.proowner
    join pg_language language_row on language_row.oid = procedure_row.prolang
    where namespace_row.nspname = 'public'
      and procedure_row.proname like 'equora\_%' escape '\'
    union all
    select 'function_acl|' || procedure_row.oid::regprocedure::text || '|'
      || coalesce(grantee_row.rolname, 'PUBLIC') || '|'
      || exploded.privilege_type || '|' || exploded.is_grantable::text
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    cross join lateral aclexplode(coalesce(
      procedure_row.proacl, acldefault('f', procedure_row.proowner)
    )) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where namespace_row.nspname = 'public'
      and procedure_row.proname like 'equora\_%' escape '\'
    union all
    select 'schema|public|owner|' || owner_row.rolname
    from pg_namespace namespace_row
    join pg_roles owner_row on owner_row.oid = namespace_row.nspowner
    where namespace_row.nspname = 'public'
    union all
    select 'schema|public|acl|'
      || coalesce(grantee_row.rolname, 'PUBLIC') || '|'
      || exploded.privilege_type || '|' || exploded.is_grantable::text
    from pg_namespace namespace_row
    cross join lateral aclexplode(coalesce(
      namespace_row.nspacl, acldefault('n', namespace_row.nspowner)
    )) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where namespace_row.nspname = 'public'
  )
  select encode(pg_catalog.sha256(convert_to(coalesce(
    string_agg(value, E'\n' order by value), ''
  ), 'UTF8')), 'hex') into v_baseline_contract
  from contract_rows;

  raise notice 'EQUORA_V57601_BASELINE_CONTRACT_HASH=%', v_baseline_contract;
  if v_baseline_contract not in (
      -- Canonical schema.sql + v57.60.1 under Hosted-compatible defaults.
      'ac2bfb251aeb645dd3450e3b02d3f6d2ae5cb0aeeaa751e5a5a54f87a410c656',
      -- Verified Pre-v57.60.1 restore shape + the same v57.60.1 patch.
      '0fb6a0d531bb7cc66996c8b2d4f272f61dacefdb0e8969c536d1d49c89517218'
    )
  then raise exception 'PREFLIGHT_BASELINE_CONTRACT_DRIFT'; end if;
end;
$$;
