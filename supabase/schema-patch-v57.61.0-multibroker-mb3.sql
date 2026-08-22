-- Equora v57.61.0 / MB3 additive provider-neutral persistence foundation.
--
-- This migration is deliberately NOT referenced by deploy-v57.61.0.sql. It is
-- a local, review-gated candidate and performs no Production or Supabase action
-- by merely existing in the repository. It preserves all existing MEXC v1/v2
-- rows and RPCs and creates no runtime enrollment or checkpoint row.
\set ON_ERROR_STOP on

begin;

do $$
declare
  v_expected jsonb := jsonb_build_object(
    'equora_v57.61.0_broker_capture_v1', '492ebad5496806ad60425abd58e9801c58a58b421e38392d54e6082d7fa2b083',
    'equora_v57.61.0_g1_capture_control_v1', 'c133d5e0c987e7f927963db4465ef5ab2f6f4c174cfdc96a3ed1cffb5cd62be5',
    'equora_v57.61.0_g1_lane_authority_v1', '6be313155e81e0f14c48d0c71301e28a75b792a90e49542bc49ffe638f56c68d',
    'equora_v57.61.0_g1_activation_authority_v1', 'b074a756a015b34a7e3da804f3d3955100a40f9a6391855a75c1e415cbbb2abb',
    'equora_v57.61.0_g1_scheduler_control_v2', '87158546782b900817d3f36501a2e43b5619906a2f07636d0cb1167b042e5ab7',
    'equora_v57.61.0_g1_runtime_deployment_v1', '892f1587e8e37937a538dad1239ec931d43bd1f65d2f224d56ab7b9356f89e96',
    'equora_v57.61.0_broker_provider_rls_v1', 'd72047ce5e28e1400869a9abdcdad650a4f1b3b11e1e1b7cb07a9b37157eca47'
  );
  v_actual jsonb;
begin
  if to_regclass('equora_private.schema_migrations') is null then
    raise exception 'MB3_BASELINE_MISSING';
  end if;

  select coalesce(jsonb_object_agg(migration_id, contract_fingerprint), '{}'::jsonb)
    into v_actual
  from equora_private.schema_migrations
  where migration_id = any(array[
    'equora_v57.61.0_broker_capture_v1',
    'equora_v57.61.0_g1_capture_control_v1',
    'equora_v57.61.0_g1_lane_authority_v1',
    'equora_v57.61.0_g1_activation_authority_v1',
    'equora_v57.61.0_g1_scheduler_control_v2',
    'equora_v57.61.0_g1_runtime_deployment_v1',
    'equora_v57.61.0_broker_provider_rls_v1'
  ]);

  if v_actual is distinct from v_expected then
    raise exception 'MB3_BASELINE_RECEIPT_DRIFT';
  end if;

  if exists (
    select 1 from equora_private.schema_migrations
    where migration_id = 'equora_v57.61.0_multibroker_mb3_v1'
      and contract_fingerprint is distinct from
        '32b297e73ce92932eb494296f242794e5a36c4dfdcaed0043ba6458dad0c9c19'
  ) then
    raise exception 'MB3_MARKER_DRIFT';
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'equora_broker_operator_control_v2') then
    create role equora_broker_operator_control_v2
      nosuperuser nocreatedb nocreaterole nologin noinherit noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'equora_broker_runtime_v2') then
    create role equora_broker_runtime_v2
      nosuperuser nocreatedb nocreaterole nologin noinherit noreplication nobypassrls;
  end if;
end;
$$;

alter role equora_broker_operator_control_v2
  nocreatedb nocreaterole nologin noinherit;
alter role equora_broker_runtime_v2
  nocreatedb nocreaterole nologin noinherit;
alter role equora_broker_operator_control_v2 reset all;
alter role equora_broker_runtime_v2 reset all;
revoke equora_broker_operator_control_v2 from equora_broker_runtime_v2;
revoke equora_broker_runtime_v2 from equora_broker_operator_control_v2;
do $$
begin
  execute format('grant equora_broker_operator_control_v2 to %I', current_user);
  execute format('grant equora_broker_runtime_v2 to %I', current_user);
end;
$$;
grant usage, create on schema public
  to equora_broker_operator_control_v2, equora_broker_runtime_v2;
grant usage on schema equora_private
  to equora_broker_operator_control_v2, equora_broker_runtime_v2;

-- EQUORA_MB3_FAILPOINT_AFTER_ROLES

create table if not exists public.broker_provider_capability_contracts_v2 (
  provider_code text not null,
  provider_contract_version text not null,
  capability_id text not null,
  capability_contract_version text not null,
  adapter_policy_version text not null,
  page_scope_contract_version text not null,
  query_contract_version text not null,
  cursor_contract_version text not null,
  response_contract_version text not null,
  raw_envelope_contract_version text not null,
  normalization_contract_version text not null,
  checkpoint_contract_version text not null,
  checkpoint_mac_version text not null,
  read_method text not null,
  registry_status text not null,
  registry_generation bigint not null,
  provider_account_cap integer not null,
  provider_capability_cap integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (
    provider_code, provider_contract_version,
    capability_id, capability_contract_version
  ),
  constraint broker_provider_capability_contracts_v2_full_contract_unique
    unique (
      provider_code, provider_contract_version,
      capability_id, capability_contract_version,
      page_scope_contract_version, query_contract_version,
      cursor_contract_version, response_contract_version,
      raw_envelope_contract_version, normalization_contract_version,
      checkpoint_contract_version, checkpoint_mac_version
    ),
  constraint broker_provider_capability_contracts_v2_provider_fkey
    foreign key (provider_code)
    references public.broker_providers (provider_code) on delete restrict,
  constraint broker_provider_capability_contracts_v2_version_check
    check (
      provider_code ~ '^[a-z][a-z0-9_]{0,62}$'
      and provider_contract_version ~ '^[a-z][a-z0-9_.-]{0,126}$'
      and capability_id ~ '^[a-z][a-z0-9_]{0,62}$'
      and capability_contract_version ~ '^[a-z][a-z0-9_.-]{0,126}$'
      and adapter_policy_version ~ '^[a-z][a-z0-9_.-]{0,126}$'
      and page_scope_contract_version ~ '^[a-z][a-z0-9_.-]{0,126}$'
      and query_contract_version ~ '^[a-z][a-z0-9_.-]{0,126}$'
      and cursor_contract_version ~ '^[a-z][a-z0-9_.-]{0,126}$'
      and response_contract_version ~ '^[a-z][a-z0-9_.-]{0,126}$'
      and raw_envelope_contract_version ~ '^[a-z][a-z0-9_.-]{0,126}$'
      and normalization_contract_version ~ '^[a-z][a-z0-9_.-]{0,126}$'
      and checkpoint_contract_version ~ '^[a-z][a-z0-9_.-]{0,126}$'
      and checkpoint_mac_version ~ '^[a-z][a-z0-9_.-]{0,126}$'
    ),
  constraint broker_provider_capability_contracts_v2_readonly_check
    check (read_method = 'GET'),
  constraint broker_provider_capability_contracts_v2_status_check
    check (registry_status in ('verified', 'suspended', 'retired')),
  constraint broker_provider_capability_contracts_v2_generation_check
    check (registry_generation > 0),
  constraint broker_provider_capability_contracts_v2_caps_check
    check (
      provider_account_cap between 1 and 4
      and provider_capability_cap between 1 and 32
    ),
  constraint broker_provider_capability_contracts_v2_normalization_check
    check (normalization_contract_version = 'blocked_pending_versioned_normalization'),
  constraint broker_provider_capability_contracts_v2_time_check
    check (updated_at >= created_at)
);

alter table public.broker_provider_capability_contracts_v2
  owner to equora_broker_operator_control_v2;
revoke all on table public.broker_provider_capability_contracts_v2
  from public, anon, authenticated, service_role, equora_broker_runtime_v2;
grant select on table public.broker_provider_capability_contracts_v2
  to authenticated;

insert into public.broker_provider_capability_contracts_v2 (
  provider_code, provider_contract_version,
  capability_id, capability_contract_version,
  adapter_policy_version, page_scope_contract_version,
  query_contract_version, cursor_contract_version,
  response_contract_version, raw_envelope_contract_version,
  normalization_contract_version, checkpoint_contract_version,
  checkpoint_mac_version, read_method, registry_status,
  registry_generation, provider_account_cap, provider_capability_cap
) values
  ('mexc','mexc_futures_contract_v1','historical_orders_v1','mexc_historical_orders_capability_v1','equora_mb3_adapter_policy_v1','equora_provider_page_scope_v2','mexc_historical_orders_query_v1','mexc_page_number_cursor_v1','mexc_historical_orders_response_v1','equora_provider_raw_envelope_v2','blocked_pending_versioned_normalization','equora_provider_checkpoint_v2','equora_provider_checkpoint_hmac_sha256_v2','GET','verified',1,1,16),
  ('mexc','mexc_futures_contract_v1','historical_executions_v3','mexc_historical_executions_capability_v1','equora_mb3_adapter_policy_v1','equora_provider_page_scope_v2','mexc_historical_executions_query_v1','mexc_page_number_cursor_v1','mexc_historical_executions_response_v1','equora_provider_raw_envelope_v2','blocked_pending_versioned_normalization','equora_provider_checkpoint_v2','equora_provider_checkpoint_hmac_sha256_v2','GET','verified',1,1,16),
  ('mexc','mexc_futures_contract_v1','historical_positions_v1','mexc_historical_positions_capability_v1','equora_mb3_adapter_policy_v1','equora_provider_page_scope_v2','mexc_historical_positions_query_v1','mexc_page_number_cursor_v1','mexc_historical_positions_response_v1','equora_provider_raw_envelope_v2','blocked_pending_versioned_normalization','equora_provider_checkpoint_v2','equora_provider_checkpoint_hmac_sha256_v2','GET','verified',1,1,16),
  ('mexc','mexc_futures_contract_v1','funding_records_v1','mexc_funding_records_capability_v1','equora_mb3_adapter_policy_v1','equora_provider_page_scope_v2','mexc_funding_records_query_v1','mexc_page_number_cursor_v1','mexc_funding_records_response_v1','equora_provider_raw_envelope_v2','blocked_pending_versioned_normalization','equora_provider_checkpoint_v2','equora_provider_checkpoint_hmac_sha256_v2','GET','verified',1,1,16)
on conflict do nothing;

do $$
declare
  v_expected jsonb := jsonb_build_array(
    jsonb_build_array('funding_records_v1','mexc_funding_records_capability_v1','mexc_funding_records_query_v1','mexc_funding_records_response_v1'),
    jsonb_build_array('historical_executions_v3','mexc_historical_executions_capability_v1','mexc_historical_executions_query_v1','mexc_historical_executions_response_v1'),
    jsonb_build_array('historical_orders_v1','mexc_historical_orders_capability_v1','mexc_historical_orders_query_v1','mexc_historical_orders_response_v1'),
    jsonb_build_array('historical_positions_v1','mexc_historical_positions_capability_v1','mexc_historical_positions_query_v1','mexc_historical_positions_response_v1')
  );
  v_actual jsonb;
begin
  select jsonb_agg(
      jsonb_build_array(
        capability_id, capability_contract_version,
        query_contract_version, response_contract_version
      ) order by capability_id
    ) into v_actual
  from public.broker_provider_capability_contracts_v2
  where provider_code = 'mexc'
    and provider_contract_version = 'mexc_futures_contract_v1'
    and adapter_policy_version = 'equora_mb3_adapter_policy_v1'
    and page_scope_contract_version = 'equora_provider_page_scope_v2'
    and cursor_contract_version = 'mexc_page_number_cursor_v1'
    and raw_envelope_contract_version = 'equora_provider_raw_envelope_v2'
    and normalization_contract_version = 'blocked_pending_versioned_normalization'
    and checkpoint_contract_version = 'equora_provider_checkpoint_v2'
    and checkpoint_mac_version = 'equora_provider_checkpoint_hmac_sha256_v2'
    and read_method = 'GET'
    and registry_status = 'verified'
    and registry_generation = 1
    and provider_account_cap = 1
    and provider_capability_cap = 16;
  if v_actual is distinct from v_expected
    or (select count(*) from public.broker_provider_capability_contracts_v2) <> 4
  then
    raise exception 'MB3_CAPABILITY_REGISTRY_DRIFT';
  end if;
end;
$$;

-- EQUORA_MB3_FAILPOINT_AFTER_REGISTRY

create table if not exists public.broker_runtime_enrollments_v2 (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  broker_account_id uuid not null,
  provider_code text not null,
  provider_contract_version text not null,
  capability_id text not null,
  capability_contract_version text not null,
  runtime_state text not null,
  generation bigint not null,
  authority_epoch bigint not null,
  last_operator_command_id uuid not null,
  enrolled_at timestamptz not null,
  updated_at timestamptz not null,
  revoked_at timestamptz,
  constraint broker_runtime_enrollments_v2_account_fkey
    foreign key (broker_account_id, user_id, provider_code)
    references public.broker_accounts (id, user_id, provider_code)
    on delete restrict,
  constraint broker_runtime_enrollments_v2_capability_fkey
    foreign key (
      provider_code, provider_contract_version,
      capability_id, capability_contract_version
    ) references public.broker_provider_capability_contracts_v2 (
      provider_code, provider_contract_version,
      capability_id, capability_contract_version
    ) on delete restrict,
  constraint broker_runtime_enrollments_v2_state_check
    check (runtime_state in ('suspended', 'active', 'revoked')),
  constraint broker_runtime_enrollments_v2_generation_check
    check (generation > 0 and authority_epoch > 0),
  constraint broker_runtime_enrollments_v2_time_check
    check (
      updated_at >= enrolled_at
      and ((runtime_state = 'revoked') = (revoked_at is not null))
      and (revoked_at is null or revoked_at >= enrolled_at)
    ),
  constraint broker_runtime_enrollments_v2_identity_unique
    unique (
      id, user_id, broker_account_id, provider_code,
      provider_contract_version, capability_id,
      capability_contract_version
    ),
  constraint broker_runtime_enrollments_v2_composite_unique
    unique (
      id, user_id, broker_account_id, provider_code,
      provider_contract_version, capability_id,
      capability_contract_version, generation
    )
);

create table if not exists public.broker_operator_control_receipts_v2 (
  command_id uuid primary key,
  enrollment_id uuid not null,
  user_id uuid not null references auth.users (id) on delete restrict,
  broker_account_id uuid not null,
  provider_code text not null,
  provider_contract_version text not null,
  capability_id text not null,
  capability_contract_version text not null,
  action text not null,
  expected_generation bigint not null,
  resulting_generation bigint not null,
  input_digest text not null,
  command_policy_version text not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint broker_operator_control_receipts_v2_action_check
    check (action in ('enroll', 'resume', 'suspend', 'revoke')),
  constraint broker_operator_control_receipts_v2_generation_check
    check (expected_generation >= 0 and resulting_generation = expected_generation + 1),
  constraint broker_operator_control_receipts_v2_digest_check
    check (input_digest ~ '^[a-f0-9]{64}$'),
  constraint broker_operator_control_receipts_v2_policy_check
    check (command_policy_version = 'equora_provider_operator_command_v2'),
  constraint broker_operator_control_receipts_v2_result_check
    check (jsonb_typeof(result) = 'object'),
  constraint broker_operator_control_receipts_v2_enrollment_fkey
    foreign key (
      enrollment_id, user_id, broker_account_id, provider_code,
      provider_contract_version, capability_id,
      capability_contract_version
    ) references public.broker_runtime_enrollments_v2 (
      id, user_id, broker_account_id, provider_code,
      provider_contract_version, capability_id,
      capability_contract_version
    ) on delete restrict deferrable initially deferred
);

create table if not exists public.broker_capture_checkpoints_v2 (
  work_unit_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  broker_account_id uuid not null,
  sync_activation_id uuid not null,
  activation_generation integer not null,
  provider_code text not null,
  provider_contract_version text not null,
  capability_id text not null,
  capability_contract_version text not null,
  page_scope_contract_version text not null,
  query_contract_version text not null,
  cursor_contract_version text not null,
  response_contract_version text not null,
  raw_envelope_contract_version text not null,
  normalization_contract_version text not null,
  checkpoint_contract_version text not null,
  checkpoint_mac_version text not null,
  contract_snapshot_digest text not null,
  page_scope_digest text not null,
  query_digest text not null,
  checkpoint_generation bigint not null,
  row_version bigint not null,
  checkpoint_payload jsonb not null,
  checkpoint_mac text not null,
  checkpoint_status text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint broker_capture_checkpoints_v2_work_unit_fkey
    foreign key (work_unit_id, user_id, broker_account_id)
    references public.broker_capture_work_units (id, user_id, broker_account_id)
    on delete restrict,
  constraint broker_capture_checkpoints_v2_activation_fkey
    foreign key (
      sync_activation_id, user_id, broker_account_id,
      activation_generation
    ) references public.broker_sync_activations (
      id, user_id, broker_account_id,
      activation_generation
    ) on delete restrict,
  constraint broker_capture_checkpoints_v2_capability_fkey
    foreign key (
      provider_code, provider_contract_version,
      capability_id, capability_contract_version,
      page_scope_contract_version, query_contract_version,
      cursor_contract_version, response_contract_version,
      raw_envelope_contract_version, normalization_contract_version,
      checkpoint_contract_version, checkpoint_mac_version
    ) references public.broker_provider_capability_contracts_v2 (
      provider_code, provider_contract_version,
      capability_id, capability_contract_version,
      page_scope_contract_version, query_contract_version,
      cursor_contract_version, response_contract_version,
      raw_envelope_contract_version, normalization_contract_version,
      checkpoint_contract_version, checkpoint_mac_version
    ) on delete restrict,
  constraint broker_capture_checkpoints_v2_digest_check
    check (
      page_scope_digest ~ '^[a-f0-9]{64}$'
      and query_digest ~ '^[a-f0-9]{64}$'
      and contract_snapshot_digest ~ '^[a-f0-9]{64}$'
      and checkpoint_mac ~ '^[a-f0-9]{64}$'
    ),
  constraint broker_capture_checkpoints_v2_generation_check
    check (checkpoint_generation >= 0 and row_version >= 0),
  constraint broker_capture_checkpoints_v2_payload_check
    check (jsonb_typeof(checkpoint_payload) = 'object'),
  constraint broker_capture_checkpoints_v2_status_check
    check (checkpoint_status in ('ready', 'continue', 'complete', 'partial', 'blocked')),
  constraint broker_capture_checkpoints_v2_normalization_check
    check (normalization_contract_version = 'blocked_pending_versioned_normalization'),
  constraint broker_capture_checkpoints_v2_time_check
    check (updated_at >= created_at),
  constraint broker_capture_checkpoints_v2_composite_unique
    unique (
      work_unit_id, user_id, broker_account_id,
      sync_activation_id, activation_generation,
      provider_code, provider_contract_version,
      capability_id, capability_contract_version
    )
);

create table if not exists public.broker_capture_request_authorizations_v2 (
  id uuid primary key,
  enrollment_id uuid not null,
  enrollment_generation bigint not null,
  user_id uuid not null references auth.users (id) on delete restrict,
  broker_account_id uuid not null,
  sync_activation_id uuid not null,
  activation_generation integer not null,
  work_unit_id uuid not null,
  provider_code text not null,
  provider_contract_version text not null,
  capability_id text not null,
  capability_contract_version text not null,
  checkpoint_row_version bigint not null,
  checkpoint_generation bigint not null,
  checkpoint_mac text not null,
  contract_snapshot_digest text not null,
  request_sequence integer not null,
  authorization_attempt integer not null,
  page_scope_digest text not null,
  query_digest text not null,
  request_plan_digest text not null,
  input_digest text not null,
  authorization_status text not null default 'issued',
  send_deadline_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  consumed_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  constraint broker_capture_request_auth_v2_enrollment_fkey
    foreign key (
      enrollment_id, user_id, broker_account_id, provider_code,
      provider_contract_version, capability_id,
      capability_contract_version
    ) references public.broker_runtime_enrollments_v2 (
      id, user_id, broker_account_id, provider_code,
      provider_contract_version, capability_id,
      capability_contract_version
    ) on delete restrict,
  constraint broker_capture_request_auth_v2_checkpoint_fkey
    foreign key (
      work_unit_id, user_id, broker_account_id,
      sync_activation_id, activation_generation,
      provider_code, provider_contract_version,
      capability_id, capability_contract_version
    ) references public.broker_capture_checkpoints_v2 (
      work_unit_id, user_id, broker_account_id,
      sync_activation_id, activation_generation,
      provider_code, provider_contract_version,
      capability_id, capability_contract_version
    ) on delete restrict,
  constraint broker_capture_request_auth_v2_digest_check
    check (
      checkpoint_mac ~ '^[a-f0-9]{64}$'
      and contract_snapshot_digest ~ '^[a-f0-9]{64}$'
      and page_scope_digest ~ '^[a-f0-9]{64}$'
      and query_digest ~ '^[a-f0-9]{64}$'
      and request_plan_digest ~ '^[a-f0-9]{64}$'
      and input_digest ~ '^[a-f0-9]{64}$'
    ),
  constraint broker_capture_request_auth_v2_sequence_check
    check (
      checkpoint_row_version >= 0
      and checkpoint_generation >= 0
      and request_sequence > 0
      and authorization_attempt > 0
    ),
  constraint broker_capture_request_auth_v2_status_check
    check (authorization_status in ('issued', 'consumed', 'revoked')),
  constraint broker_capture_request_auth_v2_time_check
    check (
      send_deadline_at > created_at
      and ((authorization_status = 'consumed') = (consumed_at is not null))
      and (consumed_at is null or consumed_at >= created_at)
      and ((authorization_status = 'revoked') = (revoked_at is not null))
      and (revoked_at is null or revoked_at >= created_at)
      and ((authorization_status = 'revoked') = (revocation_reason is not null))
    )
);

create table if not exists public.broker_capture_page_commits_v2 (
  id uuid primary key,
  request_authorization_id uuid not null unique,
  enrollment_id uuid not null,
  enrollment_generation bigint not null,
  user_id uuid not null references auth.users (id) on delete restrict,
  broker_account_id uuid not null,
  sync_activation_id uuid not null,
  activation_generation integer not null,
  work_unit_id uuid not null,
  provider_code text not null,
  provider_contract_version text not null,
  capability_id text not null,
  capability_contract_version text not null,
  contract_snapshot_digest text not null,
  request_sequence integer not null,
  request_plan_digest text not null,
  raw_envelope_contract_version text not null,
  raw_envelope jsonb not null,
  raw_envelope_digest text not null,
  response_digest text not null,
  checkpoint_generation_before bigint not null,
  checkpoint_generation_after bigint not null,
  checkpoint_mac_before text not null,
  checkpoint_mac_after text not null,
  checkpoint_status_after text not null,
  scope_completeness text not null,
  input_digest text not null,
  committed_at timestamptz not null default clock_timestamp(),
  constraint broker_capture_page_commits_v2_authorization_fkey
    foreign key (request_authorization_id)
    references public.broker_capture_request_authorizations_v2 (id)
    on delete restrict,
  constraint broker_capture_page_commits_v2_enrollment_fkey
    foreign key (
      enrollment_id, user_id, broker_account_id, provider_code,
      provider_contract_version, capability_id,
      capability_contract_version
    ) references public.broker_runtime_enrollments_v2 (
      id, user_id, broker_account_id, provider_code,
      provider_contract_version, capability_id,
      capability_contract_version
    ) on delete restrict,
  constraint broker_capture_page_commits_v2_digest_check
    check (
      request_plan_digest ~ '^[a-f0-9]{64}$'
      and contract_snapshot_digest ~ '^[a-f0-9]{64}$'
      and raw_envelope_digest ~ '^[a-f0-9]{64}$'
      and response_digest ~ '^[a-f0-9]{64}$'
      and checkpoint_mac_before ~ '^[a-f0-9]{64}$'
      and checkpoint_mac_after ~ '^[a-f0-9]{64}$'
      and input_digest ~ '^[a-f0-9]{64}$'
    ),
  constraint broker_capture_page_commits_v2_generation_check
    check (checkpoint_generation_after = checkpoint_generation_before + 1),
  constraint broker_capture_page_commits_v2_payload_check
    check (jsonb_typeof(raw_envelope) = 'object'),
  constraint broker_capture_page_commits_v2_status_check
    check (checkpoint_status_after in ('continue', 'complete', 'partial', 'blocked')),
  constraint broker_capture_page_commits_v2_completeness_check
    check (
      (checkpoint_status_after in ('continue','complete') and scope_completeness='unverified')
      or (checkpoint_status_after='partial' and scope_completeness='partial')
      or (checkpoint_status_after='blocked' and scope_completeness='failed')
    )
);

create table if not exists public.broker_runtime_authority_receipts_v2 (
  id uuid primary key,
  authority_action text not null,
  request_authorization_id uuid,
  page_commit_id uuid,
  enrollment_id uuid not null,
  enrollment_generation bigint not null,
  user_id uuid not null references auth.users (id) on delete restrict,
  broker_account_id uuid not null,
  provider_code text not null,
  provider_contract_version text not null,
  capability_id text not null,
  capability_contract_version text not null,
  work_unit_id uuid not null,
  input_digest text not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint broker_runtime_authority_receipts_v2_action_check
    check (authority_action in ('request_authorized', 'page_committed')),
  constraint broker_runtime_authority_receipts_v2_reference_check
    check (
      (authority_action = 'request_authorized'
        and request_authorization_id is not null and page_commit_id is null)
      or
      (authority_action = 'page_committed'
        and request_authorization_id is not null and page_commit_id is not null)
    ),
  constraint broker_runtime_authority_receipts_v2_digest_check
    check (input_digest ~ '^[a-f0-9]{64}$'),
  constraint broker_runtime_authority_receipts_v2_result_check
    check (jsonb_typeof(result) = 'object'),
  constraint broker_runtime_authority_receipts_v2_enrollment_fkey
    foreign key (
      enrollment_id, user_id, broker_account_id, provider_code,
      provider_contract_version, capability_id,
      capability_contract_version
    ) references public.broker_runtime_enrollments_v2 (
      id, user_id, broker_account_id, provider_code,
      provider_contract_version, capability_id,
      capability_contract_version
    ) on delete restrict
);

alter table public.broker_runtime_enrollments_v2 enable row level security;
alter table public.broker_operator_control_receipts_v2 enable row level security;
alter table public.broker_capture_checkpoints_v2 enable row level security;
alter table public.broker_capture_request_authorizations_v2 enable row level security;
alter table public.broker_capture_page_commits_v2 enable row level security;
alter table public.broker_runtime_authority_receipts_v2 enable row level security;

alter table public.broker_runtime_enrollments_v2
  owner to equora_broker_operator_control_v2;
alter table public.broker_operator_control_receipts_v2
  owner to equora_broker_operator_control_v2;
alter table public.broker_capture_checkpoints_v2
  owner to equora_broker_runtime_v2;
alter table public.broker_capture_request_authorizations_v2
  owner to equora_broker_runtime_v2;
alter table public.broker_capture_page_commits_v2
  owner to equora_broker_runtime_v2;
alter table public.broker_runtime_authority_receipts_v2
  owner to equora_broker_runtime_v2;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'broker_runtime_enrollments_v2',
    'broker_operator_control_receipts_v2',
    'broker_capture_checkpoints_v2',
    'broker_capture_request_authorizations_v2',
    'broker_capture_page_commits_v2',
    'broker_runtime_authority_receipts_v2'
  ] loop
    execute format('drop policy if exists %I on public.%I',
      'users can read own ' || v_table, v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      'users can read own ' || v_table, v_table
    );
    execute format(
      'revoke all on table public.%I from public, anon, authenticated, service_role',
      v_table
    );
    execute format('grant select on table public.%I to authenticated', v_table);
  end loop;
end;
$$;

-- The two roles are NOLOGIN/NOINHERIT and are reachable only as owners of the
-- closed SECURITY DEFINER RPCs. Explicit policies keep RLS active on the v1
-- source-of-truth tables while allowing those RPC owners to revalidate the
-- exact rows they lock. No application role receives these table privileges.
drop policy if exists broker_accounts_mb3_operator_select
  on public.broker_accounts;
create policy broker_accounts_mb3_operator_select
  on public.broker_accounts for select
  to equora_broker_operator_control_v2 using (true);
drop policy if exists broker_accounts_mb3_operator_lock
  on public.broker_accounts;
create policy broker_accounts_mb3_operator_lock
  on public.broker_accounts for update
  to equora_broker_operator_control_v2 using (true) with check (false);
drop policy if exists broker_accounts_mb3_runtime_select
  on public.broker_accounts;
create policy broker_accounts_mb3_runtime_select
  on public.broker_accounts for select
  to equora_broker_runtime_v2 using (true);
drop policy if exists broker_accounts_mb3_runtime_lock
  on public.broker_accounts;
create policy broker_accounts_mb3_runtime_lock
  on public.broker_accounts for update
  to equora_broker_runtime_v2 using (true) with check (false);
drop policy if exists broker_activations_mb3_runtime_select
  on public.broker_sync_activations;
create policy broker_activations_mb3_runtime_select
  on public.broker_sync_activations for select
  to equora_broker_runtime_v2 using (true);
drop policy if exists broker_activations_mb3_runtime_lock
  on public.broker_sync_activations;
create policy broker_activations_mb3_runtime_lock
  on public.broker_sync_activations for update
  to equora_broker_runtime_v2 using (true) with check (false);
drop policy if exists broker_scopes_mb3_runtime_select
  on public.broker_sync_scopes;
create policy broker_scopes_mb3_runtime_select
  on public.broker_sync_scopes for select
  to equora_broker_runtime_v2 using (true);
drop policy if exists broker_scopes_mb3_runtime_lock
  on public.broker_sync_scopes;
create policy broker_scopes_mb3_runtime_lock
  on public.broker_sync_scopes for update
  to equora_broker_runtime_v2 using (true) with check (false);
drop policy if exists broker_work_units_mb3_runtime_select
  on public.broker_capture_work_units;
create policy broker_work_units_mb3_runtime_select
  on public.broker_capture_work_units for select
  to equora_broker_runtime_v2 using (true);
drop policy if exists broker_work_units_mb3_runtime_update
  on public.broker_capture_work_units;
create policy broker_work_units_mb3_runtime_update
  on public.broker_capture_work_units for update
  to equora_broker_runtime_v2 using (true) with check (true);
drop policy if exists broker_integrity_keys_mb3_runtime_select
  on equora_private.broker_capture_integrity_keys;
create policy broker_integrity_keys_mb3_runtime_select
  on equora_private.broker_capture_integrity_keys for select
  to equora_broker_runtime_v2 using (true);
drop policy if exists broker_integrity_keys_mb3_runtime_lock
  on equora_private.broker_capture_integrity_keys;
create policy broker_integrity_keys_mb3_runtime_lock
  on equora_private.broker_capture_integrity_keys for update
  to equora_broker_runtime_v2 using (true) with check (false);
drop policy if exists broker_enrollments_mb3_runtime_select
  on public.broker_runtime_enrollments_v2;
create policy broker_enrollments_mb3_runtime_select
  on public.broker_runtime_enrollments_v2 for select
  to equora_broker_runtime_v2 using (true);
drop policy if exists broker_enrollments_mb3_runtime_lock
  on public.broker_runtime_enrollments_v2;
create policy broker_enrollments_mb3_runtime_lock
  on public.broker_runtime_enrollments_v2 for update
  to equora_broker_runtime_v2 using (true) with check (false);

grant select, update on table public.broker_accounts
  to equora_broker_operator_control_v2, equora_broker_runtime_v2;
grant select, update on table public.broker_sync_activations,
  public.broker_sync_scopes,
  equora_private.broker_capture_integrity_keys
  to equora_broker_runtime_v2;

revoke all on table
  public.broker_runtime_enrollments_v2,
  public.broker_operator_control_receipts_v2
from equora_broker_runtime_v2;
grant select, update on table
  public.broker_runtime_enrollments_v2
to equora_broker_runtime_v2;

grant select on table
  public.broker_accounts,
  public.broker_sync_activations,
  public.broker_sync_scopes,
  public.broker_capture_work_units
to equora_broker_operator_control_v2, equora_broker_runtime_v2;
grant select on table equora_private.broker_capture_integrity_keys
  to equora_broker_runtime_v2;

create index if not exists idx_broker_capability_contracts_v2_status
  on public.broker_provider_capability_contracts_v2
  (provider_code, registry_status, registry_generation, capability_id);
create index if not exists idx_broker_runtime_enrollments_v2_owner_state
  on public.broker_runtime_enrollments_v2
  (user_id, runtime_state, provider_code, broker_account_id, capability_id);
create unique index if not exists idx_broker_runtime_enrollments_v2_live_scope
  on public.broker_runtime_enrollments_v2
  (user_id, broker_account_id, provider_code, capability_id)
  where runtime_state <> 'revoked';
create index if not exists idx_broker_runtime_enrollments_v2_account_fkey
  on public.broker_runtime_enrollments_v2
  (broker_account_id, user_id, provider_code);
create index if not exists idx_broker_operator_receipts_v2_enrollment
  on public.broker_operator_control_receipts_v2
  (enrollment_id, resulting_generation, created_at, command_id);
create index if not exists idx_broker_checkpoints_v2_claim_path
  on public.broker_capture_checkpoints_v2
  (provider_code, capability_id, checkpoint_status, updated_at, work_unit_id)
  where checkpoint_status in ('ready', 'continue');
create index if not exists idx_broker_checkpoints_v2_activation_fkey
  on public.broker_capture_checkpoints_v2
  (sync_activation_id, user_id, broker_account_id, activation_generation,
   provider_code, provider_contract_version);
create index if not exists idx_broker_request_auth_v2_open
  on public.broker_capture_request_authorizations_v2
  (send_deadline_at, provider_code, work_unit_id, id)
  where authorization_status = 'issued';
create unique index if not exists idx_broker_request_auth_v2_single_issued
  on public.broker_capture_request_authorizations_v2
  (work_unit_id, request_sequence)
  where authorization_status = 'issued';
create index if not exists idx_broker_request_auth_v2_enrollment_fkey
  on public.broker_capture_request_authorizations_v2
  (enrollment_id, user_id, broker_account_id, provider_code,
   provider_contract_version, capability_id,
   capability_contract_version, enrollment_generation);
create index if not exists idx_broker_page_commits_v2_owner_keyset
  on public.broker_capture_page_commits_v2
  (user_id, committed_at desc, id);
create index if not exists idx_broker_page_commits_v2_enrollment_fkey
  on public.broker_capture_page_commits_v2
  (enrollment_id, user_id, broker_account_id, provider_code,
   provider_contract_version, capability_id,
   capability_contract_version, enrollment_generation);
create index if not exists idx_broker_runtime_receipts_v2_owner_keyset
  on public.broker_runtime_authority_receipts_v2
  (user_id, created_at desc, id);

-- EQUORA_MB3_FAILPOINT_AFTER_TABLES

create or replace function public.equora_provider_operator_command_digest_v2(
  p_command_id uuid,
  p_enrollment_id uuid,
  p_action text,
  p_user_id uuid,
  p_broker_account_id uuid,
  p_provider_code text,
  p_provider_contract_version text,
  p_capability_id text,
  p_capability_contract_version text,
  p_expected_generation bigint,
  p_command_policy_version text
) returns text
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select public.equora_tcj_digest_v1(
    'provider_operator_command_v2',
    public.equora_tcj_from_jsonb_v1(jsonb_build_object(
      'action', p_action,
      'broker_account_id', p_broker_account_id::text,
      'capability_contract_version', p_capability_contract_version,
      'capability_id', p_capability_id,
      'command_id', p_command_id::text,
      'command_policy_version', p_command_policy_version,
      'enrollment_id', p_enrollment_id::text,
      'expected_generation', p_expected_generation,
      'provider_code', p_provider_code,
      'provider_contract_version', p_provider_contract_version,
      'user_id', p_user_id::text
    ))
  )
$$;

create or replace function public.equora_provider_page_scope_digest_v2(
  p_binding jsonb
) returns text
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
begin
  if not public.equora_jsonb_exact_keys_v1(p_binding, array[
    'capabilityContractVersion', 'capabilityId', 'checkpointContractVersion',
    'providerCode', 'providerContractVersion', 'queryContractVersion',
    'queryDigest'
  ])
    or p_binding ->> 'providerCode' !~ '^[a-z][a-z0-9_]{0,62}$'
    or p_binding ->> 'queryDigest' !~ '^[a-f0-9]{64}$'
  then
    raise exception 'MB3_PAGE_SCOPE_INVALID';
  end if;
  return public.equora_tcj_digest_v1(
    'provider_page_scope_v2',
    public.equora_tcj_from_jsonb_v1(p_binding)
  );
end;
$$;

create or replace function public.equora_provider_contract_snapshot_digest_v2(
  p_provider_code text,
  p_provider_contract_version text,
  p_capability_id text,
  p_capability_contract_version text,
  p_page_scope_contract_version text,
  p_query_contract_version text,
  p_cursor_contract_version text,
  p_response_contract_version text,
  p_raw_envelope_contract_version text,
  p_normalization_contract_version text,
  p_checkpoint_contract_version text,
  p_checkpoint_mac_version text
) returns text
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select public.equora_tcj_digest_v1(
    'provider_contract_snapshot_v2',
    public.equora_tcj_from_jsonb_v1(jsonb_build_object(
      'capabilityContractVersion',p_capability_contract_version,
      'capabilityId',p_capability_id,
      'checkpointContractVersion',p_checkpoint_contract_version,
      'checkpointMacVersion',p_checkpoint_mac_version,
      'cursorContractVersion',p_cursor_contract_version,
      'normalizationContractVersion',p_normalization_contract_version,
      'pageScopeContractVersion',p_page_scope_contract_version,
      'providerCode',p_provider_code,
      'providerContractVersion',p_provider_contract_version,
      'queryContractVersion',p_query_contract_version,
      'rawEnvelopeContractVersion',p_raw_envelope_contract_version,
      'responseContractVersion',p_response_contract_version
    ))
  );
$$;

-- Runtime may inspect but never mutate the operator-owned registry. This
-- narrow SECURITY DEFINER seam acquires a row-level SHARE lock as the table
-- owner and holds it until the caller transaction ends, closing status and
-- generation TOCTOU without granting Runtime UPDATE authority.
create or replace function public.equora_lock_provider_capability_contract_v2(
  p_provider_code text,
  p_provider_contract_version text,
  p_capability_id text,
  p_capability_contract_version text
) returns setof public.broker_provider_capability_contracts_v2
language sql
security definer
set search_path = ''
rows 1
as $$
  select contract_row
  from public.broker_provider_capability_contracts_v2 contract_row
  where contract_row.provider_code = p_provider_code
    and contract_row.provider_contract_version = p_provider_contract_version
    and contract_row.capability_id = p_capability_id
    and contract_row.capability_contract_version = p_capability_contract_version
  for share of contract_row;
$$;

alter function public.equora_lock_provider_capability_contract_v2(
  text,text,text,text
) owner to equora_broker_operator_control_v2;
revoke all on function public.equora_lock_provider_capability_contract_v2(
  text,text,text,text
) from public, anon, authenticated, service_role,
  equora_broker_operator_control_v2;
grant execute on function public.equora_lock_provider_capability_contract_v2(
  text,text,text,text
) to equora_broker_runtime_v2;

create or replace function public.equora_provider_checkpoint_mac_v2(
  p_provider_code text,
  p_provider_contract_version text,
  p_capability_id text,
  p_capability_contract_version text,
  p_checkpoint_contract_version text,
  p_contract_snapshot_digest text,
  p_work_unit_id uuid,
  p_checkpoint_generation bigint,
  p_checkpoint_payload jsonb,
  p_key bytea
) returns text
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
declare
  v_payload bytea;
begin
  if p_provider_code !~ '^[a-z][a-z0-9_]{0,62}$'
    or p_contract_snapshot_digest !~ '^[a-f0-9]{64}$'
    or p_checkpoint_generation < 0
    or jsonb_typeof(p_checkpoint_payload) <> 'object'
    or octet_length(p_key) not between 32 and 64
  then
    raise exception 'MB3_CHECKPOINT_MAC_INPUT_INVALID';
  end if;
  v_payload := convert_to('equora-provider-checkpoint-v2', 'UTF8')
    || decode('00','hex') || convert_to(p_provider_code, 'UTF8')
    || decode('00','hex') || convert_to(p_provider_contract_version, 'UTF8')
    || decode('00','hex') || convert_to(p_capability_id, 'UTF8')
    || decode('00','hex') || convert_to(p_capability_contract_version, 'UTF8')
    || decode('00','hex') || convert_to(p_checkpoint_contract_version, 'UTF8')
    || decode('00','hex') || convert_to(p_contract_snapshot_digest, 'UTF8')
    || decode('00','hex') || convert_to(p_work_unit_id::text, 'UTF8')
    || decode('00','hex') || convert_to(p_checkpoint_generation::text, 'UTF8')
    || decode('00','hex')
    || convert_to(public.equora_tcj_from_jsonb_v1(p_checkpoint_payload), 'UTF8');
  return encode(public.equora_pgcrypto_hmac_v1(v_payload, p_key, 'sha256'), 'hex');
end;
$$;

create or replace function public.equora_validate_provider_cursor_v1(
  p_cursor_contract_version text,
  p_cursor jsonb
) returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_cursor_text text;
begin
  if p_cursor_contract_version = 'mexc_page_number_cursor_v1' then
    return p_cursor = 'null'::jsonb;
  end if;
  if p_cursor_contract_version <> 'equora_opaque_scalar_cursor_v1' then
    return false;
  end if;
  if p_cursor = 'null'::jsonb then return true; end if;
  if jsonb_typeof(p_cursor) = 'string' then
    v_cursor_text := p_cursor #>> '{}';
    return octet_length(convert_to(v_cursor_text,'UTF8')) between 1 and 1024;
  end if;
  if jsonb_typeof(p_cursor) = 'number' then
    v_cursor_text := p_cursor #>> '{}';
    if v_cursor_text !~ '^-?(0|[1-9][0-9]*)$' then return false; end if;
    begin
      return v_cursor_text::numeric between -9007199254740991 and 9007199254740991;
    exception when numeric_value_out_of_range then
      return false;
    end;
  end if;
  return false;
end;
$$;

alter function public.equora_validate_provider_cursor_v1(text,jsonb)
  owner to equora_broker_runtime_v2;
revoke all on function
  public.equora_validate_provider_cursor_v1(text,jsonb)
  from public, anon, authenticated, service_role,
    equora_broker_operator_control_v2;

grant execute on function
  public.equora_tcj_quote_v1(text),
  public.equora_tcj_atom_v1(text,text),
  public.equora_tcj_decimal_v1(text),
  public.equora_tcj_array_v1(text[]),
  public.equora_tcj_from_jsonb_v1(jsonb,integer),
  public.equora_tcj_digest_v1(text,text),
  public.equora_jsonb_exact_keys_v1(jsonb,text[]),
  public.equora_pgcrypto_digest_v1(bytea,text),
  public.equora_pgcrypto_hmac_v1(bytea,bytea,text),
  public.equora_constant_time_hex_equal_v1(text,text)
to equora_broker_operator_control_v2, equora_broker_runtime_v2;

alter function public.equora_provider_operator_command_digest_v2(
  uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text
) owner to equora_broker_operator_control_v2;
alter function public.equora_provider_page_scope_digest_v2(jsonb)
  owner to equora_broker_runtime_v2;
alter function public.equora_provider_contract_snapshot_digest_v2(
  text,text,text,text,text,text,text,text,text,text,text,text
) owner to equora_broker_runtime_v2;
alter function public.equora_provider_checkpoint_mac_v2(
  text,text,text,text,text,text,uuid,bigint,jsonb,bytea
) owner to equora_broker_runtime_v2;

revoke all on function public.equora_provider_operator_command_digest_v2(
  uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text
) from public, anon, authenticated, service_role, equora_broker_runtime_v2;
revoke all on function public.equora_provider_page_scope_digest_v2(jsonb)
  from public, anon, authenticated, service_role, equora_broker_operator_control_v2;
revoke all on function public.equora_provider_contract_snapshot_digest_v2(
  text,text,text,text,text,text,text,text,text,text,text,text
) from public, anon, authenticated, service_role, equora_broker_operator_control_v2;
revoke all on function public.equora_provider_checkpoint_mac_v2(
  text,text,text,text,text,text,uuid,bigint,jsonb,bytea
) from public, anon, authenticated, service_role, equora_broker_operator_control_v2;

create or replace function public.equora_apply_broker_operator_command_v2(
  p_command_id uuid,
  p_enrollment_id uuid,
  p_action text,
  p_user_id uuid,
  p_broker_account_id uuid,
  p_provider_code text,
  p_provider_contract_version text,
  p_capability_id text,
  p_capability_contract_version text,
  p_expected_generation bigint,
  p_command_policy_version text,
  p_command_digest text
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_digest text;
  v_capability public.broker_provider_capability_contracts_v2%rowtype;
  v_account public.broker_accounts%rowtype;
  v_enrollment public.broker_runtime_enrollments_v2%rowtype;
  v_receipt public.broker_operator_control_receipts_v2%rowtype;
  v_result jsonb;
  v_resulting_state text;
  v_resulting_generation bigint;
  v_provider_count integer;
  v_global_count integer;
  v_capability_count integer;
  v_account_already_enrolled boolean;
begin
  if p_action not in ('enroll','resume','suspend','revoke')
    or p_command_policy_version <> 'equora_provider_operator_command_v2'
    or p_expected_generation < 0
    or p_command_digest !~ '^[a-f0-9]{64}$'
  then
    raise exception 'MB3_OPERATOR_COMMAND_INVALID';
  end if;

  v_digest := public.equora_provider_operator_command_digest_v2(
    p_command_id, p_enrollment_id, p_action, p_user_id,
    p_broker_account_id, p_provider_code, p_provider_contract_version,
    p_capability_id, p_capability_contract_version,
    p_expected_generation, p_command_policy_version
  );
  if not public.equora_constant_time_hex_equal_v1(v_digest, p_command_digest) then
    raise exception 'MB3_OPERATOR_COMMAND_DIGEST_MISMATCH';
  end if;

  select * into v_receipt
  from public.broker_operator_control_receipts_v2
  where command_id = p_command_id;
  if found then
    if v_receipt.input_digest is distinct from v_digest then
      raise exception 'MB3_OPERATOR_COMMAND_REPLAY_MISMATCH';
    end if;
    return v_receipt.result;
  end if;

  select * into v_capability
  from public.broker_provider_capability_contracts_v2
  where provider_code = p_provider_code
    and provider_contract_version = p_provider_contract_version
    and capability_id = p_capability_id
    and capability_contract_version = p_capability_contract_version
  for share;
  if not found or v_capability.registry_status <> 'verified'
    or v_capability.read_method <> 'GET'
  then
    raise exception 'MB3_OPERATOR_CAPABILITY_INVALID';
  end if;

  select * into v_account
  from public.broker_accounts
  where id = p_broker_account_id
    and user_id = p_user_id
    and provider_code = p_provider_code
  for share;
  if not found or v_account.provider_contract_version <> p_provider_contract_version
    or v_account.status not in ('pending','active','paused')
    or v_account.retention_status <> 'active'
  then
    raise exception 'MB3_OPERATOR_ACCOUNT_INVALID';
  end if;

  if p_action = 'enroll' then
    if p_expected_generation <> 0 then
      raise exception 'MB3_OPERATOR_GENERATION_MISMATCH';
    end if;
    -- Serialize every account/capability quota decision for this tenant. The
    -- lock is transaction-scoped, provider-neutral and independent of caller
    -- supplied enrollment/account identifiers.
    perform pg_advisory_xact_lock(
      hashtextextended('equora-mb3-account-quota:' || p_user_id::text, 0)
    );
    select exists (
      select 1 from public.broker_runtime_enrollments_v2
      where user_id = p_user_id
        and broker_account_id = p_broker_account_id
        and provider_code = p_provider_code
        and runtime_state <> 'revoked'
    ) into v_account_already_enrolled;
    select count(distinct broker_account_id) into v_global_count
    from public.broker_runtime_enrollments_v2
    where user_id = p_user_id and runtime_state <> 'revoked';
    select count(distinct broker_account_id) into v_provider_count
    from public.broker_runtime_enrollments_v2
    where user_id = p_user_id and provider_code = p_provider_code
      and runtime_state <> 'revoked';
    select count(*) into v_capability_count
    from public.broker_runtime_enrollments_v2
    where user_id = p_user_id
      and broker_account_id = p_broker_account_id
      and provider_code = p_provider_code
      and runtime_state <> 'revoked';
    if (not v_account_already_enrolled and (
        v_global_count >= 4
        or v_provider_count >= v_capability.provider_account_cap
      ))
      or v_capability_count >= v_capability.provider_capability_cap
    then
      raise exception 'MB3_OPERATOR_ENROLLMENT_CAP_REACHED';
    end if;
    begin
      insert into public.broker_runtime_enrollments_v2 (
        id,user_id,broker_account_id,provider_code,
        provider_contract_version,capability_id,
        capability_contract_version,runtime_state,generation,
        authority_epoch,last_operator_command_id,enrolled_at,updated_at
      ) values (
        p_enrollment_id,p_user_id,p_broker_account_id,p_provider_code,
        p_provider_contract_version,p_capability_id,
        p_capability_contract_version,'suspended',1,
        1,p_command_id,v_now,v_now
      ) returning * into v_enrollment;
    exception when unique_violation then
      raise exception 'MB3_OPERATOR_ENROLLMENT_CONFLICT';
    end;
    v_resulting_state := 'suspended';
    v_resulting_generation := 1;
  else
    select * into v_enrollment
    from public.broker_runtime_enrollments_v2
    where id = p_enrollment_id
      and user_id = p_user_id
      and broker_account_id = p_broker_account_id
      and provider_code = p_provider_code
      and provider_contract_version = p_provider_contract_version
      and capability_id = p_capability_id
      and capability_contract_version = p_capability_contract_version
    for update;
    if not found or v_enrollment.generation <> p_expected_generation then
      raise exception 'MB3_OPERATOR_GENERATION_MISMATCH';
    end if;
    if (p_action = 'resume' and v_enrollment.runtime_state <> 'suspended')
      or (p_action = 'suspend' and v_enrollment.runtime_state <> 'active')
      or (p_action = 'revoke' and v_enrollment.runtime_state not in ('active','suspended'))
    then
      raise exception 'MB3_OPERATOR_STATE_TRANSITION_INVALID';
    end if;
    v_resulting_state := case p_action
      when 'resume' then 'active'
      when 'suspend' then 'suspended'
      else 'revoked'
    end;
    v_resulting_generation := p_expected_generation + 1;
    update public.broker_runtime_enrollments_v2
    set runtime_state = v_resulting_state,
        generation = v_resulting_generation,
        authority_epoch = authority_epoch + 1,
        last_operator_command_id = p_command_id,
        updated_at = v_now,
        revoked_at = case when v_resulting_state = 'revoked' then v_now else null end
    where id = p_enrollment_id and generation = p_expected_generation
    returning * into v_enrollment;
    if not found then raise exception 'MB3_OPERATOR_GENERATION_MISMATCH'; end if;
  end if;

  v_result := jsonb_build_object(
    'status','operator_command_applied',
    'commandId',p_command_id,
    'enrollmentId',p_enrollment_id,
    'providerCode',p_provider_code,
    'capabilityId',p_capability_id,
    'runtimeState',v_resulting_state,
    'generation',v_resulting_generation,
    'authorityEpoch',v_enrollment.authority_epoch,
    'runtimeDefaultedActive',false
  );
  insert into public.broker_operator_control_receipts_v2 (
    command_id,enrollment_id,user_id,broker_account_id,provider_code,
    provider_contract_version,capability_id,capability_contract_version,
    action,expected_generation,resulting_generation,input_digest,
    command_policy_version,result,created_at
  ) values (
    p_command_id,p_enrollment_id,p_user_id,p_broker_account_id,p_provider_code,
    p_provider_contract_version,p_capability_id,p_capability_contract_version,
    p_action,p_expected_generation,v_resulting_generation,v_digest,
    p_command_policy_version,v_result,v_now
  );
  return v_result;
exception
  when lock_not_available then raise exception 'MB3_OPERATOR_LOCK_TIMEOUT';
  when query_canceled then raise exception 'MB3_OPERATOR_STATEMENT_TIMEOUT';
end;
$$;

alter function public.equora_apply_broker_operator_command_v2(
  uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text,text
) owner to equora_broker_operator_control_v2;
revoke all on function public.equora_apply_broker_operator_command_v2(
  uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text,text
) from public, anon, authenticated, service_role, equora_broker_runtime_v2;

create or replace function public.equora_authorize_provider_capture_request_v2(
  p_request_authorization_id uuid,
  p_enrollment_id uuid,
  p_expected_enrollment_generation bigint,
  p_work_unit_id uuid,
  p_expected_work_unit_row_version bigint,
  p_request_sequence integer,
  p_expected_checkpoint_row_version bigint,
  p_expected_checkpoint_generation bigint,
  p_expected_checkpoint_mac text,
  p_page_scope_digest text,
  p_query_digest text,
  p_request_plan_digest text,
  p_send_deadline_at timestamptz,
  p_policy_version text
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '10s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_enrollment public.broker_runtime_enrollments_v2%rowtype;
  v_capability public.broker_provider_capability_contracts_v2%rowtype;
  v_account public.broker_accounts%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_scope public.broker_sync_scopes%rowtype;
  v_work_unit public.broker_capture_work_units%rowtype;
  v_key equora_private.broker_capture_integrity_keys%rowtype;
  v_checkpoint public.broker_capture_checkpoints_v2%rowtype;
  v_existing public.broker_capture_request_authorizations_v2%rowtype;
  v_is_replay boolean := false;
  v_mac text;
  v_contract_snapshot_digest text;
  v_authorization_attempt integer;
  v_input_digest text;
  v_result jsonb;
begin
  if p_request_authorization_id is null
    or p_enrollment_id is null
    or p_work_unit_id is null
    or p_policy_version <> 'equora_provider_request_authority_v2'
    or p_expected_enrollment_generation <= 0
    or p_expected_work_unit_row_version < 0
    or p_request_sequence <= 0
    or p_expected_checkpoint_row_version < 0
    or p_expected_checkpoint_generation < 0
    or p_expected_checkpoint_mac !~ '^[a-f0-9]{64}$'
    or p_page_scope_digest !~ '^[a-f0-9]{64}$'
    or p_query_digest !~ '^[a-f0-9]{64}$'
    or p_request_plan_digest !~ '^[a-f0-9]{64}$'
    or p_send_deadline_at <= v_now
    or p_send_deadline_at > v_now + interval '60 seconds'
  then
    raise exception 'MB3_REQUEST_AUTH_INPUT_INVALID';
  end if;
  v_input_digest := public.equora_tcj_digest_v1(
    'provider_request_authority_v2',
    public.equora_tcj_from_jsonb_v1(jsonb_build_object(
      'checkpointGeneration',p_expected_checkpoint_generation,
      'checkpointMac',p_expected_checkpoint_mac,
      'checkpointRowVersion',p_expected_checkpoint_row_version,
      'enrollmentGeneration',p_expected_enrollment_generation,
      'enrollmentId',p_enrollment_id::text,
      'pageScopeDigest',p_page_scope_digest,
      'policyVersion',p_policy_version,
      'queryDigest',p_query_digest,
      'requestAuthorizationId',p_request_authorization_id::text,
      'requestPlanDigest',p_request_plan_digest,
      'requestSequence',p_request_sequence,
      'sendDeadlineAt',to_char(p_send_deadline_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'workUnitId',p_work_unit_id::text,
      'workUnitRowVersion',p_expected_work_unit_row_version
    ))
  );

  -- Global caller-controlled Runtime IDs share the Authority-Receipt primary-
  -- key namespace. Serialize that namespace before the first replay read and
  -- before every row-authority lock. All Runtime RPCs use the same prefix;
  -- Page Commit locks its two IDs in lexical order.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'equora-mb3-runtime-object-id:' || p_request_authorization_id::text, 0
    )
  );
  v_now := clock_timestamp();
  if p_send_deadline_at <= v_now
  then raise exception 'MB3_REQUEST_AUTH_DEADLINE_EXPIRED'; end if;

  select * into v_existing
  from public.broker_capture_request_authorizations_v2
  where id = p_request_authorization_id;
  if found then
    if v_existing.input_digest is distinct from v_input_digest then
      raise exception 'MB3_REQUEST_AUTH_REPLAY_MISMATCH';
    end if;
    v_is_replay := true;
  end if;

  -- Fixed order after the global Runtime-ID guard: Enrollment -> Capability
  -- Registry -> Account -> Activation -> Scope -> WorkUnit -> Integrity Key ->
  -- Checkpoint. Authorization and its same-ID Receipt are inserted last.
  select * into v_enrollment from public.broker_runtime_enrollments_v2
  where id = p_enrollment_id for share;
  if not found or v_enrollment.runtime_state <> 'active'
    or v_enrollment.generation <> p_expected_enrollment_generation
  then raise exception 'MB3_REQUEST_AUTH_ENROLLMENT_INVALID'; end if;

  select * into v_capability
  from public.equora_lock_provider_capability_contract_v2(
    v_enrollment.provider_code,v_enrollment.provider_contract_version,
    v_enrollment.capability_id,v_enrollment.capability_contract_version
  );
  if not found or v_capability.registry_status <> 'verified'
    or v_capability.read_method <> 'GET'
  then raise exception 'MB3_REQUEST_AUTH_CAPABILITY_INVALID'; end if;
  v_contract_snapshot_digest := public.equora_provider_contract_snapshot_digest_v2(
    v_capability.provider_code,v_capability.provider_contract_version,
    v_capability.capability_id,v_capability.capability_contract_version,
    v_capability.page_scope_contract_version,v_capability.query_contract_version,
    v_capability.cursor_contract_version,v_capability.response_contract_version,
    v_capability.raw_envelope_contract_version,
    v_capability.normalization_contract_version,
    v_capability.checkpoint_contract_version,v_capability.checkpoint_mac_version
  );

  select * into v_account from public.broker_accounts
  where id = v_enrollment.broker_account_id
    and user_id = v_enrollment.user_id
    and provider_code = v_enrollment.provider_code for share;
  if not found or v_account.status <> 'active' or v_account.retention_status <> 'active'
  then raise exception 'MB3_REQUEST_AUTH_ACCOUNT_INVALID'; end if;

  select activation.* into v_activation
  from public.broker_sync_activations activation
  join public.broker_capture_work_units work_unit
    on work_unit.sync_activation_id = activation.id
  where work_unit.id = p_work_unit_id
    and activation.user_id = v_enrollment.user_id
    and activation.broker_account_id = v_enrollment.broker_account_id
    and activation.provider_code = v_enrollment.provider_code
    and activation.provider_contract_version = v_enrollment.provider_contract_version
  for share of activation;
  if not found or v_activation.activation_state <> 'active'
    or v_activation.capture_health not in ('pending','healthy','degraded')
  then raise exception 'MB3_REQUEST_AUTH_ACTIVATION_INVALID'; end if;

  select scope.* into v_scope from public.broker_sync_scopes scope
  join public.broker_capture_work_units work_unit on work_unit.scope_id = scope.id
  where work_unit.id = p_work_unit_id
    and scope.user_id = v_enrollment.user_id
    and scope.broker_account_id = v_enrollment.broker_account_id
    and scope.sync_activation_id = v_activation.id
    and scope.activation_generation = v_activation.activation_generation
    and scope.provider_code = v_enrollment.provider_code
    and scope.provider_contract_version = v_enrollment.provider_contract_version
    and scope.capability_id = v_enrollment.capability_id
  for share of scope;
  if not found then raise exception 'MB3_REQUEST_AUTH_SCOPE_INVALID'; end if;

  select * into v_work_unit from public.broker_capture_work_units
  where id = p_work_unit_id for update;
  if not found or v_work_unit.user_id <> v_scope.user_id
    or v_work_unit.scope_id <> v_scope.id
    or v_work_unit.broker_account_id <> v_scope.broker_account_id
    or v_work_unit.sync_activation_id <> v_scope.sync_activation_id
    or v_work_unit.activation_generation <> v_scope.activation_generation
    or v_work_unit.row_version <> p_expected_work_unit_row_version
    or v_work_unit.request_sequence + 1 <> p_request_sequence
    or v_work_unit.status not in ('leased','running')
  then raise exception 'MB3_REQUEST_AUTH_WORK_UNIT_INVALID'; end if;

  select * into v_key from equora_private.broker_capture_integrity_keys
  where id = v_activation.capture_integrity_key_id
    and user_id = v_activation.user_id
    and broker_account_id = v_activation.broker_account_id
    and key_version = v_activation.capture_integrity_key_version
  for share;
  if not found or v_key.status <> 'active'
  then raise exception 'MB3_REQUEST_AUTH_INTEGRITY_KEY_INVALID'; end if;

  select * into v_checkpoint from public.broker_capture_checkpoints_v2
  where work_unit_id = p_work_unit_id for update;
  if not found
    or v_checkpoint.user_id <> v_scope.user_id
    or v_checkpoint.broker_account_id <> v_scope.broker_account_id
    or v_checkpoint.sync_activation_id <> v_scope.sync_activation_id
    or v_checkpoint.activation_generation <> v_scope.activation_generation
    or v_checkpoint.provider_code <> v_enrollment.provider_code
    or v_checkpoint.provider_contract_version <> v_enrollment.provider_contract_version
    or v_checkpoint.capability_id <> v_enrollment.capability_id
    or v_checkpoint.capability_contract_version <> v_enrollment.capability_contract_version
    or v_checkpoint.page_scope_contract_version <> v_capability.page_scope_contract_version
    or v_checkpoint.query_contract_version <> v_capability.query_contract_version
    or v_checkpoint.cursor_contract_version <> v_capability.cursor_contract_version
    or v_checkpoint.response_contract_version <> v_capability.response_contract_version
    or v_checkpoint.raw_envelope_contract_version <> v_capability.raw_envelope_contract_version
    or v_checkpoint.normalization_contract_version <> v_capability.normalization_contract_version
    or v_checkpoint.checkpoint_contract_version <> v_capability.checkpoint_contract_version
    or v_checkpoint.checkpoint_mac_version <> v_capability.checkpoint_mac_version
    or v_checkpoint.contract_snapshot_digest <> v_contract_snapshot_digest
    or v_checkpoint.row_version <> p_expected_checkpoint_row_version
    or v_checkpoint.checkpoint_generation <> p_expected_checkpoint_generation
    or v_checkpoint.checkpoint_mac <> p_expected_checkpoint_mac
    or v_checkpoint.page_scope_digest <> p_page_scope_digest
    or v_checkpoint.query_digest <> p_query_digest
    or v_checkpoint.checkpoint_status not in ('ready','continue')
  then raise exception 'MB3_REQUEST_AUTH_CHECKPOINT_INVALID'; end if;

  v_mac := public.equora_provider_checkpoint_mac_v2(
    v_checkpoint.provider_code,v_checkpoint.provider_contract_version,
    v_checkpoint.capability_id,v_checkpoint.capability_contract_version,
    v_checkpoint.checkpoint_contract_version,v_checkpoint.contract_snapshot_digest,
    v_checkpoint.work_unit_id,
    v_checkpoint.checkpoint_generation,v_checkpoint.checkpoint_payload,
    v_key.key_material
  );
  if not public.equora_constant_time_hex_equal_v1(v_mac, v_checkpoint.checkpoint_mac)
  then raise exception 'MB3_REQUEST_AUTH_CHECKPOINT_MAC_INVALID'; end if;

  -- All parent-authority locks are now held. Refresh time before expiry cleanup;
  -- replay takes one additional Authorization row lock and therefore refreshes
  -- again after that lock. The insert path refreshes again after cleanup.
  v_now := clock_timestamp();
  if p_send_deadline_at <= v_now
  then raise exception 'MB3_REQUEST_AUTH_DEADLINE_EXPIRED'; end if;
  if v_key.valid_from > v_now
    or (v_key.valid_to is not null and v_key.valid_to <= v_now)
  then raise exception 'MB3_REQUEST_AUTH_INTEGRITY_KEY_INVALID'; end if;

  update public.broker_capture_request_authorizations_v2
  set authorization_status='revoked',revoked_at=v_now,
      revocation_reason='send_deadline_expired'
  where work_unit_id=p_work_unit_id
    and request_sequence=p_request_sequence
    and authorization_status='issued'
    and send_deadline_at <= v_now;
  if exists (
    select 1 from public.broker_capture_request_authorizations_v2
    where work_unit_id=p_work_unit_id
      and request_sequence=p_request_sequence
      and authorization_status='issued'
      and id <> p_request_authorization_id
  ) then raise exception 'MB3_REQUEST_AUTH_ALREADY_ISSUED'; end if;
  select coalesce(max(authorization_attempt),0)+1
    into v_authorization_attempt
  from public.broker_capture_request_authorizations_v2
  where work_unit_id=p_work_unit_id and request_sequence=p_request_sequence;

  if v_is_replay then
    select * into v_existing
    from public.broker_capture_request_authorizations_v2
    where id = p_request_authorization_id
    for share;
    v_now := clock_timestamp();
    if not found
      or p_send_deadline_at <= v_now
      or v_existing.authorization_status <> 'issued'
      or v_existing.send_deadline_at <= v_now
    then raise exception 'MB3_REQUEST_AUTH_REPLAY_TERMINAL'; end if;
    if v_key.valid_from > v_now
      or (v_key.valid_to is not null and v_key.valid_to <= v_now)
    then raise exception 'MB3_REQUEST_AUTH_INTEGRITY_KEY_INVALID'; end if;
    return jsonb_build_object(
      'status','request_authorized','requestAuthorizationId',v_existing.id,
      'workUnitId',v_existing.work_unit_id,
      'requestSequence',v_existing.request_sequence,
      'authorizationAttempt',v_existing.authorization_attempt,
      'sendDeadlineAt',v_existing.send_deadline_at,
      'authorityBlocked',true
    );
  end if;

  -- Expiry cleanup above can wait on an Authorization row. Re-sample immediately
  -- before the first durable effect; any failure rolls the cleanup back as part
  -- of this transaction.
  v_now := clock_timestamp();
  if p_send_deadline_at <= v_now
  then raise exception 'MB3_REQUEST_AUTH_DEADLINE_EXPIRED'; end if;
  if v_key.valid_from > v_now
    or (v_key.valid_to is not null and v_key.valid_to <= v_now)
  then raise exception 'MB3_REQUEST_AUTH_INTEGRITY_KEY_INVALID'; end if;

  insert into public.broker_capture_request_authorizations_v2 (
    id,enrollment_id,enrollment_generation,user_id,broker_account_id,
    sync_activation_id,activation_generation,work_unit_id,provider_code,
    provider_contract_version,capability_id,capability_contract_version,
    checkpoint_row_version,checkpoint_generation,checkpoint_mac,
    contract_snapshot_digest,request_sequence,authorization_attempt,
    page_scope_digest,query_digest,request_plan_digest,
    input_digest,authorization_status,send_deadline_at,created_at
  ) values (
    p_request_authorization_id,v_enrollment.id,v_enrollment.generation,
    v_enrollment.user_id,v_enrollment.broker_account_id,
    v_scope.sync_activation_id,v_scope.activation_generation,p_work_unit_id,
    v_enrollment.provider_code,v_enrollment.provider_contract_version,
    v_enrollment.capability_id,v_enrollment.capability_contract_version,
    v_checkpoint.row_version,v_checkpoint.checkpoint_generation,
    v_checkpoint.checkpoint_mac,v_contract_snapshot_digest,p_request_sequence,
    v_authorization_attempt,p_page_scope_digest,
    p_query_digest,p_request_plan_digest,v_input_digest,'issued',
    p_send_deadline_at,v_now
  );
  -- The direct auth.users FK can still wait after the pre-insert sample.
  -- Re-sample after that first insert; failure rolls the insert back and its
  -- acquired parent-key lock prevents a second auth.users wait in the Receipt.
  v_now := clock_timestamp();
  if p_send_deadline_at <= v_now
  then raise exception 'MB3_REQUEST_AUTH_DEADLINE_EXPIRED'; end if;
  if v_key.valid_from > v_now
    or (v_key.valid_to is not null and v_key.valid_to <= v_now)
  then raise exception 'MB3_REQUEST_AUTH_INTEGRITY_KEY_INVALID'; end if;
  v_result := jsonb_build_object(
    'status','request_authorized',
    'requestAuthorizationId',p_request_authorization_id,
    'workUnitId',p_work_unit_id,
    'requestSequence',p_request_sequence,
    'authorizationAttempt',v_authorization_attempt,
    'sendDeadlineAt',p_send_deadline_at,
    'authorityBlocked',true
  );
  insert into public.broker_runtime_authority_receipts_v2 (
    id,authority_action,request_authorization_id,page_commit_id,
    enrollment_id,enrollment_generation,user_id,broker_account_id,
    provider_code,provider_contract_version,capability_id,
    capability_contract_version,work_unit_id,input_digest,result,created_at
  ) values (
    p_request_authorization_id,'request_authorized',p_request_authorization_id,null,
    v_enrollment.id,v_enrollment.generation,v_enrollment.user_id,
    v_enrollment.broker_account_id,v_enrollment.provider_code,
    v_enrollment.provider_contract_version,v_enrollment.capability_id,
    v_enrollment.capability_contract_version,p_work_unit_id,
    v_input_digest,v_result,v_now
  );
  return v_result;
exception
  when lock_not_available then raise exception 'MB3_RUNTIME_LOCK_TIMEOUT';
  when query_canceled then raise exception 'MB3_RUNTIME_STATEMENT_TIMEOUT';
end;
$$;

alter function public.equora_authorize_provider_capture_request_v2(
  uuid,uuid,bigint,uuid,bigint,integer,bigint,bigint,text,text,text,text,timestamptz,text
) owner to equora_broker_runtime_v2;
revoke all on function public.equora_authorize_provider_capture_request_v2(
  uuid,uuid,bigint,uuid,bigint,integer,bigint,bigint,text,text,text,text,timestamptz,text
) from public, anon, authenticated, equora_broker_operator_control_v2;
grant execute on function public.equora_authorize_provider_capture_request_v2(
  uuid,uuid,bigint,uuid,bigint,integer,bigint,bigint,text,text,text,text,timestamptz,text
) to service_role;

create or replace function public.equora_commit_provider_capture_page_v2(
  p_page_commit_id uuid,
  p_request_authorization_id uuid,
  p_expected_work_unit_id uuid,
  p_expected_enrollment_generation bigint,
  p_expected_work_unit_row_version bigint,
  p_expected_checkpoint_row_version bigint,
  p_expected_checkpoint_generation bigint,
  p_expected_checkpoint_mac text,
  p_request_sequence integer,
  p_request_plan_digest text,
  p_raw_envelope jsonb,
  p_raw_envelope_digest text,
  p_response_digest text,
  p_next_checkpoint_payload jsonb,
  p_next_checkpoint_mac text,
  p_next_checkpoint_status text,
  p_scope_completeness text,
  p_commit_policy_version text
) returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '15s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_auth public.broker_capture_request_authorizations_v2%rowtype;
  v_enrollment public.broker_runtime_enrollments_v2%rowtype;
  v_capability public.broker_provider_capability_contracts_v2%rowtype;
  v_account public.broker_accounts%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_scope public.broker_sync_scopes%rowtype;
  v_work_unit public.broker_capture_work_units%rowtype;
  v_key equora_private.broker_capture_integrity_keys%rowtype;
  v_checkpoint public.broker_capture_checkpoints_v2%rowtype;
  v_existing public.broker_capture_page_commits_v2%rowtype;
  v_current_mac text;
  v_next_mac text;
  v_envelope_digest text;
  v_input_digest text;
  v_result jsonb;
  v_next_generation bigint;
  v_contract_snapshot_digest text;
  v_observed_at timestamptz;
begin
  if p_page_commit_id is null
    or p_request_authorization_id is null
    or p_expected_work_unit_id is null
    or p_page_commit_id = p_request_authorization_id
    or p_commit_policy_version <> 'equora_provider_page_commit_v2'
    or p_expected_enrollment_generation <= 0
    or p_expected_work_unit_row_version < 0
    or p_expected_checkpoint_row_version < 0
    or p_expected_checkpoint_generation < 0
    or p_request_sequence <= 0
    or p_expected_checkpoint_mac !~ '^[a-f0-9]{64}$'
    or p_request_plan_digest !~ '^[a-f0-9]{64}$'
    or p_raw_envelope_digest !~ '^[a-f0-9]{64}$'
    or p_response_digest !~ '^[a-f0-9]{64}$'
    or p_next_checkpoint_mac !~ '^[a-f0-9]{64}$'
    or p_next_checkpoint_status not in ('continue','complete','partial','blocked')
    or not (
      (p_next_checkpoint_status in ('continue','complete') and p_scope_completeness='unverified')
      or (p_next_checkpoint_status='partial' and p_scope_completeness='partial')
      or (p_next_checkpoint_status='blocked' and p_scope_completeness='failed')
    )
    or jsonb_typeof(p_raw_envelope) <> 'object'
    or jsonb_typeof(p_next_checkpoint_payload) <> 'object'
    or (select array_agg(envelope_key order by envelope_key)
        from jsonb_object_keys(p_raw_envelope) envelope_key)
      is distinct from array[
        'capabilityContractVersion','capabilityId','cursorContractVersion',
        'normalizationContractVersion','observedAtUtc','pageSequence',
        'providerCode','providerContractVersion','queryContractVersion',
        'rawBodyDigest','rawEnvelopeContractVersion','requestPlanDigest',
        'requestSequence','responseContractVersion','responseDigest'
      ]::text[]
    or (select array_agg(checkpoint_key order by checkpoint_key)
        from jsonb_object_keys(p_next_checkpoint_payload) checkpoint_key)
      is distinct from array['cursor','pageSequence']::text[]
    or jsonb_typeof(p_raw_envelope -> 'requestSequence') <> 'number'
    or jsonb_typeof(p_raw_envelope -> 'pageSequence') <> 'number'
    or exists (
      select 1 from unnest(array[
        'capabilityContractVersion','capabilityId','cursorContractVersion',
        'normalizationContractVersion','observedAtUtc','providerCode',
        'providerContractVersion','queryContractVersion','rawBodyDigest',
        'rawEnvelopeContractVersion','requestPlanDigest',
        'responseContractVersion','responseDigest'
      ]) string_key
      where jsonb_typeof(p_raw_envelope -> string_key) is distinct from 'string'
    )
    or (p_raw_envelope ->> 'requestSequence') !~ '^[1-9][0-9]*$'
    or (p_raw_envelope ->> 'pageSequence') !~ '^(0|[1-9][0-9]*)$'
    or jsonb_typeof(p_next_checkpoint_payload -> 'pageSequence') <> 'number'
    or (p_next_checkpoint_payload ->> 'pageSequence') !~ '^(0|[1-9][0-9]*)$'
    or not public.equora_validate_provider_cursor_v1(
      p_raw_envelope ->> 'cursorContractVersion',
      p_next_checkpoint_payload -> 'cursor'
    )
    or (p_raw_envelope ->> 'observedAtUtc') !~
      '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$'
  then raise exception 'MB3_PAGE_COMMIT_INPUT_INVALID'; end if;

  if not public.equora_jsonb_exact_keys_v1(p_raw_envelope, array[
    'capabilityContractVersion','capabilityId','cursorContractVersion',
    'normalizationContractVersion','observedAtUtc','pageSequence','providerCode',
    'providerContractVersion','queryContractVersion','rawBodyDigest',
    'rawEnvelopeContractVersion','requestPlanDigest','requestSequence',
    'responseContractVersion','responseDigest'
  ])
  then raise exception 'MB3_RAW_ENVELOPE_INVALID'; end if;

  v_envelope_digest := public.equora_tcj_digest_v1(
    'provider_raw_envelope_v2', public.equora_tcj_from_jsonb_v1(p_raw_envelope)
  );
  if not public.equora_constant_time_hex_equal_v1(v_envelope_digest,p_raw_envelope_digest)
  then raise exception 'MB3_RAW_ENVELOPE_DIGEST_MISMATCH'; end if;

  v_input_digest := public.equora_tcj_digest_v1(
    'provider_page_commit_v2', public.equora_tcj_from_jsonb_v1(jsonb_build_object(
      'checkpointGeneration',p_expected_checkpoint_generation,
      'checkpointMac',p_expected_checkpoint_mac,
      'checkpointRowVersion',p_expected_checkpoint_row_version,
      'commitPolicyVersion',p_commit_policy_version,
      'enrollmentGeneration',p_expected_enrollment_generation,
      'nextCheckpointMac',p_next_checkpoint_mac,
      'nextCheckpointPayload',p_next_checkpoint_payload,
      'nextCheckpointStatus',p_next_checkpoint_status,
      'pageCommitId',p_page_commit_id::text,
      'rawEnvelopeDigest',p_raw_envelope_digest,
      'requestAuthorizationId',p_request_authorization_id::text,
      'requestPlanDigest',p_request_plan_digest,
      'requestSequence',p_request_sequence,
      'responseDigest',p_response_digest,
      'scopeCompleteness',p_scope_completeness,
      'workUnitId',p_expected_work_unit_id::text,
      'workUnitRowVersion',p_expected_work_unit_row_version
    ))
  );

  -- Page Commit participates in the same global Runtime-ID/Receipt namespace
  -- as Request Authorization. Acquire both guards in lexical UUID order before
  -- the first replay read or row-authority lock, preventing cross-action and
  -- cross-work-unit speculative unique-index waits after the deadline checks.
  perform pg_advisory_xact_lock(hashtextextended(
    'equora-mb3-runtime-object-id:' || least(
      p_page_commit_id::text,p_request_authorization_id::text
    ), 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'equora-mb3-runtime-object-id:' || greatest(
      p_page_commit_id::text,p_request_authorization_id::text
    ), 0
  ));

  select * into v_existing from public.broker_capture_page_commits_v2
  where id = p_page_commit_id;
  if found then
    if v_existing.input_digest is distinct from v_input_digest
      or v_existing.request_authorization_id <> p_request_authorization_id
    then raise exception 'MB3_PAGE_COMMIT_REPLAY_MISMATCH'; end if;
    return jsonb_build_object(
      'status','page_committed','pageCommitId',v_existing.id,
      'requestAuthorizationId',v_existing.request_authorization_id,
      'workUnitId',v_existing.work_unit_id,
      'requestSequence',v_existing.request_sequence,
      'checkpointGeneration',v_existing.checkpoint_generation_after,
      'checkpointStatus',v_existing.checkpoint_status_after,
      'scopeCompleteness',v_existing.scope_completeness,
      'normalizationAuthority','none','reconciliationAuthority','none',
      'approvalAuthority','none','importAuthority','none'
    );
  end if;

  -- Same row-authority order as Request Authorization after the two lexical
  -- Runtime-ID guards; Authorization is the final row lock.
  select auth.* into v_auth
  from public.broker_capture_request_authorizations_v2 auth
  where auth.id = p_request_authorization_id;
  if not found or v_auth.work_unit_id <> p_expected_work_unit_id
  then raise exception 'MB3_PAGE_COMMIT_AUTHORIZATION_INVALID'; end if;

  select * into v_enrollment from public.broker_runtime_enrollments_v2
  where id = v_auth.enrollment_id for share;
  if not found or v_enrollment.runtime_state <> 'active'
    or v_enrollment.generation <> p_expected_enrollment_generation
    or v_enrollment.generation <> v_auth.enrollment_generation
  then raise exception 'MB3_PAGE_COMMIT_ENROLLMENT_INVALID'; end if;

  select * into v_capability
  from public.equora_lock_provider_capability_contract_v2(
    v_auth.provider_code,v_auth.provider_contract_version,
    v_auth.capability_id,v_auth.capability_contract_version
  );
  if not found or v_capability.registry_status <> 'verified'
    or v_capability.read_method <> 'GET'
  then raise exception 'MB3_PAGE_COMMIT_CAPABILITY_INVALID'; end if;
  v_contract_snapshot_digest := public.equora_provider_contract_snapshot_digest_v2(
    v_capability.provider_code,v_capability.provider_contract_version,
    v_capability.capability_id,v_capability.capability_contract_version,
    v_capability.page_scope_contract_version,v_capability.query_contract_version,
    v_capability.cursor_contract_version,v_capability.response_contract_version,
    v_capability.raw_envelope_contract_version,
    v_capability.normalization_contract_version,
    v_capability.checkpoint_contract_version,v_capability.checkpoint_mac_version
  );

  select * into v_account from public.broker_accounts
  where id = v_auth.broker_account_id and user_id = v_auth.user_id
    and provider_code = v_auth.provider_code for share;
  if not found or v_account.status <> 'active' or v_account.retention_status <> 'active'
  then raise exception 'MB3_PAGE_COMMIT_ACCOUNT_INVALID'; end if;

  select * into v_activation from public.broker_sync_activations
  where id = v_auth.sync_activation_id and user_id = v_auth.user_id
    and broker_account_id = v_auth.broker_account_id
    and activation_generation = v_auth.activation_generation
    and provider_code = v_auth.provider_code
    and provider_contract_version = v_auth.provider_contract_version
  for share;
  if not found or v_activation.activation_state <> 'active'
    or v_activation.capture_health not in ('pending','healthy','degraded')
  then raise exception 'MB3_PAGE_COMMIT_ACTIVATION_INVALID'; end if;

  select * into v_scope from public.broker_sync_scopes
  where id = (select scope_id from public.broker_capture_work_units where id=v_auth.work_unit_id)
    and user_id = v_auth.user_id and broker_account_id = v_auth.broker_account_id
    and sync_activation_id = v_auth.sync_activation_id
    and activation_generation = v_auth.activation_generation
    and provider_code = v_auth.provider_code
    and provider_contract_version = v_auth.provider_contract_version
    and capability_id = v_auth.capability_id
  for share;
  if not found then raise exception 'MB3_PAGE_COMMIT_SCOPE_INVALID'; end if;

  select * into v_work_unit from public.broker_capture_work_units
  where id = v_auth.work_unit_id for update;
  if not found or v_work_unit.user_id <> v_scope.user_id
    or v_work_unit.scope_id <> v_scope.id
    or v_work_unit.broker_account_id <> v_scope.broker_account_id
    or v_work_unit.sync_activation_id <> v_scope.sync_activation_id
    or v_work_unit.activation_generation <> v_scope.activation_generation
    or v_work_unit.row_version <> p_expected_work_unit_row_version
    or v_work_unit.request_sequence + 1 <> p_request_sequence
    or p_request_sequence <> v_auth.request_sequence
  then raise exception 'MB3_PAGE_COMMIT_WORK_UNIT_CAS_MISMATCH'; end if;

  select * into v_key from equora_private.broker_capture_integrity_keys
  where id = v_activation.capture_integrity_key_id
    and user_id = v_activation.user_id
    and broker_account_id = v_activation.broker_account_id
    and key_version = v_activation.capture_integrity_key_version
  for share;
  if not found or v_key.status <> 'active'
  then raise exception 'MB3_PAGE_COMMIT_INTEGRITY_KEY_INVALID'; end if;

  select * into v_checkpoint from public.broker_capture_checkpoints_v2
  where work_unit_id = v_auth.work_unit_id for update;
  if not found or v_checkpoint.row_version <> p_expected_checkpoint_row_version
    or v_checkpoint.checkpoint_generation <> p_expected_checkpoint_generation
    or v_checkpoint.checkpoint_mac <> p_expected_checkpoint_mac
    or v_checkpoint.row_version <> v_auth.checkpoint_row_version
    or v_checkpoint.checkpoint_generation <> v_auth.checkpoint_generation
    or v_checkpoint.checkpoint_mac <> v_auth.checkpoint_mac
    or v_checkpoint.page_scope_digest <> v_auth.page_scope_digest
    or v_checkpoint.query_digest <> v_auth.query_digest
    or v_checkpoint.contract_snapshot_digest <> v_auth.contract_snapshot_digest
    or v_checkpoint.contract_snapshot_digest <> v_contract_snapshot_digest
    or v_auth.request_plan_digest <> p_request_plan_digest
  then raise exception 'MB3_PAGE_COMMIT_CHECKPOINT_CAS_MISMATCH'; end if;

  select * into v_auth from public.broker_capture_request_authorizations_v2
  where id = p_request_authorization_id for update;
  v_now := clock_timestamp();
  if v_auth.authorization_status <> 'issued' or v_auth.send_deadline_at <= v_now
  then raise exception 'MB3_PAGE_COMMIT_AUTHORIZATION_INVALID'; end if;
  if v_key.valid_from > v_now
    or (v_key.valid_to is not null and v_key.valid_to <= v_now)
  then raise exception 'MB3_PAGE_COMMIT_INTEGRITY_KEY_INVALID'; end if;

  if p_raw_envelope ->> 'providerCode' is distinct from v_checkpoint.provider_code
    or p_raw_envelope ->> 'providerContractVersion' is distinct from v_checkpoint.provider_contract_version
    or p_raw_envelope ->> 'capabilityId' is distinct from v_checkpoint.capability_id
    or p_raw_envelope ->> 'capabilityContractVersion' is distinct from v_checkpoint.capability_contract_version
    or p_raw_envelope ->> 'queryContractVersion' is distinct from v_checkpoint.query_contract_version
    or p_raw_envelope ->> 'cursorContractVersion' is distinct from v_checkpoint.cursor_contract_version
    or p_raw_envelope ->> 'responseContractVersion' is distinct from v_checkpoint.response_contract_version
    or p_raw_envelope ->> 'rawEnvelopeContractVersion' is distinct from v_checkpoint.raw_envelope_contract_version
    or p_raw_envelope ->> 'normalizationContractVersion' is distinct from v_checkpoint.normalization_contract_version
    or p_raw_envelope ->> 'requestPlanDigest' is distinct from p_request_plan_digest
    or (p_raw_envelope ->> 'requestSequence')::integer <> p_request_sequence
    or (p_raw_envelope ->> 'pageSequence')::integer + 1 <> p_request_sequence
    or p_raw_envelope ->> 'rawBodyDigest' !~ '^[a-f0-9]{64}$'
    or p_raw_envelope ->> 'responseDigest' is distinct from p_response_digest
  then raise exception 'MB3_RAW_ENVELOPE_BINDING_MISMATCH'; end if;

  begin
    v_observed_at := (p_raw_envelope ->> 'observedAtUtc')::timestamptz;
  exception when others then
    raise exception 'MB3_RAW_ENVELOPE_OBSERVED_AT_INVALID';
  end;
  if v_observed_at < v_auth.created_at
    or v_observed_at > v_auth.send_deadline_at
    or v_observed_at > v_now
  then raise exception 'MB3_RAW_ENVELOPE_OBSERVED_AT_INVALID'; end if;

  if jsonb_typeof(v_checkpoint.checkpoint_payload) <> 'object'
    or (select array_agg(checkpoint_key order by checkpoint_key)
        from jsonb_object_keys(v_checkpoint.checkpoint_payload) checkpoint_key)
      is distinct from array['cursor','pageSequence']::text[]
    or not public.equora_validate_provider_cursor_v1(
      v_checkpoint.cursor_contract_version,
      v_checkpoint.checkpoint_payload -> 'cursor'
    )
    or (v_checkpoint.checkpoint_payload ->> 'pageSequence') !~ '^(0|[1-9][0-9]*)$'
    or (v_checkpoint.checkpoint_payload ->> 'pageSequence')::integer
      <> (p_raw_envelope ->> 'pageSequence')::integer
    or (p_next_checkpoint_payload ->> 'pageSequence')::integer
      <> (p_raw_envelope ->> 'pageSequence')::integer
        + (case when p_next_checkpoint_status='continue' then 1 else 0 end)
  then raise exception 'MB3_PAGE_SEQUENCE_BINDING_MISMATCH'; end if;

  v_current_mac := public.equora_provider_checkpoint_mac_v2(
    v_checkpoint.provider_code,v_checkpoint.provider_contract_version,
    v_checkpoint.capability_id,v_checkpoint.capability_contract_version,
    v_checkpoint.checkpoint_contract_version,v_checkpoint.contract_snapshot_digest,
    v_checkpoint.work_unit_id,
    v_checkpoint.checkpoint_generation,v_checkpoint.checkpoint_payload,
    v_key.key_material
  );
  if not public.equora_constant_time_hex_equal_v1(v_current_mac,v_checkpoint.checkpoint_mac)
  then raise exception 'MB3_PAGE_COMMIT_CHECKPOINT_MAC_INVALID'; end if;

  v_next_generation := v_checkpoint.checkpoint_generation + 1;
  v_next_mac := public.equora_provider_checkpoint_mac_v2(
    v_checkpoint.provider_code,v_checkpoint.provider_contract_version,
    v_checkpoint.capability_id,v_checkpoint.capability_contract_version,
    v_checkpoint.checkpoint_contract_version,v_checkpoint.contract_snapshot_digest,
    v_checkpoint.work_unit_id,
    v_next_generation,p_next_checkpoint_payload,v_key.key_material
  );
  if not public.equora_constant_time_hex_equal_v1(v_next_mac,p_next_checkpoint_mac)
  then raise exception 'MB3_PAGE_COMMIT_NEXT_CHECKPOINT_MAC_INVALID'; end if;

  -- Re-sample immediately before the first durable effect so CPU validation
  -- cannot extend request authority past its deadline after the final lock.
  v_now := clock_timestamp();
  if v_auth.send_deadline_at <= v_now
  then raise exception 'MB3_PAGE_COMMIT_AUTHORIZATION_INVALID'; end if;
  if v_key.valid_from > v_now
    or (v_key.valid_to is not null and v_key.valid_to <= v_now)
  then raise exception 'MB3_PAGE_COMMIT_INTEGRITY_KEY_INVALID'; end if;

  insert into public.broker_capture_page_commits_v2 (
    id,request_authorization_id,enrollment_id,enrollment_generation,
    user_id,broker_account_id,sync_activation_id,activation_generation,
    work_unit_id,provider_code,provider_contract_version,capability_id,
    capability_contract_version,contract_snapshot_digest,
    request_sequence,request_plan_digest,
    raw_envelope_contract_version,raw_envelope,raw_envelope_digest,
    response_digest,checkpoint_generation_before,checkpoint_generation_after,
    checkpoint_mac_before,checkpoint_mac_after,checkpoint_status_after,
    scope_completeness,input_digest,committed_at
  ) values (
    p_page_commit_id,p_request_authorization_id,v_auth.enrollment_id,
    v_auth.enrollment_generation,v_auth.user_id,v_auth.broker_account_id,
    v_auth.sync_activation_id,v_auth.activation_generation,v_auth.work_unit_id,
    v_auth.provider_code,v_auth.provider_contract_version,v_auth.capability_id,
    v_auth.capability_contract_version,v_contract_snapshot_digest,
    p_request_sequence,p_request_plan_digest,
    v_checkpoint.raw_envelope_contract_version,p_raw_envelope,
    p_raw_envelope_digest,p_response_digest,v_checkpoint.checkpoint_generation,
    v_next_generation,v_checkpoint.checkpoint_mac,p_next_checkpoint_mac,
    p_next_checkpoint_status,p_scope_completeness,v_input_digest,v_now
  );
  -- The direct auth.users FK can still wait after the pre-insert sample.
  -- Re-sample after that first insert; failure rolls the insert back and its
  -- acquired parent-key lock prevents a second auth.users wait in the Receipt.
  v_now := clock_timestamp();
  if v_auth.send_deadline_at <= v_now
  then raise exception 'MB3_PAGE_COMMIT_AUTHORIZATION_INVALID'; end if;
  if v_key.valid_from > v_now
    or (v_key.valid_to is not null and v_key.valid_to <= v_now)
  then raise exception 'MB3_PAGE_COMMIT_INTEGRITY_KEY_INVALID'; end if;

  update public.broker_capture_checkpoints_v2
  set checkpoint_generation = v_next_generation,
      row_version = row_version + 1,
      checkpoint_payload = p_next_checkpoint_payload,
      checkpoint_mac = p_next_checkpoint_mac,
      checkpoint_status = p_next_checkpoint_status,
      updated_at = v_now
  where work_unit_id = v_checkpoint.work_unit_id
    and row_version = p_expected_checkpoint_row_version
    and checkpoint_generation = p_expected_checkpoint_generation
    and checkpoint_mac = p_expected_checkpoint_mac;
  if not found then raise exception 'MB3_PAGE_COMMIT_CHECKPOINT_CAS_MISMATCH'; end if;

  update public.broker_capture_work_units
  set row_version = row_version + 1,
      request_sequence = p_request_sequence,
      status = case
        when p_next_checkpoint_status = 'continue' then 'running'
        when p_next_checkpoint_status = 'complete' then 'terminal_observed'
        else 'partial_failed'
      end,
      updated_at = v_now
  where id = v_work_unit.id
    and row_version = p_expected_work_unit_row_version
    and request_sequence + 1 = p_request_sequence;
  if not found then raise exception 'MB3_PAGE_COMMIT_WORK_UNIT_CAS_MISMATCH'; end if;

  update public.broker_capture_request_authorizations_v2
  set authorization_status='consumed',consumed_at=v_now
  where id=p_request_authorization_id and authorization_status='issued';
  if not found then raise exception 'MB3_PAGE_COMMIT_AUTHORIZATION_INVALID'; end if;

  v_result := jsonb_build_object(
    'status','page_committed','pageCommitId',p_page_commit_id,
    'requestAuthorizationId',p_request_authorization_id,
    'workUnitId',v_work_unit.id,'requestSequence',p_request_sequence,
    'checkpointGeneration',v_next_generation,
    'checkpointStatus',p_next_checkpoint_status,
    'scopeCompleteness',p_scope_completeness,
    'normalizationAuthority','none',
    'reconciliationAuthority','none',
    'approvalAuthority','none','importAuthority','none'
  );
  insert into public.broker_runtime_authority_receipts_v2 (
    id,authority_action,request_authorization_id,page_commit_id,
    enrollment_id,enrollment_generation,user_id,broker_account_id,
    provider_code,provider_contract_version,capability_id,
    capability_contract_version,work_unit_id,input_digest,result,created_at
  ) values (
    p_page_commit_id,'page_committed',p_request_authorization_id,p_page_commit_id,
    v_auth.enrollment_id,v_auth.enrollment_generation,v_auth.user_id,
    v_auth.broker_account_id,v_auth.provider_code,
    v_auth.provider_contract_version,v_auth.capability_id,
    v_auth.capability_contract_version,v_auth.work_unit_id,
    v_input_digest,v_result,v_now
  );
  return v_result;
exception
  when lock_not_available then raise exception 'MB3_RUNTIME_LOCK_TIMEOUT';
  when query_canceled then raise exception 'MB3_RUNTIME_STATEMENT_TIMEOUT';
end;
$$;

alter function public.equora_commit_provider_capture_page_v2(
  uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,integer,text,jsonb,text,text,jsonb,text,text,text,text
) owner to equora_broker_runtime_v2;
revoke all on function public.equora_commit_provider_capture_page_v2(
  uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,integer,text,jsonb,text,text,jsonb,text,text,text,text
) from public, anon, authenticated, equora_broker_operator_control_v2;
grant execute on function public.equora_commit_provider_capture_page_v2(
  uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,integer,text,jsonb,text,text,jsonb,text,text,text,text
) to service_role;

-- Runtime receives only the DML its two SECURITY DEFINER RPCs require. It has
-- no ownership, INSERT, UPDATE or DELETE authority on Registry or Enrollment.
grant select, update on table public.broker_capture_work_units
  to equora_broker_runtime_v2;
grant select, insert, update on table public.broker_capture_checkpoints_v2,
  public.broker_capture_request_authorizations_v2
  to equora_broker_runtime_v2;
grant select, insert on table public.broker_capture_page_commits_v2,
  public.broker_runtime_authority_receipts_v2
  to equora_broker_runtime_v2;

insert into equora_private.schema_migrations (
  migration_id, contract_fingerprint
) values (
  'equora_v57.61.0_multibroker_mb3_v1',
  '32b297e73ce92932eb494296f242794e5a36c4dfdcaed0043ba6458dad0c9c19'
) on conflict (migration_id) do nothing;

create or replace function equora_private.equora_verify_multibroker_mb3_v1()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role record;
  v_table text;
  v_function record;
  v_required_fkeys text[] := array[
    'broker_provider_capability_contracts_v2_provider_fkey',
    'broker_runtime_enrollments_v2_account_fkey',
    'broker_runtime_enrollments_v2_capability_fkey',
    'broker_operator_control_receipts_v2_enrollment_fkey',
    'broker_capture_checkpoints_v2_work_unit_fkey',
    'broker_capture_checkpoints_v2_activation_fkey',
    'broker_capture_checkpoints_v2_capability_fkey',
    'broker_capture_request_auth_v2_enrollment_fkey',
    'broker_capture_request_auth_v2_checkpoint_fkey',
    'broker_capture_page_commits_v2_authorization_fkey',
    'broker_capture_page_commits_v2_enrollment_fkey',
    'broker_runtime_authority_receipts_v2_enrollment_fkey'
  ];
  v_required_indexes text[] := array[
    'idx_broker_capability_contracts_v2_status',
    'idx_broker_runtime_enrollments_v2_owner_state',
    'idx_broker_runtime_enrollments_v2_live_scope',
    'idx_broker_runtime_enrollments_v2_account_fkey',
    'idx_broker_operator_receipts_v2_enrollment',
    'idx_broker_checkpoints_v2_claim_path',
    'idx_broker_checkpoints_v2_activation_fkey',
    'idx_broker_request_auth_v2_open',
    'idx_broker_request_auth_v2_single_issued',
    'idx_broker_request_auth_v2_enrollment_fkey',
    'idx_broker_page_commits_v2_owner_keyset',
    'idx_broker_page_commits_v2_enrollment_fkey',
    'idx_broker_runtime_receipts_v2_owner_keyset'
  ];
  v_expected_registry jsonb := jsonb_build_array(
    jsonb_build_array('funding_records_v1','mexc_funding_records_capability_v1','mexc_funding_records_query_v1','mexc_funding_records_response_v1'),
    jsonb_build_array('historical_executions_v3','mexc_historical_executions_capability_v1','mexc_historical_executions_query_v1','mexc_historical_executions_response_v1'),
    jsonb_build_array('historical_orders_v1','mexc_historical_orders_capability_v1','mexc_historical_orders_query_v1','mexc_historical_orders_response_v1'),
    jsonb_build_array('historical_positions_v1','mexc_historical_positions_capability_v1','mexc_historical_positions_query_v1','mexc_historical_positions_response_v1')
  );
  v_actual_registry jsonb;
  v_expected_rls_policy_count integer := 20;
  v_expected_rls_policy_digest text :=
    '243eefe064eb0b748f1ee4ac6f6522051d366473ad69e964577ce81ca15ebd02';
  v_actual_rls_policy_count integer;
  v_actual_rls_policy_digest text;
begin
  if not exists (
    select 1 from equora_private.schema_migrations
    where migration_id='equora_v57.61.0_multibroker_mb3_v1'
      and contract_fingerprint='32b297e73ce92932eb494296f242794e5a36c4dfdcaed0043ba6458dad0c9c19'
  ) then raise exception 'MB3_MARKER_DRIFT'; end if;

  for v_role in select * from pg_roles
    where rolname in ('equora_broker_operator_control_v2','equora_broker_runtime_v2')
  loop
    if v_role.rolsuper or v_role.rolcreatedb or v_role.rolcreaterole
      or v_role.rolcanlogin or v_role.rolinherit or v_role.rolreplication
      or v_role.rolconnlimit <> -1 or v_role.rolvaliduntil is not null
      or v_role.rolbypassrls
      or v_role.rolconfig is not null
    then raise exception 'MB3_AUTHORITY_ROLE_DRIFT'; end if;
  end loop;
  if exists (
    select 1 from pg_authid
    where rolname in (
      'equora_broker_operator_control_v2','equora_broker_runtime_v2'
    ) and rolpassword is not null
  ) then raise exception 'MB3_AUTHORITY_ROLE_DRIFT'; end if;
  if (select count(*) from pg_roles where rolname in (
      'equora_broker_operator_control_v2','equora_broker_runtime_v2')) <> 2
  then raise exception 'MB3_AUTHORITY_ROLE_DRIFT'; end if;
  if exists (
    select 1 from pg_auth_members membership_row
    join pg_roles role_row on role_row.oid=membership_row.roleid
    join pg_roles member_row on member_row.oid=membership_row.member
    where role_row.rolname in (
      'equora_broker_operator_control_v2','equora_broker_runtime_v2'
    )
      and (
        member_row.rolname <> 'postgres'
        or not membership_row.admin_option
        or membership_row.inherit_option
        or membership_row.set_option
      )
  ) then raise exception 'MB3_AUTHORITY_ROLE_MEMBERSHIP_DRIFT'; end if;
  if has_schema_privilege(
      'equora_broker_operator_control_v2','public','create'
    ) or has_schema_privilege(
      'equora_broker_runtime_v2','public','create'
    )
  then raise exception 'MB3_AUTHORITY_ROLE_SCHEMA_DRIFT'; end if;

  select count(*), public.equora_tcj_digest_v1(
      'mb3_rls_policy_set_v1',
      public.equora_tcj_from_jsonb_v1(jsonb_agg(
        jsonb_build_array(
          schemaname,tablename,policyname,permissive,
          to_jsonb(roles),cmd,qual,with_check
        ) order by schemaname,tablename,policyname
      ))
    )
    into v_actual_rls_policy_count,v_actual_rls_policy_digest
  from pg_policies
  where (
      schemaname='public' and tablename in (
        'broker_runtime_enrollments_v2','broker_operator_control_receipts_v2',
        'broker_capture_checkpoints_v2','broker_capture_request_authorizations_v2',
        'broker_capture_page_commits_v2','broker_runtime_authority_receipts_v2'
      )
    ) or policyname=any(array[
      'broker_accounts_mb3_operator_select','broker_accounts_mb3_operator_lock',
      'broker_accounts_mb3_runtime_select','broker_accounts_mb3_runtime_lock',
      'broker_activations_mb3_runtime_select','broker_activations_mb3_runtime_lock',
      'broker_scopes_mb3_runtime_select','broker_scopes_mb3_runtime_lock',
      'broker_work_units_mb3_runtime_select','broker_work_units_mb3_runtime_update',
      'broker_integrity_keys_mb3_runtime_select','broker_integrity_keys_mb3_runtime_lock',
      'broker_enrollments_mb3_runtime_select','broker_enrollments_mb3_runtime_lock'
    ]);
  if v_actual_rls_policy_count <> v_expected_rls_policy_count
    or v_actual_rls_policy_digest is distinct from v_expected_rls_policy_digest
    or exists (
      select 1 from pg_policies
      where (schemaname,tablename) in (
        ('public','broker_accounts'),('public','broker_sync_activations'),
        ('public','broker_sync_scopes'),('public','broker_capture_work_units'),
        ('equora_private','broker_capture_integrity_keys'),
        ('public','broker_runtime_enrollments_v2')
      )
        and (
          roles && array[
            'equora_broker_operator_control_v2',
            'equora_broker_runtime_v2'
          ]::name[]
          or 'public'::name = any(roles)
        )
        and not (policyname=any(array[
          'broker_accounts_mb3_operator_select','broker_accounts_mb3_operator_lock',
          'broker_accounts_mb3_runtime_select','broker_accounts_mb3_runtime_lock',
          'broker_activations_mb3_runtime_select','broker_activations_mb3_runtime_lock',
          'broker_scopes_mb3_runtime_select','broker_scopes_mb3_runtime_lock',
          'broker_work_units_mb3_runtime_select','broker_work_units_mb3_runtime_update',
          'broker_integrity_keys_mb3_runtime_select','broker_integrity_keys_mb3_runtime_lock',
          'broker_enrollments_mb3_runtime_select','broker_enrollments_mb3_runtime_lock'
        ]))
    )
  then raise exception 'MB3_RLS_POLICY_DRIFT'; end if;

  select jsonb_agg(
      jsonb_build_array(
        capability_id, capability_contract_version,
        query_contract_version, response_contract_version
      ) order by capability_id
    ) into v_actual_registry
  from public.broker_provider_capability_contracts_v2
  where provider_code='mexc'
    and provider_contract_version='mexc_futures_contract_v1'
    and adapter_policy_version='equora_mb3_adapter_policy_v1'
    and page_scope_contract_version='equora_provider_page_scope_v2'
    and cursor_contract_version='mexc_page_number_cursor_v1'
    and raw_envelope_contract_version='equora_provider_raw_envelope_v2'
    and normalization_contract_version='blocked_pending_versioned_normalization'
    and checkpoint_contract_version='equora_provider_checkpoint_v2'
    and checkpoint_mac_version='equora_provider_checkpoint_hmac_sha256_v2'
    and read_method='GET' and registry_status='verified'
    and registry_generation=1 and provider_account_cap=1
    and provider_capability_cap=16;
  if v_actual_registry is distinct from v_expected_registry
    or (select count(*) from public.broker_provider_capability_contracts_v2) <> 4
  then raise exception 'MB3_CAPABILITY_REGISTRY_DRIFT'; end if;

  foreach v_table in array array[
    'broker_provider_capability_contracts_v2',
    'broker_runtime_enrollments_v2','broker_operator_control_receipts_v2',
    'broker_capture_checkpoints_v2','broker_capture_request_authorizations_v2',
    'broker_capture_page_commits_v2','broker_runtime_authority_receipts_v2'
  ] loop
    if v_table <> 'broker_provider_capability_contracts_v2' and not exists (
      select 1 from pg_class relation_row
      join pg_namespace namespace_row on namespace_row.oid=relation_row.relnamespace
      where namespace_row.nspname='public' and relation_row.relname=v_table
        and relation_row.relkind='r' and relation_row.relrowsecurity
    ) then raise exception 'MB3_RLS_CONTRACT_DRIFT'; end if;
    if exists (
      select 1 from aclexplode(coalesce((
        select relacl from pg_class relation_row
        join pg_namespace namespace_row on namespace_row.oid=relation_row.relnamespace
        where namespace_row.nspname='public' and relation_row.relname=v_table
      ), acldefault('r',(
        select relowner from pg_class relation_row
        join pg_namespace namespace_row on namespace_row.oid=relation_row.relnamespace
        where namespace_row.nspname='public' and relation_row.relname=v_table
      )))) acl
      left join pg_roles role_row on role_row.oid=acl.grantee
      where not (
        (role_row.rolname='equora_broker_operator_control_v2'
          and v_table in ('broker_provider_capability_contracts_v2',
            'broker_runtime_enrollments_v2','broker_operator_control_receipts_v2'))
        or (role_row.rolname='equora_broker_runtime_v2'
          and v_table in ('broker_capture_checkpoints_v2',
            'broker_capture_request_authorizations_v2',
            'broker_capture_page_commits_v2','broker_runtime_authority_receipts_v2'))
        or (role_row.rolname='authenticated' and acl.privilege_type='SELECT')
        or (role_row.rolname='equora_broker_runtime_v2'
          and v_table='broker_runtime_enrollments_v2'
          and acl.privilege_type in ('SELECT','UPDATE'))
      )
    ) then raise exception 'MB3_DIRECT_DML_GRANT_DRIFT'; end if;
  end loop;

  -- The four security-sensitive function names are a closed exact-signature
  -- set. No additional overload may inherit an ACL exception by name.
  if to_regprocedure(
      'public.equora_lock_provider_capability_contract_v2(text,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.equora_apply_broker_operator_command_v2(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text,text)'
    ) is null
    or to_regprocedure(
      'public.equora_authorize_provider_capture_request_v2(uuid,uuid,bigint,uuid,bigint,integer,bigint,bigint,text,text,text,text,timestamptz,text)'
    ) is null
    or to_regprocedure(
      'public.equora_commit_provider_capture_page_v2(uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,integer,text,jsonb,text,text,jsonb,text,text,text,text)'
    ) is null
    or (
      select count(*)
      from pg_proc procedure_row
      join pg_namespace namespace_row on namespace_row.oid=procedure_row.pronamespace
      where namespace_row.nspname='public'
        and procedure_row.proname in (
          'equora_lock_provider_capability_contract_v2',
          'equora_apply_broker_operator_command_v2',
          'equora_authorize_provider_capture_request_v2',
          'equora_commit_provider_capture_page_v2'
        )
    ) <> 4
    or exists (
      select 1
      from pg_proc procedure_row
      join pg_namespace namespace_row on namespace_row.oid=procedure_row.pronamespace
      where namespace_row.nspname='public'
        and procedure_row.proname in (
          'equora_lock_provider_capability_contract_v2',
          'equora_apply_broker_operator_command_v2',
          'equora_authorize_provider_capture_request_v2',
          'equora_commit_provider_capture_page_v2'
        )
        and procedure_row.oid not in (
          to_regprocedure('public.equora_lock_provider_capability_contract_v2(text,text,text,text)')::oid,
          to_regprocedure('public.equora_apply_broker_operator_command_v2(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text,text)')::oid,
          to_regprocedure('public.equora_authorize_provider_capture_request_v2(uuid,uuid,bigint,uuid,bigint,integer,bigint,bigint,text,text,text,text,timestamptz,text)')::oid,
          to_regprocedure('public.equora_commit_provider_capture_page_v2(uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,integer,text,jsonb,text,text,jsonb,text,text,text,text)')::oid
        )
    )
  then raise exception 'MB3_FUNCTION_SIGNATURE_DRIFT'; end if;

  if has_table_privilege(
      'equora_broker_runtime_v2',
      'public.broker_provider_capability_contracts_v2','select'
    )
    or not has_table_privilege(
      'authenticated',
      'public.broker_provider_capability_contracts_v2','select'
    )
    or to_regprocedure(
      'public.equora_lock_provider_capability_contract_v2(text,text,text,text)'
    ) is null
    or not has_function_privilege(
      'equora_broker_runtime_v2',
      'public.equora_lock_provider_capability_contract_v2(text,text,text,text)',
      'execute'
    )
    or has_function_privilege(
      'public',
      'public.equora_lock_provider_capability_contract_v2(text,text,text,text)',
      'execute'
    )
    or has_function_privilege(
      'anon',
      'public.equora_lock_provider_capability_contract_v2(text,text,text,text)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.equora_lock_provider_capability_contract_v2(text,text,text,text)',
      'execute'
    )
    or has_function_privilege(
      'service_role',
      'public.equora_lock_provider_capability_contract_v2(text,text,text,text)',
      'execute'
    )
    or exists (
      select 1
      from pg_proc procedure_row
      join pg_namespace namespace_row on namespace_row.oid=procedure_row.pronamespace
      cross join lateral aclexplode(coalesce(
        procedure_row.proacl,acldefault('f',procedure_row.proowner)
      )) acl
      left join pg_roles grantee_row on grantee_row.oid=acl.grantee
      where procedure_row.oid=to_regprocedure(
          'public.equora_lock_provider_capability_contract_v2(text,text,text,text)'
        )::oid
        and not (
          acl.grantee=procedure_row.proowner
          or (grantee_row.rolname='equora_broker_runtime_v2'
            and acl.privilege_type='EXECUTE')
        )
    )
    or exists (
      select 1
      from pg_proc procedure_row
      join pg_namespace namespace_row on namespace_row.oid=procedure_row.pronamespace
      join pg_roles owner_row on owner_row.oid=procedure_row.proowner
      where procedure_row.oid=to_regprocedure(
          'public.equora_lock_provider_capability_contract_v2(text,text,text,text)'
        )::oid
        and (
          procedure_row.prokind <> 'f'
          or not procedure_row.prosecdef
          or not (procedure_row.proconfig @> array['search_path=""']::text[])
          or owner_row.rolname <> 'equora_broker_operator_control_v2'
        )
    )
  then raise exception 'MB3_REGISTRY_LOCK_AUTHORITY_DRIFT'; end if;

  if to_regprocedure(
      'public.equora_validate_provider_cursor_v1(text,jsonb)'
    ) is null
    or not has_function_privilege(
      'equora_broker_runtime_v2',
      'public.equora_validate_provider_cursor_v1(text,jsonb)',
      'execute'
    )
    or has_function_privilege(
      'public',
      'public.equora_validate_provider_cursor_v1(text,jsonb)',
      'execute'
    )
    or has_function_privilege(
      'anon',
      'public.equora_validate_provider_cursor_v1(text,jsonb)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.equora_validate_provider_cursor_v1(text,jsonb)',
      'execute'
    )
    or has_function_privilege(
      'service_role',
      'public.equora_validate_provider_cursor_v1(text,jsonb)',
      'execute'
    )
    or has_function_privilege(
      'equora_broker_operator_control_v2',
      'public.equora_validate_provider_cursor_v1(text,jsonb)',
      'execute'
    )
    or (
      select count(*)
      from pg_proc procedure_row
      join pg_namespace namespace_row on namespace_row.oid=procedure_row.pronamespace
      where namespace_row.nspname='public'
        and procedure_row.proname='equora_validate_provider_cursor_v1'
    ) <> 1
    or exists (
      select 1
      from pg_proc procedure_row
      join pg_namespace namespace_row on namespace_row.oid=procedure_row.pronamespace
      join pg_roles owner_row on owner_row.oid=procedure_row.proowner
      where procedure_row.oid=to_regprocedure(
          'public.equora_validate_provider_cursor_v1(text,jsonb)'
        )::oid
        and (
          procedure_row.prokind <> 'f'
          or procedure_row.prosecdef
          or procedure_row.provolatile <> 'i'
          or not procedure_row.proisstrict
          or not (procedure_row.proconfig @> array['search_path=""']::text[])
          or owner_row.rolname <> 'equora_broker_runtime_v2'
        )
    )
    or exists (
      select 1
      from pg_proc procedure_row
      cross join lateral aclexplode(coalesce(
        procedure_row.proacl,acldefault('f',procedure_row.proowner)
      )) acl
      where procedure_row.oid=to_regprocedure(
          'public.equora_validate_provider_cursor_v1(text,jsonb)'
        )::oid
        and acl.grantee <> procedure_row.proowner
    )
  then raise exception 'MB3_CURSOR_CONTRACT_AUTHORITY_DRIFT'; end if;

  if exists (
    select 1
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid=procedure_row.pronamespace
    cross join lateral aclexplode(coalesce(
      procedure_row.proacl,acldefault('f',procedure_row.proowner)
    )) acl
    left join pg_roles role_row on role_row.oid=acl.grantee
    where procedure_row.oid in (
        to_regprocedure('public.equora_apply_broker_operator_command_v2(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text,text)')::oid,
        to_regprocedure('public.equora_authorize_provider_capture_request_v2(uuid,uuid,bigint,uuid,bigint,integer,bigint,bigint,text,text,text,text,timestamptz,text)')::oid,
        to_regprocedure('public.equora_commit_provider_capture_page_v2(uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,integer,text,jsonb,text,text,jsonb,text,text,text,text)')::oid
      )
      and not (
        acl.grantee=procedure_row.proowner
        or (role_row.rolname='service_role'
          and procedure_row.oid in (
            to_regprocedure('public.equora_authorize_provider_capture_request_v2(uuid,uuid,bigint,uuid,bigint,integer,bigint,bigint,text,text,text,text,timestamptz,text)')::oid,
            to_regprocedure('public.equora_commit_provider_capture_page_v2(uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,integer,text,jsonb,text,text,jsonb,text,text,text,text)')::oid
          )
          and acl.privilege_type='EXECUTE')
      )
  ) or has_function_privilege('service_role',
      'public.equora_apply_broker_operator_command_v2(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text,text)',
      'execute')
    or has_function_privilege('anon',
      'public.equora_apply_broker_operator_command_v2(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text,text)',
      'execute')
    or has_function_privilege('authenticated',
      'public.equora_apply_broker_operator_command_v2(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text,text)',
      'execute')
    or has_function_privilege('equora_broker_runtime_v2',
      'public.equora_apply_broker_operator_command_v2(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text,text)',
      'execute')
    or not has_function_privilege('equora_broker_operator_control_v2',
      'public.equora_apply_broker_operator_command_v2(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text,text)',
      'execute')
    or not has_function_privilege('service_role',
      'public.equora_authorize_provider_capture_request_v2(uuid,uuid,bigint,uuid,bigint,integer,bigint,bigint,text,text,text,text,timestamptz,text)',
      'execute')
    or has_function_privilege('anon',
      'public.equora_authorize_provider_capture_request_v2(uuid,uuid,bigint,uuid,bigint,integer,bigint,bigint,text,text,text,text,timestamptz,text)',
      'execute')
    or has_function_privilege('authenticated',
      'public.equora_authorize_provider_capture_request_v2(uuid,uuid,bigint,uuid,bigint,integer,bigint,bigint,text,text,text,text,timestamptz,text)',
      'execute')
    or has_function_privilege('equora_broker_operator_control_v2',
      'public.equora_authorize_provider_capture_request_v2(uuid,uuid,bigint,uuid,bigint,integer,bigint,bigint,text,text,text,text,timestamptz,text)',
      'execute')
    or not has_function_privilege('equora_broker_runtime_v2',
      'public.equora_authorize_provider_capture_request_v2(uuid,uuid,bigint,uuid,bigint,integer,bigint,bigint,text,text,text,text,timestamptz,text)',
      'execute')
    or not has_function_privilege('service_role',
      'public.equora_commit_provider_capture_page_v2(uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,integer,text,jsonb,text,text,jsonb,text,text,text,text)',
      'execute')
    or has_function_privilege('anon',
      'public.equora_commit_provider_capture_page_v2(uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,integer,text,jsonb,text,text,jsonb,text,text,text,text)',
      'execute')
    or has_function_privilege('authenticated',
      'public.equora_commit_provider_capture_page_v2(uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,integer,text,jsonb,text,text,jsonb,text,text,text,text)',
      'execute')
    or has_function_privilege('equora_broker_operator_control_v2',
      'public.equora_commit_provider_capture_page_v2(uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,integer,text,jsonb,text,text,jsonb,text,text,text,text)',
      'execute')
    or not has_function_privilege('equora_broker_runtime_v2',
      'public.equora_commit_provider_capture_page_v2(uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,integer,text,jsonb,text,text,jsonb,text,text,text,text)',
      'execute')
  then raise exception 'MB3_FUNCTION_GRANT_DRIFT'; end if;

  for v_function in
    select procedure_row.oid as function_oid, procedure_row.prokind,
      procedure_row.prosecdef, procedure_row.proconfig, owner_row.rolname
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid=procedure_row.pronamespace
    join pg_roles owner_row on owner_row.oid=procedure_row.proowner
    where procedure_row.oid in (
        to_regprocedure('public.equora_apply_broker_operator_command_v2(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text,text)')::oid,
        to_regprocedure('public.equora_authorize_provider_capture_request_v2(uuid,uuid,bigint,uuid,bigint,integer,bigint,bigint,text,text,text,text,timestamptz,text)')::oid,
        to_regprocedure('public.equora_commit_provider_capture_page_v2(uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,integer,text,jsonb,text,text,jsonb,text,text,text,text)')::oid
      )
  loop
    if v_function.prokind <> 'f' or not v_function.prosecdef
      or not (v_function.proconfig @> array['search_path=""']::text[])
      or (v_function.function_oid = to_regprocedure(
            'public.equora_apply_broker_operator_command_v2(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text,text)'
          )::oid
        and v_function.rolname <> 'equora_broker_operator_control_v2')
      or (v_function.function_oid <> to_regprocedure(
            'public.equora_apply_broker_operator_command_v2(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text,text)'
          )::oid
        and v_function.rolname <> 'equora_broker_runtime_v2')
    then raise exception 'MB3_FUNCTION_SECURITY_DRIFT'; end if;
  end loop;

  if (select count(*) from pg_constraint constraint_row
      join pg_namespace namespace_row
        on namespace_row.oid=constraint_row.connamespace
      where namespace_row.nspname='public'
        and constraint_row.contype='f'
        and constraint_row.conname=any(v_required_fkeys))
      <> cardinality(v_required_fkeys)
    or exists (
      select 1 from pg_constraint constraint_row
      join pg_namespace namespace_row
        on namespace_row.oid=constraint_row.connamespace
      where namespace_row.nspname='public'
        and constraint_row.conname=any(array[
          'broker_operator_control_receipts_v2_enrollment_fkey',
          'broker_capture_request_auth_v2_enrollment_fkey',
          'broker_capture_page_commits_v2_enrollment_fkey',
          'broker_runtime_authority_receipts_v2_enrollment_fkey'
        ])
        and pg_get_constraintdef(constraint_row.oid)
          ~ '(resulting_generation|enrollment_generation)'
    )
    or not exists (
      select 1 from pg_constraint constraint_row
      join pg_namespace namespace_row on namespace_row.oid=constraint_row.connamespace
      where namespace_row.nspname='public'
        and constraint_row.conname='broker_provider_capability_contracts_v2_full_contract_unique'
        and constraint_row.contype='u'
    )
    or not exists (
      select 1 from pg_constraint constraint_row
      join pg_namespace namespace_row on namespace_row.oid=constraint_row.connamespace
      where namespace_row.nspname='public'
        and constraint_row.conname='broker_capture_checkpoints_v2_capability_fkey'
        and pg_get_constraintdef(constraint_row.oid) like '%page_scope_contract_version%'
        and pg_get_constraintdef(constraint_row.oid) like '%checkpoint_mac_version%'
    )
    or (select count(*) from pg_indexes
        where schemaname='public' and indexname=any(v_required_indexes))
      <> cardinality(v_required_indexes)
    or not exists (
      select 1 from pg_indexes where schemaname='public'
        and indexname='idx_broker_runtime_enrollments_v2_live_scope'
        and indexdef like 'CREATE UNIQUE INDEX%WHERE (runtime_state <> ''revoked''::text)'
    )
    or not exists (
      select 1 from pg_indexes where schemaname='public'
        and indexname='idx_broker_request_auth_v2_single_issued'
        and indexdef like 'CREATE UNIQUE INDEX%WHERE (authorization_status = ''issued''::text)'
    )
  then raise exception 'MB3_FK_INDEX_CONTRACT_DRIFT'; end if;

  if to_regprocedure('public.equora_claim_broker_capture_work_unit_v2(uuid,bigint,uuid,uuid,text)') is null
    or to_regprocedure('public.equora_commit_broker_capture_page_v2(uuid,uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)') is null
  then raise exception 'MB3_LEGACY_RPC_COMPATIBILITY_DRIFT'; end if;
end;
$$;

revoke all on function equora_private.equora_verify_multibroker_mb3_v1()
  from public, anon, authenticated, service_role,
    equora_broker_operator_control_v2, equora_broker_runtime_v2;

revoke create on schema public
  from equora_broker_operator_control_v2, equora_broker_runtime_v2;
do $$
begin
  execute format('revoke equora_broker_operator_control_v2 from %I', current_user);
  execute format('revoke equora_broker_runtime_v2 from %I', current_user);
end;
$$;

select equora_private.equora_verify_multibroker_mb3_v1();

commit;

-- EQUORA_MB3_MIGRATION_END
