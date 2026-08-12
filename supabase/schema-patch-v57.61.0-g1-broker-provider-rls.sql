-- Equora v57.61.0 - forward-only broker-provider RLS normalization.
--
-- This seventh layer changes no rows, policies, grants, functions or runtime
-- behavior. It converges the exact six-marker predecessor onto the canonical
-- relation-security contract after Hosted Supabase enabled RLS on
-- public.broker_providers during the original production apply.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  v_existing_fingerprint text;
begin
  if to_regclass('equora_private.schema_migrations') is null
    or to_regclass('public.broker_providers') is null
  then
    raise exception 'BROKER_PROVIDER_RLS_PREREQUISITE_MISSING';
  end if;

  select contract_fingerprint into v_existing_fingerprint
  from equora_private.schema_migrations
  where migration_id = 'equora_v57.61.0_broker_provider_rls_v1';

  if v_existing_fingerprint is not null
    and v_existing_fingerprint is distinct from
      'd72047ce5e28e1400869a9abdcdad650a4f1b3b11e1e1b7cb07a9b37157eca47'
  then
    raise exception 'BROKER_PROVIDER_RLS_MIGRATION_DRIFT';
  end if;

  if v_existing_fingerprint is null and not (
    select count(*) = 6
      and count(*) filter (where contract_fingerprint is null) = 0
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
        '892f1587e8e37937a538dad1239ec931d43bd1f65d2f224d56ab7b9356f89e96')
    ) expected(migration_id, expected_fingerprint)
    left join equora_private.schema_migrations actual
      on actual.migration_id = expected.migration_id
      and actual.contract_fingerprint = expected.expected_fingerprint
  ) then
    raise exception 'BROKER_PROVIDER_RLS_PREDECESSOR_INVALID';
  end if;

  if v_existing_fingerprint is null and exists (
    select 1
    from equora_private.schema_migrations actual
    where actual.migration_id like 'equora_v57.61.0%'
      and actual.migration_id not in (
        'equora_v57.61.0_broker_capture_v1',
        'equora_v57.61.0_g1_capture_control_v1',
        'equora_v57.61.0_g1_lane_authority_v1',
        'equora_v57.61.0_g1_activation_authority_v1',
        'equora_v57.61.0_g1_scheduler_control_v2',
        'equora_v57.61.0_g1_runtime_deployment_v1'
      )
  ) then
    raise exception 'BROKER_PROVIDER_RLS_PREDECESSOR_INVALID';
  end if;

  if not exists (
    select 1
    from pg_class relation_row
    join pg_namespace namespace_row
      on namespace_row.oid = relation_row.relnamespace
    join pg_roles owner_row on owner_row.oid = relation_row.relowner
    where namespace_row.nspname = 'public'
      and relation_row.relname = 'broker_providers'
      and relation_row.relkind = 'r'
      and owner_row.rolname = 'postgres'
      and relation_row.relforcerowsecurity = false
  ) or exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'broker_providers'
  ) or (
    select count(*)
    from pg_class relation_row
    cross join lateral aclexplode(coalesce(
      relation_row.relacl, acldefault('r', relation_row.relowner)
    )) exploded
    join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where relation_row.oid = 'public.broker_providers'::regclass
      and exploded.grantee <> relation_row.relowner
      and grantee_row.rolname = 'equora_broker_capture_owner'
      and exploded.privilege_type in ('SELECT', 'UPDATE')
      and exploded.is_grantable = false
  ) <> 2 or exists (
    select 1
    from pg_class relation_row
    cross join lateral aclexplode(coalesce(
      relation_row.relacl, acldefault('r', relation_row.relowner)
    )) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where relation_row.oid = 'public.broker_providers'::regclass
      and exploded.grantee <> relation_row.relowner
      and not (
        grantee_row.rolname = 'equora_broker_capture_owner'
        and exploded.privilege_type in ('SELECT', 'UPDATE')
        and exploded.is_grantable = false
      )
  ) then
    raise exception 'BROKER_PROVIDER_RLS_RELATION_CONTRACT_INVALID';
  end if;
end;
$$;

alter table public.broker_providers enable row level security;

insert into equora_private.schema_migrations (migration_id, contract_fingerprint)
values (
  'equora_v57.61.0_broker_provider_rls_v1',
  'd72047ce5e28e1400869a9abdcdad650a4f1b3b11e1e1b7cb07a9b37157eca47'
) on conflict (migration_id) do nothing;

do $$
begin
  if not exists (
    select 1
    from equora_private.schema_migrations
    where migration_id = 'equora_v57.61.0_broker_provider_rls_v1'
      and contract_fingerprint =
        'd72047ce5e28e1400869a9abdcdad650a4f1b3b11e1e1b7cb07a9b37157eca47'
  ) then
    raise exception 'BROKER_PROVIDER_RLS_MIGRATION_DRIFT';
  end if;

  if not exists (
    select 1
    from pg_class relation_row
    join pg_namespace namespace_row
      on namespace_row.oid = relation_row.relnamespace
    join pg_roles owner_row on owner_row.oid = relation_row.relowner
    where namespace_row.nspname = 'public'
      and relation_row.relname = 'broker_providers'
      and relation_row.relkind = 'r'
      and owner_row.rolname = 'postgres'
      and relation_row.relrowsecurity = true
      and relation_row.relforcerowsecurity = false
  ) or exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'broker_providers'
  ) or (
    select count(*)
    from pg_class relation_row
    cross join lateral aclexplode(coalesce(
      relation_row.relacl, acldefault('r', relation_row.relowner)
    )) exploded
    join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where relation_row.oid = 'public.broker_providers'::regclass
      and exploded.grantee <> relation_row.relowner
      and grantee_row.rolname = 'equora_broker_capture_owner'
      and exploded.privilege_type in ('SELECT', 'UPDATE')
      and exploded.is_grantable = false
  ) <> 2 or exists (
    select 1
    from pg_class relation_row
    cross join lateral aclexplode(coalesce(
      relation_row.relacl, acldefault('r', relation_row.relowner)
    )) exploded
    left join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where relation_row.oid = 'public.broker_providers'::regclass
      and exploded.grantee <> relation_row.relowner
      and not (
        grantee_row.rolname = 'equora_broker_capture_owner'
        and exploded.privilege_type in ('SELECT', 'UPDATE')
        and exploded.is_grantable = false
      )
  ) then
    raise exception 'BROKER_PROVIDER_RLS_POSTCONDITION_INVALID';
  end if;
end;
$$;

commit;
