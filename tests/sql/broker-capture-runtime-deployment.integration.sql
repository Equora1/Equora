\set ON_ERROR_STOP on

begin;

insert into auth.users (id) values ('90000000-0000-4000-8000-000000000009')
on conflict (id) do nothing;

insert into equora_private.broker_capture_runtime_enrollment (
  singleton_key, user_id, provider_code, max_accounts, max_symbols,
  enabled, enrolled_at, updated_at
) values (
  true, '90000000-0000-4000-8000-000000000009', 'mexc', 1, 5,
  true, clock_timestamp(), clock_timestamp()
);

select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-4000-8000-000000000009',
  true
);
set local role authenticated;

select public.equora_request_mexc_connection_setup_v1(
  '91000000-0000-4000-8000-000000000009',
  'MEXC Read-only Test',
  '["BTC_USDT"]'::jsonb,
  true
);

-- The first pending command is the time-bounded reservation for the sole
-- external capability probe. A different setup command must be rejected
-- before any broker GET can begin and without leaving a second intent row.
do $$
begin
  begin
    perform public.equora_request_mexc_connection_setup_v1(
      '91000000-0000-4000-8000-000000000008',
      'Concurrent MEXC probe',
      '["ETH_USDT"]'::jsonb,
      true
    );
    raise exception 'RUNTIME_SETUP_PROBE_RESERVATION_BYPASSED';
  exception when others then
    if sqlerrm <> 'CONNECTION_SETUP_PROBE_BUSY' then raise; end if;
  end;
end;
$$;

reset role;

do $$
begin
  if exists (
    select 1 from public.broker_connection_setup_commands
    where id = '91000000-0000-4000-8000-000000000008'
  ) then raise exception 'RUNTIME_SETUP_PROBE_RESERVATION_PARTIAL_EFFECT'; end if;
end;
$$;

set local role service_role;

select public.equora_apply_mexc_connection_setup_v1(
  '91000000-0000-4000-8000-000000000009',
  '{"v":"k2026","iv":"AAAAAAAAAAAAAAAA","tag":"AAAAAAAAAAAAAAAAAAAAAA==","data":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}',
  'k2026',
  repeat('a', 64),
  'idv1',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
);

reset role;

do $$
declare
  v_result jsonb;
  v_activation_id uuid;
  v_account_id uuid;
begin
  select result into v_result
  from public.broker_connection_setup_commands
  where id = '91000000-0000-4000-8000-000000000009';
  if v_result ->> 'status' <> 'connection_activated'
    or (v_result ->> 'symbolCount')::integer <> 1
    or (v_result ->> 'requirementCount')::integer <> 6
    or v_result ->> 'probeEvidencePersistence' <> 'transient_not_persisted'
    or (v_result ->> 'automaticImportAuthorized')::boolean is distinct from false
    or (v_result ->> 'tradingAuthorized')::boolean is distinct from false
  then raise exception 'RUNTIME_SETUP_RESULT_INVALID'; end if;

  v_activation_id := (v_result ->> 'syncActivationId')::uuid;
  v_account_id := (v_result ->> 'brokerAccountId')::uuid;
  if (select count(*) from public.broker_connections
      where user_id = '90000000-0000-4000-8000-000000000009'
        and provider = 'mexc' and status = 'ready') <> 1
    or (select count(*) from public.broker_credentials
      where user_id = '90000000-0000-4000-8000-000000000009'
        and provider = 'mexc') <> 1
    or (select count(*) from public.broker_sync_lane_requirements
      where sync_activation_id = v_activation_id and superseded_at is null) <> 6
    or (select count(*) from public.broker_sync_lane_states
      where sync_activation_id = v_activation_id and superseded_at is null) <> 18
    or (select count(*) from equora_private.broker_capture_integrity_keys
      where broker_account_id = v_account_id and status = 'active') <> 1
    or (select count(*) from public.broker_capture_work_units
      where sync_activation_id = v_activation_id) <> 0
    or (select count(*) from public.broker_sync_scopes
      where sync_activation_id = v_activation_id) <> 0
  then raise exception 'RUNTIME_SETUP_ATOMIC_FOUNDATION_INVALID'; end if;
end;
$$;

-- Exact replay is a no-op and returns the original identifiers.
set local role service_role;
select public.equora_apply_mexc_connection_setup_v1(
  '91000000-0000-4000-8000-000000000009',
  '{"v":"k2026","iv":"AAAAAAAAAAAAAAAA","tag":"AAAAAAAAAAAAAAAAAAAAAA==","data":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}',
  'k2026',
  repeat('a', 64),
  'idv1',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
);
reset role;

do $$
begin
  if (select count(*) from public.broker_connections
      where user_id = '90000000-0000-4000-8000-000000000009') <> 1
    or (select count(*) from public.broker_accounts
      where user_id = '90000000-0000-4000-8000-000000000009') <> 1
  then raise exception 'RUNTIME_SETUP_REPLAY_CREATED_DUPLICATES'; end if;
  if (select count(*) from public.broker_capture_scope_finalization_receipts) <> 0
  then raise exception 'RUNTIME_SETUP_CREATED_CAPTURE_EFFECT'; end if;
end;
$$;

-- The single-account rollout cap is checked by the user-bound request RPC,
-- before the application is allowed to perform its GET-only evidence probe.
set local role authenticated;
do $$
begin
  begin
    perform public.equora_request_mexc_connection_setup_v1(
      '91000000-0000-4000-8000-000000000019',
      'Second MEXC account',
      '["ETH_USDT"]'::jsonb,
      true
    );
    raise exception 'RUNTIME_SETUP_ACCOUNT_CAP_ACCEPTED';
  exception when others then
    if sqlerrm <> 'CONNECTION_SETUP_ACCOUNT_LIMIT_REACHED' then raise; end if;
  end;
end;
$$;
reset role;

do $$
begin
  if exists (
    select 1 from public.broker_connection_setup_commands
    where id = '91000000-0000-4000-8000-000000000019'
  ) then raise exception 'RUNTIME_SETUP_ACCOUNT_CAP_PARTIAL_EFFECT'; end if;
  if (select broker_account_id
      from equora_private.broker_capture_runtime_enrollment
      where singleton_key is true) is distinct from (
    select (result ->> 'brokerAccountId')::uuid
    from public.broker_connection_setup_commands
    where id = '91000000-0000-4000-8000-000000000009'
  ) then raise exception 'RUNTIME_SETUP_ENROLLMENT_ACCOUNT_BINDING_INVALID'; end if;
end;
$$;

-- Enrollment is checked both before scheduler materialization and at the
-- request-permit linearization point. A disabled row creates no Work Unit and,
-- after a valid Claim, creates no permit and therefore authorizes no broker GET.
select (result ->> 'syncActivationId')::uuid as runtime_activation_id,
  (result ->> 'brokerAccountId')::uuid as runtime_account_id
from public.broker_connection_setup_commands
where id = '91000000-0000-4000-8000-000000000009'
\gset

update public.broker_sync_lane_states
set next_due_at = clock_timestamp() + interval '100 years'
where sync_activation_id = :'runtime_activation_id'::uuid;
update public.broker_sync_lane_states
set next_due_at = clock_timestamp() - interval '1 second'
where id = (
  select id from public.broker_sync_lane_states
  where sync_activation_id = :'runtime_activation_id'::uuid
    and capability_id = 'historical_orders_v1'
    and lane_id = 'incremental_fast_6h'
    and superseded_at is null
  order by id limit 1
);

savepoint runtime_disabled_materialize;
update equora_private.broker_capture_runtime_enrollment
set enabled = false, updated_at = clock_timestamp()
where singleton_key is true;
set local role service_role;
select public.equora_materialize_next_due_broker_capture_v1(
  '91500000-0000-4000-8000-000000000001', 'broker-capture-schedule-v1'
);
reset role;
do $$ begin
  if (select result ->> 'status'
      from public.broker_capture_materialization_commands
      where request_id = '91500000-0000-4000-8000-000000000001') <> 'no_due'
    or exists (select 1 from public.broker_capture_work_units
      where sync_activation_id = (
        select (result ->> 'syncActivationId')::uuid
        from public.broker_connection_setup_commands
        where id = '91000000-0000-4000-8000-000000000009'
      ))
  then raise exception 'RUNTIME_DISABLED_ENROLLMENT_MATERIALIZED_WORK'; end if;
end $$;
rollback to savepoint runtime_disabled_materialize;
do $$ begin
  if (select count(*)
      from public.broker_sync_lane_states lane
      where lane.sync_activation_id = (
        select (result ->> 'syncActivationId')::uuid
        from public.broker_connection_setup_commands
        where id = '91000000-0000-4000-8000-000000000009'
      )
        and lane.superseded_at is null
        and lane.next_due_at <= clock_timestamp()
        and public.equora_lane_execution_allowed_v1(
          lane.id, 'scheduler', clock_timestamp()
        )) <> 1
  then raise exception 'RUNTIME_CURRENT_LANE_NOT_SCHEDULER_ELIGIBLE'; end if;
end $$;
set local role service_role;
select public.equora_materialize_next_due_broker_capture_v1(
  '91500000-0000-4000-8000-000000000002', 'broker-capture-schedule-v1'
);
-- EQUORA_RUNTIME_ENROLLMENT_CLAIM_RACE_SETUP_END
reset role;
do $$ begin
  if (select result ->> 'status'
      from public.broker_capture_materialization_commands
      where request_id = '91500000-0000-4000-8000-000000000002') <> 'scheduled'
  then raise exception 'RUNTIME_ENABLED_ENROLLMENT_DID_NOT_MATERIALIZE'; end if;
end $$;
select set_config(
  'equora.test.enrolled_work_unit_id',
  (select result ->> 'workUnitId'
   from public.broker_capture_materialization_commands
   where request_id = '91500000-0000-4000-8000-000000000002'),
  false
);
update equora_private.broker_capture_runtime_enrollment
set enabled = false, updated_at = clock_timestamp()
where singleton_key is true;
set local role service_role;
do $$ begin
  begin
    perform public.equora_claim_broker_capture_work_unit_v2(
      current_setting('equora.test.enrolled_work_unit_id')::uuid, 0,
      '91600000-0000-4000-8000-000000000009',
      '91700000-0000-4000-8000-000000000009',
      'broker-capture-claim-v1'
    );
    raise exception 'RUNTIME_DISABLED_ENROLLMENT_CLAIMED_WORK';
  exception when others then
    if sqlerrm <> 'CONTROL_RUNTIME_ENROLLMENT_INVALID' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  if exists (
    select 1 from public.broker_capture_work_units
    where id = current_setting('equora.test.enrolled_work_unit_id')::uuid
      and (status <> 'pending' or row_version <> 0 or attempt <> 0
        or claim_count <> 0 or lease_token_digest is not null)
  ) then raise exception 'RUNTIME_DISABLED_ENROLLMENT_CLAIM_PARTIAL_EFFECT'; end if;
end $$;
update equora_private.broker_capture_runtime_enrollment
set enabled = true, updated_at = clock_timestamp()
where singleton_key is true;
set local role service_role;
select public.equora_claim_broker_capture_work_unit_v2(
  current_setting('equora.test.enrolled_work_unit_id')::uuid, 0,
  '91600000-0000-4000-8000-000000000001',
  '91700000-0000-4000-8000-000000000001',
  'broker-capture-claim-v1'
);
reset role;

update equora_private.broker_capture_runtime_enrollment
set enabled = false, updated_at = clock_timestamp()
where singleton_key is true;
select set_config(
  'equora.test.enrolled_checkpoint_mac',
  (select checkpoint ->> 'checkpointMac'
   from public.broker_capture_work_units
   where id = current_setting('equora.test.enrolled_work_unit_id')::uuid),
  false
);
set local role service_role;
do $$ begin
  perform public.equora_authorize_broker_capture_request_v1(
    current_setting('equora.test.enrolled_work_unit_id')::uuid,
    1, 1,
    current_setting('equora.test.enrolled_checkpoint_mac'),
    '91700000-0000-4000-8000-000000000001',
    '91800000-0000-4000-8000-000000000001'
  );
  raise exception 'RUNTIME_DISABLED_ENROLLMENT_AUTHORIZED_REQUEST';
exception when others then
  if sqlerrm <> 'REQUEST_AUTH_RUNTIME_ENROLLMENT_INVALID' then raise; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.broker_capture_request_authorizations
      where id = '91800000-0000-4000-8000-000000000001')
  then raise exception 'RUNTIME_DISABLED_ENROLLMENT_PERMIT_PARTIAL_EFFECT'; end if;
end $$;

update equora_private.broker_capture_runtime_enrollment
set enabled = true, updated_at = clock_timestamp()
where singleton_key is true;
set local role service_role;
select public.equora_release_broker_capture_lease_v1(
  current_setting('equora.test.enrolled_work_unit_id')::uuid, 1,
  '91700000-0000-4000-8000-000000000001',
  '91900000-0000-4000-8000-000000000001',
  'cooperative_shutdown', 'lease-control-v1'
);
reset role;

select result ->> 'connectionId' as runtime_connection_id
from public.broker_connection_setup_commands
where id = '91000000-0000-4000-8000-000000000009'
\gset

select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-4000-8000-000000000009',
  true
);
set local role authenticated;
select public.equora_request_mexc_connection_revocation_v1(
  :'runtime_connection_id'::uuid,
  '92000000-0000-4000-8000-000000000009'
);
reset role;
set local role service_role;
select public.equora_apply_mexc_connection_revocation_v1(
  '92000000-0000-4000-8000-000000000009'
);
-- Exact service replay remains a no-op at the lifecycle authority.
select public.equora_apply_mexc_connection_revocation_v1(
  '92000000-0000-4000-8000-000000000009'
);
reset role;

do $$
begin
  if (select status from public.broker_connections
      where id = (select (result ->> 'connectionId')::uuid
        from public.broker_connection_setup_commands
        where id = '91000000-0000-4000-8000-000000000009')) <> 'revoked'
    or (select permissions from public.broker_connections
      where id = (select (result ->> 'connectionId')::uuid
        from public.broker_connection_setup_commands
        where id = '91000000-0000-4000-8000-000000000009')) <> '{}'::text[]
    or (select encrypted_payload from public.broker_credentials
      where id = (select credential_reference from public.broker_connections
        where id = (select (result ->> 'connectionId')::uuid
          from public.broker_connection_setup_commands
          where id = '91000000-0000-4000-8000-000000000009'))) <>
      '{"v":"revoked","iv":"","tag":"","data":""}'
    or exists (select 1 from public.broker_sync_activations
      where user_id = '90000000-0000-4000-8000-000000000009'
        and activation_state <> 'revoked')
    or exists (select 1 from equora_private.broker_capture_integrity_keys
      where user_id = '90000000-0000-4000-8000-000000000009'
        and status <> 'revoked')
  then raise exception 'RUNTIME_REVOCATION_ATOMIC_BOUNDARY_INVALID'; end if;
end;
$$;

rollback;

-- The migration installs no trigger or scheduled job and never grants direct
-- secret-table access to a runtime role.
do $$
begin
  if exists (
    select 1 from pg_trigger
    where not tgisinternal
      and tgrelid in (
        'public.broker_connection_setup_commands'::regclass,
        'public.broker_capture_scope_finalization_receipts'::regclass
      )
  )
    or has_table_privilege('service_role',
      'public.broker_credentials', 'select')
    or has_table_privilege('authenticated',
      'public.broker_credentials', 'select')
    or has_table_privilege('service_role',
      'equora_private.broker_capture_integrity_keys', 'select')
  then raise exception 'RUNTIME_DEPLOYMENT_PASSIVE_BOUNDARY_INVALID'; end if;
end;
$$;

-- Simulate explicit grants left by a project-specific role/default privilege.
-- The following migration re-run must normalize both grants before its exact
-- ACL postflight succeeds.
grant select on table public.broker_connection_setup_commands
  to supabase_auth_admin;
grant execute on function public.equora_load_broker_capture_material_v1(uuid)
  to supabase_auth_admin;
