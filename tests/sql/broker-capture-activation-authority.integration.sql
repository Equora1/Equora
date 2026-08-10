begin;

do $$
begin
  if has_table_privilege(
      'service_role',
      'public.broker_sync_activation_commands',
      'select,insert,update,delete'
    )
    or has_table_privilege(
      'service_role',
      'public.broker_sync_authority_mutation_receipts',
      'select,insert,update,delete'
    )
    or has_table_privilege(
      'service_role',
      'public.broker_capture_request_authorizations',
      'select,insert,update,delete'
    )
    or has_function_privilege(
      'service_role',
      'public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)',
      'execute'
    )
    or not has_function_privilege(
      'service_role',
      'public.equora_claim_broker_capture_work_unit_v2(uuid,bigint,uuid,uuid,text)',
      'execute'
    )
    or not has_function_privilege(
      'service_role',
      'public.equora_authorize_broker_capture_request_v1(uuid,bigint,integer,text,uuid,uuid)',
      'execute'
    )
    or not has_function_privilege(
      'service_role',
      'public.equora_record_broker_sync_lane_failure_v1(uuid,bigint,bigint,bigint,text,uuid)',
      'execute'
    )
    or not has_function_privilege(
      'service_role',
      'public.equora_escalate_broker_sync_gap_v1(uuid,text,text,bigint,bigint,bigint,bigint,uuid)',
      'execute'
    )
    or has_function_privilege(
      'authenticated',
      'public.equora_apply_broker_sync_activation_command_v1(uuid)',
      'execute'
    )
  then
    raise exception 'TEST_ACTIVATION_AUTHORITY_PRIVILEGE_BOUNDARY_FAILED';
  end if;
end;
$$;

create or replace function pg_temp.insert_complete_authority_scope(
  p_scope_id uuid,
  p_lane_state_id uuid,
  p_source_channel text,
  p_request_start_ms bigint,
  p_request_end_ms bigint,
  p_scope_digest text
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_lane public.broker_sync_lane_states%rowtype;
  v_source public.broker_sync_scopes%rowtype;
  v_coverage_basis text;
  v_coverage_policy text;
  v_authority_digest text;
begin
  select * into v_lane
  from public.broker_sync_lane_states
  where id = p_lane_state_id;
  if not found then raise exception 'TEST_SCOPE_LANE_NOT_FOUND'; end if;

  select * into v_source
  from public.broker_sync_scopes
  where id = '28000000-0000-4000-8000-000000000001';
  if not found then raise exception 'TEST_SCOPE_SOURCE_NOT_FOUND'; end if;

  if p_source_channel = 'provider_export_file' then
    v_coverage_basis := 'provider_export_observed';
    v_coverage_policy := 'strict_export_verified';
  elsif p_source_channel = 'provider_api_observation' then
    v_coverage_basis := 'provider_observed';
    v_coverage_policy := 'provider_observed_best_effort';
  else
    raise exception 'TEST_SCOPE_SOURCE_INVALID';
  end if;

  v_authority_digest := public.equora_capture_authority_digest_v1(
    v_lane.sync_activation_id,
    v_lane.activation_generation,
    v_lane.broker_account_id,
    v_lane.lane_requirement_id,
    v_lane.id,
    v_lane.policy_generation,
    v_lane.capability_id,
    v_lane.instrument_scope_key,
    v_lane.lane_id,
    v_lane.profile_id,
    v_lane.profile_version,
    p_scope_digest
  );

  insert into public.broker_sync_scopes (
    id, user_id, broker_account_id, sync_activation_id,
    activation_generation, provider_code, account_identity_digest,
    account_identity_key_version, source_channel, profile_id,
    profile_version, provider_contract_version, adapter_version,
    capability_id, endpoint_id, instrument_scope_key, instrument_symbol,
    position_type, lane_id, request_start_ms, request_end_ms,
    bucket_start_ms, bucket_end_ms, boundary_policy_version,
    boundary_semantics, overlap_policy, scope_generation,
    stability_generation, coverage_basis, coverage_policy,
    scope_completeness, stability_status, digest_algorithm,
    digest_contract_version, digest_version, stability_bucket_digest,
    scope_digest, closed_at, lane_requirement_id, lane_state_id,
    policy_generation, authority_contract_version, authority_digest
  ) values (
    p_scope_id, v_lane.user_id, v_lane.broker_account_id,
    v_lane.sync_activation_id, v_lane.activation_generation,
    v_lane.provider_code, v_source.account_identity_digest,
    v_source.account_identity_key_version, p_source_channel,
    v_lane.profile_id, v_lane.profile_version,
    v_lane.provider_contract_version, v_lane.adapter_version,
    v_lane.capability_id, v_lane.capability_id,
    v_lane.instrument_scope_key, 'ETH_USDT', null, v_lane.lane_id,
    p_request_start_ms, p_request_end_ms, p_request_start_ms,
    greatest(p_request_start_ms + 1, p_request_end_ms),
    v_source.boundary_policy_version, v_source.boundary_semantics,
    v_source.overlap_policy, 1, 1, v_coverage_basis,
    v_coverage_policy, 'complete_for_profile', 'observed_once',
    'sha256', 'equora-tcj-v1', 'equora-tcj-v1', p_scope_digest,
    p_scope_digest, clock_timestamp(), v_lane.lane_requirement_id,
    v_lane.id, v_lane.policy_generation, 'broker-capture-authority-v1',
    v_authority_digest
  );
end;
$$;

create or replace function pg_temp.expect_v2_page_start_rejected(
  p_request_started_at timestamptz
) returns void
language plpgsql
set search_path = ''
as $$
begin
  begin
    perform public.equora_commit_broker_capture_page_v2(
      p_request_authorization_id => 'c3000000-0000-4000-8000-00000000ffff',
      p_work_unit_id => '670d4b00-c275-48f1-aa02-9712c6ce1190',
      p_expected_run_id => 'acba2551-2100-480b-a6fc-3ccd14c65be5',
      p_expected_broker_account_id => '14c6b264-99b8-4c74-a882-135b88e9d100',
      p_expected_connection_account_id => 'b34b98ae-a682-44de-a1bc-21ca75888d45',
      p_expected_sync_activation_id => 'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
      p_expected_activation_generation => 1,
      p_expected_scope_digest => repeat('0', 64),
      p_transition_mac_version => 'equora-broker-capture-transition-hmac-sha256-v1',
      p_transition_integrity_key_version => 'test_v1',
      p_transition_mac => repeat('0', 64),
      p_lease_token => '2c80af13-0e7c-4958-aa8e-40b306691fd9',
      p_expected_work_unit_row_version => 7,
      p_expected_checkpoint_mac => repeat('0', 64),
      p_expected_ledger_generation => 0,
      p_request_result_id => 'c6000000-0000-4000-8000-00000000ffff',
      p_request_sequence => 1,
      p_method => 'GET',
      p_request_origin => 'https://api.mexc.com',
      p_request_path => '/api/v1/private/order/list/history_orders',
      p_request_query => '{}'::jsonb,
      p_transport_contract_version => 'mexc-readonly-transport-v1',
      p_request_started_at => p_request_started_at,
      p_response_received_at => clock_timestamp(),
      p_request_duration_ms => 0,
      p_http_status => 200,
      p_provider_status_class => 'success',
      p_response_classification => 'valid_read_preview_only',
      p_raw_body_base64 => 'e30=',
      p_raw_body_digest => repeat('0', 64),
      p_raw_body_bytes => 2,
      p_page_observation_digest => repeat('0', 64),
      p_page_metadata => '{}'::jsonb,
      p_scope_completeness => 'unverified',
      p_next_checkpoint => '{}'::jsonb,
      p_next_checkpoint_mac => repeat('0', 64),
      p_next_checkpoint_status => 'terminal_observed',
      p_next_checkpoint_reason => 'terminal_short_bare_array',
      p_next_page_number => 2,
      p_events => '[]'::jsonb
    );
    raise exception 'TEST_INVALID_PAGE_START_TIME_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CAPTURE_REQUEST_AUTHORIZATION_INVALID%' then raise; end if;
  end;
end;
$$;

select pg_temp.expect_v2_page_start_rejected(null);
select pg_temp.expect_v2_page_start_rejected('infinity'::timestamptz);
select pg_temp.expect_v2_page_start_rejected('-infinity'::timestamptz);

-- First activation creation: the connection-account parent serializes Series
-- creation and the validated four-capability / twelve-lane foundation is
-- committed atomically with generation 1.
insert into public.broker_credentials (
  id, user_id, provider, encrypted_payload, key_version
) values (
  'a1000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'mexc', 'synthetic-second-ciphertext', 'test_v1'
);

insert into public.broker_connections (
  id, user_id, provider, account_label, environment, status,
  permissions, sync_mode, credential_reference
) values (
  'a2000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'mexc', 'Activation authority fixture', 'live', 'ready',
  array['read_only_user_attested'], 'manual',
  'a1000000-0000-4000-8000-000000000001'
);

insert into public.broker_accounts (
  id, user_id, provider_code, environment, display_label, identity_status,
  capability_profile_id, provider_contract_version, status
) values (
  'a4000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'mexc', 'live', 'Activation authority fixture', 'connection_scoped',
  'mexc_futures_rest', 'mexc_futures_contract_v1', 'active'
);

insert into equora_private.broker_capture_integrity_keys (
  id, user_id, broker_account_id, key_version, key_material,
  status, valid_from
) values (
  'a3000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'test_v1', convert_to('abcdef0123456789abcdef0123456789', 'UTF8'),
  'active', '2025-01-01T00:00:00Z'
);

insert into public.broker_connection_accounts (
  id, user_id, connection_id, broker_account_id, provider_code,
  environment, assignment_source, valid_from, status
) values (
  'ab4b0000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'mexc', 'live', 'connection_scoped', '2025-01-01T00:00:00Z', 'active'
);

-- The private adapter must preserve auth.uid() semantics without exposing any
-- cross-tenant authority through the outer authenticated RPC.
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin
    perform public.equora_request_broker_sync_activation_v1(
      'ab4b0000-0000-4000-8000-000000000001',
      'activate', 0, null,
      'a6000000-0000-4000-8000-000000000098'
    );
    raise exception 'TEST_AUTH_ADAPTER_NULL_CLAIM_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%ACTIVATION_COMMAND_INVALID_INPUT%' then raise; end if;
  end;
end;
$$;

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000002',
  true
);
do $$
begin
  begin
    perform public.equora_request_broker_sync_activation_v1(
      'ab4b0000-0000-4000-8000-000000000001',
      'activate', 0, null,
      'a6000000-0000-4000-8000-000000000099'
    );
    raise exception 'TEST_AUTH_ADAPTER_CROSS_TENANT_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%ACTIVATION_COMMAND_CONNECTION_NOT_FOUND%' then raise; end if;
  end;
end;
$$;
reset role;

do $$
begin
  if exists (
    select 1 from public.broker_sync_activation_commands
    where id in (
      'a6000000-0000-4000-8000-000000000098',
      'a6000000-0000-4000-8000-000000000099'
    )
  ) then
    raise exception 'TEST_AUTH_ADAPTER_REJECTION_LEFT_PARTIAL_EFFECT';
  end if;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select public.equora_request_broker_sync_activation_v1(
  'ab4b0000-0000-4000-8000-000000000001',
  'activate', 0, null,
  'a6000000-0000-4000-8000-000000000001'
);
reset role;

set local role service_role;
select public.equora_apply_broker_sync_activation_command_v1(
  'a6000000-0000-4000-8000-000000000001'
);
select public.equora_apply_broker_sync_activation_command_v1(
  'a6000000-0000-4000-8000-000000000001'
);
reset role;

do $$
declare
  v_activation_id uuid;
begin
  select current_sync_activation_id into v_activation_id
  from public.broker_sync_activation_series
  where connection_account_id = 'ab4b0000-0000-4000-8000-000000000001';

  if v_activation_id is null
    or not exists (
      select 1 from public.broker_sync_activation_series
      where connection_account_id = 'ab4b0000-0000-4000-8000-000000000001'
        and current_activation_generation = 1
        and series_row_version = 1
        and authority_epoch = 1
    )
    or (select count(*) from public.broker_sync_lane_requirements
        where sync_activation_id = v_activation_id
          and activation_generation = 1
          and requirement_source = 'activation_plan'
          and policy_generation = 1
          and superseded_at is null) <> 4
    or (select count(*) from public.broker_sync_lane_states
        where sync_activation_id = v_activation_id
          and activation_generation = 1
          and observation_status = 'not_observed'
          and health is null
          and superseded_at is null) <> 12
    or exists (
      select 1
      from public.broker_sync_lane_requirements requirement
      left join public.broker_sync_lane_states lane
        on lane.lane_requirement_id = requirement.id
       and lane.superseded_at is null
      where requirement.sync_activation_id = v_activation_id
        and requirement.superseded_at is null
      group by requirement.id
      having count(lane.id) <> 3
    )
  then
    raise exception 'TEST_ACTIVATION_FOUNDATION_NOT_ATOMIC';
  end if;
end;
$$;

-- PostgreSQL CHECK accepts UNKNOWN unless the predicate is boolean-total. Both
-- mixed-NULL legacy/control combinations must therefore be rejected.
do $$
begin
  begin
    update public.broker_sync_activations
    set authority_contract_version = null,
        lifecycle_reason_code = 'user_paused',
        last_transition_at = created_at
    where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';
    raise exception 'TEST_ACTIVATION_MIXED_NULL_REASON_WAS_ACCEPTED';
  exception when check_violation then
    if sqlerrm not like '%broker_sync_activations_authority_control_check%'
    then raise; end if;
  end;

  begin
    update public.broker_sync_activations
    set authority_contract_version = 'broker-capture-authority-v1',
        lifecycle_reason_code = null,
        last_transition_at = created_at
    where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';
    raise exception 'TEST_ACTIVATION_MIXED_NULL_CONTRACT_WAS_ACCEPTED';
  exception when check_violation then
    if sqlerrm not like '%broker_sync_activations_authority_control_check%'
    then raise; end if;
  end;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
do $$
begin
  begin
    perform public.equora_request_broker_sync_activation_v1(
      'ab4b0000-0000-4000-8000-000000000001',
      'pause', 1, 0,
      'a6000000-0000-4000-8000-000000000001'
    );
    raise exception 'TEST_ACTIVATION_COMMAND_DRIFT_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%ACTIVATION_COMMAND_REPLAY_MISMATCH%' then raise; end if;
  end;
end;
$$;
reset role;

-- Requirement creation, failure, Gap escalation and policy supersession.
do $$
declare
  v_created jsonb;
  v_replay jsonb;
  v_lane_id uuid;
  v_failure jsonb;
  v_gap jsonb;
  v_semantic_gap_replay jsonb;
  v_escalated jsonb;
  v_superseded jsonb;
begin
  v_created := public.equora_upsert_broker_sync_lane_requirement_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, 0,
    'historical_orders_v1',
    'mexc_futures_symbol_v1:ETH_USDT:none',
    'instrument_discovery',
    'b1000000-0000-4000-8000-000000000001'
  );
  v_replay := public.equora_upsert_broker_sync_lane_requirement_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, 0,
    'historical_orders_v1',
    'mexc_futures_symbol_v1:ETH_USDT:none',
    'instrument_discovery',
    'b1000000-0000-4000-8000-000000000001'
  );
  if v_created is distinct from v_replay
    or v_created ->> 'status' <> 'requirement_created'
    or v_created ->> 'seriesRowVersion' <> '2'
    or v_created ->> 'activationRowVersion' <> '1'
  then raise exception 'TEST_REQUIREMENT_CREATE_REPLAY_INVALID'; end if;

  select id into v_lane_id
  from public.broker_sync_lane_states
  where sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
    and instrument_scope_key = 'mexc_futures_symbol_v1:ETH_USDT:none'
    and lane_id = 'incremental_fast_6h'
    and superseded_at is null;

  v_failure := public.equora_record_broker_sync_lane_failure_v1(
    v_lane_id, 2, 1, 0, 'provider_timeout',
    'b1000000-0000-4000-8000-000000000002'
  );
  if v_failure ->> 'laneHealth' <> 'degraded'
    or v_failure ->> 'seriesRowVersion' <> '3'
  then raise exception 'TEST_LANE_FAILURE_INVALID'; end if;

  v_gap := public.equora_open_broker_sync_gap_v1(
    v_lane_id, null, 3, 2, 1, 1000, 2000, false, false,
    'paging', 'paging_window_unproven',
    'b1000000-0000-4000-8000-000000000003'
  );
  if v_gap ->> 'gapStatus' <> 'open'
    or v_gap ->> 'seriesRowVersion' <> '4'
  then raise exception 'TEST_GAP_OPEN_INVALID'; end if;

  v_semantic_gap_replay := public.equora_open_broker_sync_gap_v1(
    v_lane_id, null, 4, 3, 2, 1000, 2000, false, false,
    'paging', 'same_gap_observed_again',
    'b1000000-0000-4000-8000-000000000014'
  );
  if v_semantic_gap_replay ->> 'status' <> 'gap_already_open'
    or v_semantic_gap_replay ->> 'gapId' <> v_gap ->> 'gapId'
    or v_semantic_gap_replay ->> 'seriesRowVersion' <> '4'
  then raise exception 'TEST_SEMANTIC_GAP_IDEMPOTENCY_INVALID'; end if;

  v_escalated := public.equora_escalate_broker_sync_gap_v1(
    (v_gap ->> 'gapId')::uuid, 'requires_export',
    'provider_export_required', 4, 3, 2, 0,
    'b1000000-0000-4000-8000-000000000004'
  );
  if v_escalated ->> 'gapStatus' <> 'requires_export'
    or v_escalated ->> 'seriesRowVersion' <> '5'
  then raise exception 'TEST_GAP_ESCALATION_INVALID'; end if;

  v_superseded := public.equora_upsert_broker_sync_lane_requirement_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 5, 4,
    'historical_orders_v1',
    'mexc_futures_symbol_v1:ETH_USDT:none',
    'instrument_discovery',
    'b1000000-0000-4000-8000-000000000005'
  );
  if v_superseded ->> 'status' <> 'requirement_superseded'
    or v_superseded ->> 'policyGeneration' <> '2'
    or v_superseded ->> 'seriesRowVersion' <> '6'
  then raise exception 'TEST_REQUIREMENT_SUPERSESSION_INVALID'; end if;
end;
$$;

do $$
declare
  v_old_lane_id uuid;
  v_exact_replay jsonb;
begin
  if (select count(*) from public.broker_sync_lane_requirements
      where sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
        and instrument_scope_key = 'mexc_futures_symbol_v1:ETH_USDT:none'
        and policy_generation = 1 and superseded_at is not null) <> 1
    or (select count(*) from public.broker_sync_lane_states
        where sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
          and instrument_scope_key = 'mexc_futures_symbol_v1:ETH_USDT:none'
          and policy_generation = 1 and superseded_at is not null) <> 3
    or (select count(*) from public.broker_sync_lane_states
        where sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
          and instrument_scope_key = 'mexc_futures_symbol_v1:ETH_USDT:none'
          and policy_generation = 2 and superseded_at is null
          and observation_status = 'not_observed' and health is null) <> 3
    or (public.equora_derive_capture_health_at_v1(
          'b15526c9-c0e7-4ace-a3d1-f8055de216c8', clock_timestamp()
        ) ->> 'health') <> 'gap_requires_export'
  then raise exception 'TEST_POLICY_SUPERSESSION_CARRIED_OR_HID_EVIDENCE'; end if;

  select id into v_old_lane_id
  from public.broker_sync_lane_states
  where sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
    and instrument_scope_key = 'mexc_futures_symbol_v1:ETH_USDT:none'
    and lane_id = 'incremental_fast_6h'
    and policy_generation = 1;

  v_exact_replay := public.equora_open_broker_sync_gap_v1(
    v_old_lane_id, null, 3, 2, 1, 1000, 2000, false, false,
    'paging', 'paging_window_unproven',
    'b1000000-0000-4000-8000-000000000003'
  );
  if v_exact_replay ->> 'status' <> 'gap_opened'
    or v_exact_replay ->> 'seriesRowVersion' <> '4'
  then raise exception 'TEST_EXACT_REPLAY_AFTER_POLICY_CHANGE_INVALID'; end if;

  begin
    perform public.equora_record_broker_sync_lane_failure_v1(
      v_old_lane_id, 6, 5, 4, 'stale_policy_write',
      'b1000000-0000-4000-8000-000000000006'
    );
    raise exception 'TEST_OLD_POLICY_MUTATION_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%AUTHORITY_POLICY_NOT_CURRENT%' then raise; end if;
  end;
end;
$$;

select pg_temp.insert_complete_authority_scope(
  'b2000000-0000-4000-8000-000000000001',
  (
    select id from public.broker_sync_lane_states
    where sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
      and instrument_scope_key = 'mexc_futures_symbol_v1:ETH_USDT:none'
      and lane_id = 'incremental_fast_6h' and policy_generation = 1
  ),
  'provider_export_file', 900, 2100, repeat('1', 64)
);

do $$
declare
  v_gap_id uuid;
  v_lane_id uuid;
  v_result jsonb;
begin
  select id into v_gap_id
  from public.broker_sync_gaps
  where sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
    and instrument_scope_key = 'mexc_futures_symbol_v1:ETH_USDT:none'
    and policy_generation = 1 and status = 'requires_export';
  v_result := public.equora_reconcile_broker_sync_gap_v1(
    v_gap_id, 'b2000000-0000-4000-8000-000000000001',
    6, 5, 1, 'b1000000-0000-4000-8000-000000000007'
  );
  if v_result ->> 'status' <> 'gap_reconciled'
    or v_result ->> 'seriesRowVersion' <> '7'
  then raise exception 'TEST_OLD_POLICY_GAP_RECONCILIATION_INVALID'; end if;
end;
$$;

-- Unknown boundaries are resolved only from a closed provider export scope;
-- caller-supplied replacement boundaries do not exist in the RPC contract.
do $$
declare
  v_lane_id uuid;
  v_result jsonb;
begin
  select id into v_lane_id
  from public.broker_sync_lane_states
  where sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
    and instrument_scope_key = 'mexc_futures_symbol_v1:ETH_USDT:none'
    and lane_id = 'incremental_fast_6h'
    and policy_generation = 2 and superseded_at is null;
  v_result := public.equora_open_broker_sync_gap_v1(
    v_lane_id, null, 7, 6, 0, null, null, true, true,
    'unknown_boundary', 'unknown_provider_boundary',
    'b1000000-0000-4000-8000-000000000008'
  );
  if v_result ->> 'gapStatus' <> 'requires_export'
    or v_result ->> 'seriesRowVersion' <> '8'
  then raise exception 'TEST_UNKNOWN_GAP_OPEN_INVALID'; end if;
end;
$$;

select pg_temp.insert_complete_authority_scope(
  'b2000000-0000-4000-8000-000000000002',
  (
    select id from public.broker_sync_lane_states
    where sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
      and instrument_scope_key = 'mexc_futures_symbol_v1:ETH_USDT:none'
      and lane_id = 'incremental_fast_6h'
      and policy_generation = 2 and superseded_at is null
  ),
  'provider_export_file', 3000, 4000, repeat('2', 64)
);

do $$
declare
  v_gap_id uuid;
  v_lane_id uuid;
  v_result jsonb;
begin
  select id into v_gap_id
  from public.broker_sync_gaps
  where sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
    and instrument_scope_key = 'mexc_futures_symbol_v1:ETH_USDT:none'
    and policy_generation = 2 and status = 'requires_export';
  v_result := public.equora_reconcile_broker_sync_gap_v1(
    v_gap_id, 'b2000000-0000-4000-8000-000000000002',
    8, 7, 0, 'b1000000-0000-4000-8000-000000000009'
  );
  if v_result ->> 'seriesRowVersion' <> '9'
    or not exists (
      select 1 from public.broker_sync_gaps
      where id = v_gap_id and status = 'reconciled'
        and gap_from_ms = 3000 and gap_to_ms = 4000
        and not left_boundary_unknown and not right_boundary_unknown
        and required_resolution_source = 'provider_export_scope'
    )
  then raise exception 'TEST_UNKNOWN_GAP_EXPORT_RECONCILIATION_INVALID'; end if;

  select lane_state_id into v_lane_id
  from public.broker_sync_gaps
  where id = v_gap_id;
  v_result := public.equora_record_broker_sync_lane_success_v1(
    v_lane_id, 'b2000000-0000-4000-8000-000000000002',
    9, 8, 1, 3500, '1',
    'b1000000-0000-4000-8000-000000000013'
  );
  if v_result ->> 'status' <> 'lane_advanced'
    or v_result ->> 'seriesRowVersion' <> '10'
  then raise exception 'TEST_RECONCILED_LANE_RECOVERY_INVALID'; end if;
end;
$$;

-- Monotone numeric watermark and exact evidence replay.
select pg_temp.insert_complete_authority_scope(
  'b2000000-0000-4000-8000-000000000003',
  (
    select id from public.broker_sync_lane_states
    where sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
      and instrument_scope_key = 'mexc_futures_symbol_v1:ETH_USDT:none'
      and lane_id = 'rolling_audit_7d_daily'
      and policy_generation = 2 and superseded_at is null
  ),
  'provider_api_observation', 5000, 6000, repeat('3', 64)
);
select pg_temp.insert_complete_authority_scope(
  'b2000000-0000-4000-8000-000000000004',
  (
    select id from public.broker_sync_lane_states
    where sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
      and instrument_scope_key = 'mexc_futures_symbol_v1:ETH_USDT:none'
      and lane_id = 'rolling_audit_7d_daily'
      and policy_generation = 2 and superseded_at is null
  ),
  'provider_api_observation', 5000, 6000, repeat('4', 64)
);

do $$
declare
  v_lane_id uuid;
  v_result jsonb;
  v_replay jsonb;
begin
  select id into v_lane_id
  from public.broker_sync_lane_states
  where sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
    and instrument_scope_key = 'mexc_futures_symbol_v1:ETH_USDT:none'
    and lane_id = 'rolling_audit_7d_daily'
    and policy_generation = 2 and superseded_at is null;
  v_result := public.equora_record_broker_sync_lane_success_v1(
    v_lane_id, 'b2000000-0000-4000-8000-000000000003',
    10, 9, 0, 5500, '10',
    'b1000000-0000-4000-8000-000000000010'
  );
  v_replay := public.equora_record_broker_sync_lane_success_v1(
    v_lane_id, 'b2000000-0000-4000-8000-000000000003',
    10, 9, 0, 5500, '10',
    'b1000000-0000-4000-8000-000000000010'
  );
  if v_result is distinct from v_replay
    or v_result ->> 'status' <> 'lane_advanced'
    or v_result ->> 'seriesRowVersion' <> '11'
  then raise exception 'TEST_LANE_SUCCESS_REPLAY_INVALID'; end if;

  begin
    perform public.equora_record_broker_sync_lane_success_v1(
      v_lane_id, 'b2000000-0000-4000-8000-000000000004',
      11, 10, 1, 5500, '10',
      'b1000000-0000-4000-8000-000000000015'
    );
    raise exception 'TEST_WATERMARK_EVIDENCE_DRIFT_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%AUTHORITY_WATERMARK_EVIDENCE_DRIFT%' then raise; end if;
  end;

  if not exists (
    select 1 from public.broker_sync_activation_series
    where id = '16000000-0000-4000-8000-000000000001'
      and series_row_version = 11 and authority_epoch = 10
  ) or not exists (
    select 1 from public.broker_sync_lane_states
    where id = v_lane_id and row_version = 1
      and high_watermark_time_ms = 5500
      and high_watermark_tie_breaker = '10'
      and last_complete_scope_digest = repeat('3', 64)
  ) then raise exception 'TEST_WATERMARK_EVIDENCE_DRIFT_LEFT_PARTIAL_EFFECT'; end if;

  begin
    perform public.equora_record_broker_sync_lane_success_v1(
      v_lane_id, 'b2000000-0000-4000-8000-000000000003',
      11, 10, 1, 5400, '999',
      'b1000000-0000-4000-8000-000000000011'
    );
    raise exception 'TEST_WATERMARK_REGRESSION_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%AUTHORITY_WATERMARK_REGRESSION%' then raise; end if;
  end;

  begin
    perform public.equora_record_broker_sync_lane_success_v1(
      v_lane_id, 'b2000000-0000-4000-8000-000000000003',
      11, 10, 1, 5500, '010',
      'b1000000-0000-4000-8000-000000000012'
    );
    raise exception 'TEST_NONCANONICAL_TIE_BREAKER_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%AUTHORITY_LANE_SUCCESS_INVALID_INPUT%' then raise; end if;
  end;
end;
$$;

-- The cache is deliberately stale. Claim and request dispatch must derive
-- current health and policy under locks, then consume one short-lived permit.
update public.broker_sync_activations
set capture_health = 'revoked'
where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';

do $$
declare
  v_claim jsonb;
  v_authorization jsonb;
  v_failure jsonb;
  v_replay jsonb;
begin
  v_claim := public.equora_claim_broker_capture_work_unit_v2(
    '870d4b00-c275-48f1-aa02-9712c6ce1190', 0,
    'c1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001',
    'broker-capture-claim-v1'
  );
  if v_claim ->> 'status' <> 'claimed'
    or (select capture_health from public.broker_sync_activations
        where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8') = 'revoked'
  then raise exception 'TEST_CLAIM_TRUSTED_STALE_HEALTH_CACHE'; end if;

  v_authorization := public.equora_authorize_broker_capture_request_v1(
    '870d4b00-c275-48f1-aa02-9712c6ce1190', 1, 1,
    v_claim ->> 'checkpointMac',
    'c2000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001'
  );
  if v_authorization ->> 'status' <> 'request_authorized'
    or v_authorization ->> 'seriesRowVersion' <> '11'
    or v_authorization ->> 'authorityEpoch' <> '10'
  then raise exception 'TEST_REQUEST_AUTHORIZATION_INVALID'; end if;

  begin
    perform public.equora_authorize_broker_capture_request_v1(
      '870d4b00-c275-48f1-aa02-9712c6ce1190', 1, 1,
      v_claim ->> 'checkpointMac',
      'c2000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000001'
    );
    raise exception 'TEST_REQUEST_AUTHORIZATION_REUSE_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%REQUEST_AUTH_ALREADY_CONSUMED%' then raise; end if;
  end;

  v_failure := public.equora_record_broker_capture_failure_v2(
    'c3000000-0000-4000-8000-000000000001', clock_timestamp(),
    '870d4b00-c275-48f1-aa02-9712c6ce1190', 1,
    'c4000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', 1,
    v_claim ->> 'checkpointMac', v_claim ->> 'capabilityId',
    v_claim ->> 'pageScopeDigest', 'rate_limited', 429, 32, 5,
    'broker-capture-failure-policy-v1'
  );
  v_replay := public.equora_record_broker_capture_failure_v2(
    'c3000000-0000-4000-8000-000000000001', clock_timestamp(),
    '870d4b00-c275-48f1-aa02-9712c6ce1190', 1,
    'c4000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', 1,
    v_claim ->> 'checkpointMac', v_claim ->> 'capabilityId',
    v_claim ->> 'pageScopeDigest', 'rate_limited', 429, 32, 5,
    'broker-capture-failure-policy-v1'
  );
  if v_failure is distinct from v_replay
    or v_failure ->> 'status' <> 'retry_pending'
  then raise exception 'TEST_AUTHORIZED_FAILURE_REPLAY_INVALID'; end if;
end;
$$;

-- A real v2 Page commit must consume an exact permit, accept both inclusive
-- request-start boundaries, replay immutably, and leave no partial effects for
-- missing, foreign, or expired permits.
-- The remaining permit fixtures use an otherwise identical isolated Scope so
-- the successful terminal Page may legitimately close the original Scope.
insert into public.broker_sync_scopes (
  id, user_id, broker_account_id, sync_activation_id,
  activation_generation, provider_code, account_identity_digest,
  account_identity_key_version, source_channel, profile_id,
  profile_version, provider_contract_version, adapter_version,
  capability_id, endpoint_id, instrument_scope_key, instrument_symbol,
  position_type, lane_id, request_start_ms, request_end_ms,
  bucket_start_ms, bucket_end_ms, boundary_policy_version,
  boundary_semantics, overlap_policy, scope_generation,
  stability_generation, coverage_basis, coverage_policy,
  scope_completeness, stability_status, digest_algorithm,
  digest_contract_version, digest_version, stability_bucket_digest,
  scope_digest, closed_at, lane_requirement_id, lane_state_id,
  policy_generation, authority_contract_version, authority_digest
)
select 'c7000000-0000-4000-8000-000000000001', source.user_id,
  source.broker_account_id, source.sync_activation_id,
  source.activation_generation, source.provider_code,
  source.account_identity_digest, source.account_identity_key_version,
  source.source_channel, source.profile_id, source.profile_version,
  source.provider_contract_version, source.adapter_version,
  source.capability_id, source.endpoint_id, source.instrument_scope_key,
  source.instrument_symbol, source.position_type, source.lane_id,
  source.request_start_ms, source.request_end_ms, source.bucket_start_ms,
  source.bucket_end_ms, source.boundary_policy_version,
  source.boundary_semantics, source.overlap_policy, source.scope_generation,
  source.stability_generation, source.coverage_basis, source.coverage_policy,
  source.scope_completeness, source.stability_status, source.digest_algorithm,
  source.digest_contract_version, source.digest_version,
  repeat('e', 64), repeat('e', 64), null,
  source.lane_requirement_id, source.lane_state_id, source.policy_generation,
  source.authority_contract_version,
  public.equora_capture_authority_digest_v1(
    source.sync_activation_id, source.activation_generation,
    source.broker_account_id, source.lane_requirement_id,
    source.lane_state_id, source.policy_generation, source.capability_id,
    source.instrument_scope_key, source.lane_id, source.profile_id,
    source.profile_version, repeat('e', 64)
  )
from public.broker_sync_scopes source
where source.id = '18000000-0000-4000-8000-000000000001';

update public.broker_capture_work_units
set scope_id = 'c7000000-0000-4000-8000-000000000001',
    authority_digest = public.equora_capture_authority_digest_v1(
      sync_activation_id, activation_generation, broker_account_id,
      lane_requirement_id, lane_state_id, policy_generation,
      'historical_orders_v1', 'mexc_futures_symbol_v1:BTC_USDT:none',
      lane_id, 'mexc_futures_rest', 'v1', repeat('e', 64)
    )
where id = '770d4b00-c275-48f1-aa02-9712c6ce1190';

insert into public.broker_capture_work_units (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  run_id, scope_id, lane_id, status, attempt, lease_token_digest,
  lease_token_format_version, lease_expires_at, row_version, checkpoint,
  checkpoint_mac, request_sequence, lane_requirement_id, lane_state_id,
  policy_generation, authority_contract_version, authority_digest
)
select variant.id, source.user_id, source.broker_account_id,
  source.sync_activation_id, source.activation_generation, source.run_id,
  source.scope_id, source.lane_id, source.status, source.attempt,
  source.lease_token_digest, source.lease_token_format_version,
  source.lease_expires_at, source.row_version, source.checkpoint,
  source.checkpoint_mac, source.request_sequence, source.lane_requirement_id,
  source.lane_state_id, source.policy_generation,
  source.authority_contract_version, source.authority_digest
from public.broker_capture_work_units source
cross join (values
  ('970d4b00-c275-48f1-aa02-9712c6ce1190'::uuid),
  ('a70d4b00-c275-48f1-aa02-9712c6ce1190'::uuid)
) variant(id)
where source.id = '770d4b00-c275-48f1-aa02-9712c6ce1190';

do $$
declare
  v_authorization jsonb;
  v_request_started_at timestamptz;
  v_send_deadline_at timestamptz;
  v_first_observed_at_us text;
  v_first_observation_digest text;
  v_repeat_observation_digest text;
  v_result jsonb;
  v_replay jsonb;
  v_before_counts bigint[];
  v_after_counts bigint[];
  v_before_work_unit jsonb;
  v_before_run jsonb;
  v_before_scope jsonb;
  v_before_activation jsonb;
begin
  v_authorization := public.equora_authorize_broker_capture_request_v1(
    '670d4b00-c275-48f1-aa02-9712c6ce1190', 7, 1,
    '160125df2a0a32533e0847d0f3586d24ffca6f139f2767e3fe712f1f16ae04c0',
    '2c80af13-0e7c-4958-aa8e-40b306691fd9',
    'c3000000-0000-4000-8000-000000000003'
  );
  select consumed_at into strict v_request_started_at
  from public.broker_capture_request_authorizations
  where id = 'c3000000-0000-4000-8000-000000000003';
  v_first_observed_at_us :=
    (extract(epoch from v_request_started_at) * 1000000)::bigint::text;
  v_first_observation_digest := public.equora_raw_event_observation_digest_v1(
    'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59',
    'd5086fb6f6a9e8e9ab86e0e853ce92ae1d47ea3a6b3cafb33e4c966ddf8b0c40',
    'acba2551-2100-480b-a6fc-3ccd14c65be5',
    'c6000000-0000-4000-8000-000000000001', 0, 'first_observation'
  );
  v_repeat_observation_digest := public.equora_raw_event_observation_digest_v1(
    'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59',
    'd5086fb6f6a9e8e9ab86e0e853ce92ae1d47ea3a6b3cafb33e4c966ddf8b0c40',
    'acba2551-2100-480b-a6fc-3ccd14c65be5',
    'c6000000-0000-4000-8000-000000000002', 0, 'repeated_observation'
  );

  v_result := pg_temp.commit_fixture_page(
    p_work_unit_id => '670d4b00-c275-48f1-aa02-9712c6ce1190',
    p_request_result_id => 'c6000000-0000-4000-8000-000000000001',
    p_expected_run_id => 'acba2551-2100-480b-a6fc-3ccd14c65be5',
    p_expected_ledger_generation => 0,
    p_response_received_at => v_request_started_at,
    p_occurrence => 'first_observation',
    p_first_observed_at_us => v_first_observed_at_us,
    p_observation_digest => v_first_observation_digest,
    p_raw_body_base64 => 'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0=',
    p_raw_body_digest => '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a',
    p_page_observation_digest => 'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59',
    p_request_authorization_id => 'c3000000-0000-4000-8000-000000000003'
  );
  v_replay := pg_temp.commit_fixture_page(
    p_work_unit_id => '670d4b00-c275-48f1-aa02-9712c6ce1190',
    p_request_result_id => 'c6000000-0000-4000-8000-000000000001',
    p_expected_run_id => 'acba2551-2100-480b-a6fc-3ccd14c65be5',
    p_expected_ledger_generation => 0,
    p_response_received_at => v_request_started_at,
    p_occurrence => 'first_observation',
    p_first_observed_at_us => v_first_observed_at_us,
    p_observation_digest => v_first_observation_digest,
    p_raw_body_base64 => 'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0=',
    p_raw_body_digest => '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a',
    p_page_observation_digest => 'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59',
    p_request_authorization_id => 'c3000000-0000-4000-8000-000000000003'
  );
  begin
    perform pg_temp.commit_fixture_page(
      p_work_unit_id => '670d4b00-c275-48f1-aa02-9712c6ce1190',
      p_request_result_id => 'c6000000-0000-4000-8000-000000000001',
      p_expected_run_id => 'acba2551-2100-480b-a6fc-3ccd14c65be5',
      p_expected_ledger_generation => 0,
      p_response_received_at => v_request_started_at,
      p_occurrence => 'first_observation',
      p_first_observed_at_us => v_first_observed_at_us,
      p_observation_digest => v_first_observation_digest,
      p_raw_body_base64 => 'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0=',
      p_raw_body_digest => repeat('f', 64),
      p_page_observation_digest => 'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59',
      p_request_authorization_id => 'c3000000-0000-4000-8000-000000000003'
    );
    raise exception 'TEST_V2_PAGE_REPLAY_DRIFT_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CAPTURE_PAGE_REPLAY_MISMATCH%' then raise; end if;
  end;
  if v_authorization ->> 'status' <> 'request_authorized'
    or v_result ->> 'status' <> 'page_committed'
    or v_result is distinct from v_replay
    or (select count(*) from public.broker_provider_request_results
        where id = 'c6000000-0000-4000-8000-000000000001') <> 1
    or (select count(*) from public.broker_capture_event_observations
        where request_result_id = 'c6000000-0000-4000-8000-000000000001') <> 1
  then raise exception 'TEST_AUTHORIZED_V2_PAGE_OR_REPLAY_INVALID'; end if;

  select array[
    (select count(*) from public.broker_provider_request_results),
    (select count(*) from public.broker_raw_responses),
    (select count(*) from public.broker_capture_raw_events),
    (select count(*) from public.broker_capture_event_observations)
  ] into v_before_counts;
  select to_jsonb(work_unit) into v_before_work_unit
  from public.broker_capture_work_units work_unit
  where id = '770d4b00-c275-48f1-aa02-9712c6ce1190';
  select to_jsonb(run_row) into v_before_run
  from public.broker_capture_runs run_row
  where id = 'acba2551-2100-480b-a6fc-3ccd14c65be5';
  select to_jsonb(scope_row) into v_before_scope
  from public.broker_sync_scopes scope_row
  where id = 'c7000000-0000-4000-8000-000000000001';
  select to_jsonb(activation_row) into v_before_activation
  from public.broker_sync_activations activation_row
  where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';

  begin
    perform pg_temp.commit_fixture_page(
      p_work_unit_id => '770d4b00-c275-48f1-aa02-9712c6ce1190',
      p_request_result_id => 'c6000000-0000-4000-8000-000000000010',
      p_expected_run_id => 'acba2551-2100-480b-a6fc-3ccd14c65be5',
      p_expected_ledger_generation => 1,
      p_response_received_at => clock_timestamp(),
      p_occurrence => 'repeated_observation',
      p_first_observed_at_us => '1759968000000000',
      p_observation_digest => 'afa896aa7449842f8c23b8d41d458b364dcca0c113077d7133da4689a397ba10',
      p_raw_body_base64 => 'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0=',
      p_raw_body_digest => '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a',
      p_page_observation_digest => 'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59',
      p_request_authorization_id => 'c3000000-0000-4000-8000-000000000099'
    );
    raise exception 'TEST_MISSING_PAGE_PERMIT_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CAPTURE_REQUEST_AUTHORIZATION_INVALID%' then raise; end if;
  end;

  begin
    perform pg_temp.commit_fixture_page(
      p_work_unit_id => '770d4b00-c275-48f1-aa02-9712c6ce1190',
      p_request_result_id => 'c6000000-0000-4000-8000-000000000011',
      p_expected_run_id => 'acba2551-2100-480b-a6fc-3ccd14c65be5',
      p_expected_ledger_generation => 1,
      p_response_received_at => v_request_started_at,
      p_occurrence => 'repeated_observation',
      p_first_observed_at_us => '1759968000000000',
      p_observation_digest => 'afa896aa7449842f8c23b8d41d458b364dcca0c113077d7133da4689a397ba10',
      p_raw_body_base64 => 'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0=',
      p_raw_body_digest => '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a',
      p_page_observation_digest => 'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59',
      p_request_authorization_id => 'c3000000-0000-4000-8000-000000000003'
    );
    raise exception 'TEST_FOREIGN_PAGE_PERMIT_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CAPTURE_REQUEST_AUTHORIZATION_INVALID%'
      and sqlerrm not like '%CAPTURE_PAGE_REPLAY_MISMATCH%'
    then raise; end if;
  end;

  select array[
    (select count(*) from public.broker_provider_request_results),
    (select count(*) from public.broker_raw_responses),
    (select count(*) from public.broker_capture_raw_events),
    (select count(*) from public.broker_capture_event_observations)
  ] into v_after_counts;
  if v_after_counts is distinct from v_before_counts
    or (select to_jsonb(work_unit) from public.broker_capture_work_units work_unit
        where id = '770d4b00-c275-48f1-aa02-9712c6ce1190') is distinct from v_before_work_unit
    or (select to_jsonb(run_row) from public.broker_capture_runs run_row
        where id = 'acba2551-2100-480b-a6fc-3ccd14c65be5') is distinct from v_before_run
    or (select to_jsonb(scope_row) from public.broker_sync_scopes scope_row
        where id = 'c7000000-0000-4000-8000-000000000001') is distinct from v_before_scope
    or (select to_jsonb(activation_row) from public.broker_sync_activations activation_row
        where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8') is distinct from v_before_activation
  then raise exception 'TEST_REJECTED_PAGE_PERMIT_LEFT_PARTIAL_EFFECT'; end if;

  v_authorization := public.equora_authorize_broker_capture_request_v1(
    '970d4b00-c275-48f1-aa02-9712c6ce1190', 7, 1,
    '160125df2a0a32533e0847d0f3586d24ffca6f139f2767e3fe712f1f16ae04c0',
    '2c80af13-0e7c-4958-aa8e-40b306691fd9',
    'c3000000-0000-4000-8000-000000000004'
  );
  update public.broker_capture_request_authorizations authorization_row
  set consumed_at = expired.consumed_at,
      send_deadline_at = expired.consumed_at + interval '5 seconds'
  from (
    select clock_timestamp() - interval '10 seconds' as consumed_at
  ) expired
  where authorization_row.id = 'c3000000-0000-4000-8000-000000000004';
  begin
    perform pg_temp.commit_fixture_page(
      p_work_unit_id => '970d4b00-c275-48f1-aa02-9712c6ce1190',
      p_request_result_id => 'c6000000-0000-4000-8000-000000000012',
      p_expected_run_id => 'acba2551-2100-480b-a6fc-3ccd14c65be5',
      p_expected_ledger_generation => 1,
      p_response_received_at => clock_timestamp(),
      p_occurrence => 'repeated_observation',
      p_first_observed_at_us => '1759968000000000',
      p_observation_digest => 'afa896aa7449842f8c23b8d41d458b364dcca0c113077d7133da4689a397ba10',
      p_raw_body_base64 => 'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0=',
      p_raw_body_digest => '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a',
      p_page_observation_digest => 'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59',
      p_request_authorization_id => 'c3000000-0000-4000-8000-000000000004'
    );
    raise exception 'TEST_EXPIRED_PAGE_PERMIT_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CAPTURE_REQUEST_AUTHORIZATION_INVALID%' then raise; end if;
  end;
  if exists (
    select 1 from public.broker_provider_request_results
    where id = 'c6000000-0000-4000-8000-000000000012'
  ) or not exists (
    select 1 from public.broker_capture_work_units
    where id = '970d4b00-c275-48f1-aa02-9712c6ce1190'
      and row_version = 7 and request_sequence = 0
  ) then raise exception 'TEST_EXPIRED_PAGE_PERMIT_LEFT_PARTIAL_EFFECT'; end if;

  v_authorization := public.equora_authorize_broker_capture_request_v1(
    'a70d4b00-c275-48f1-aa02-9712c6ce1190', 7, 1,
    '160125df2a0a32533e0847d0f3586d24ffca6f139f2767e3fe712f1f16ae04c0',
    '2c80af13-0e7c-4958-aa8e-40b306691fd9',
    'c3000000-0000-4000-8000-000000000005'
  );
  select send_deadline_at into strict v_send_deadline_at
  from public.broker_capture_request_authorizations
  where id = 'c3000000-0000-4000-8000-000000000005';
  begin
    perform pg_temp.commit_fixture_page(
      p_work_unit_id => 'a70d4b00-c275-48f1-aa02-9712c6ce1190',
      p_request_result_id => 'c6000000-0000-4000-8000-000000000002',
      p_expected_run_id => 'acba2551-2100-480b-a6fc-3ccd14c65be5',
      p_expected_ledger_generation => 1,
      p_response_received_at => v_send_deadline_at,
      p_occurrence => 'repeated_observation',
      p_first_observed_at_us => v_first_observed_at_us,
      p_observation_digest => v_repeat_observation_digest,
      p_raw_body_base64 => 'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0=',
      p_raw_body_digest => '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a',
      p_page_observation_digest => 'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59',
      p_transition_mac_override => repeat('0', 64),
      p_request_authorization_id => 'c3000000-0000-4000-8000-000000000005'
    );
    raise exception 'TEST_PAGE_SEND_DEADLINE_BOUNDARY_REJECTED';
  exception when others then
    -- Reaching a downstream v1 purpose/transition check proves the inclusive
    -- permit boundary was accepted; the subtransaction rolls back all writes.
    if sqlerrm not like '%CAPTURE_PURPOSE_BINDING_MISMATCH%'
      and sqlerrm not like '%CAPTURE_TRANSITION_MAC_INVALID%'
    then raise; end if;
  end;
end;
$$;

-- A permit consumed before a later policy flip is an in-flight winner only for
-- dispatch; its subsequent state commit must fail on the epoch/policy fence.
do $$
declare
  v_authorization jsonb;
  v_request_started_at timestamptz;
  v_primary_requirement public.broker_sync_lane_requirements%rowtype;
begin
  v_authorization := public.equora_authorize_broker_capture_request_v1(
    '770d4b00-c275-48f1-aa02-9712c6ce1190', 7, 1,
    '160125df2a0a32533e0847d0f3586d24ffca6f139f2767e3fe712f1f16ae04c0',
    '2c80af13-0e7c-4958-aa8e-40b306691fd9',
    'c3000000-0000-4000-8000-000000000002'
  );
  select consumed_at into v_request_started_at
  from public.broker_capture_request_authorizations
  where id = 'c3000000-0000-4000-8000-000000000002';

  select * into v_primary_requirement
  from public.broker_sync_lane_requirements
  where id = '26000000-0000-4000-8000-000000000001';
  perform public.equora_upsert_broker_sync_lane_requirement_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 11, 10,
    v_primary_requirement.capability_id,
    v_primary_requirement.instrument_scope_key,
    'instrument_discovery',
    'c5000000-0000-4000-8000-000000000001'
  );

  begin
    perform public.equora_record_broker_capture_failure_v2(
      'c3000000-0000-4000-8000-000000000002', v_request_started_at,
      '770d4b00-c275-48f1-aa02-9712c6ce1190', 7,
      'c4000000-0000-4000-8000-000000000002',
      '2c80af13-0e7c-4958-aa8e-40b306691fd9', 1,
      '160125df2a0a32533e0847d0f3586d24ffca6f139f2767e3fe712f1f16ae04c0',
      'historical_orders_v1',
      '20312b1ad761af60427439f96991429d4b508fb871815ad850a64e0a9e2f947d',
      'rate_limited', 429, 32, 5,
      'broker-capture-failure-policy-v1'
    );
    raise exception 'TEST_STALE_PERMIT_COMMIT_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CONTROL_ACTIVATION_NOT_CURRENT%'
      and sqlerrm not like '%CONTROL_SCOPE_INVALID%'
      and sqlerrm not like '%CONTROL_POLICY_NOT_CURRENT%'
    then raise; end if;
  end;

  if exists (
    select 1 from public.broker_capture_attempt_outcomes
    where id = 'c4000000-0000-4000-8000-000000000002'
  ) then raise exception 'TEST_STALE_PERMIT_LEFT_PARTIAL_OUTCOME'; end if;
end;
$$;

-- Credential rotation creates a new immutable credential generation and moves
-- the Connection pointer; the historical credential pin is never rewritten.
-- It forces a new activation ID and generation. Old Work
-- Units lose claim/request/page authority immediately through the Current
-- pointer; physical cleanup is intentionally irrelevant.
insert into public.broker_credentials (
  id, user_id, provider, encrypted_payload, key_version
) values (
  'd0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'mexc', 'synthetic-rotated-ciphertext', 'test_v2'
);
update public.broker_connections
set credential_reference = 'd0000000-0000-4000-8000-000000000001'
where id = '12000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select public.equora_request_broker_sync_activation_v1(
  'b34b98ae-a682-44de-a1bc-21ca75888d45',
  'activate', 12, 11,
  'd1000000-0000-4000-8000-000000000001'
);
reset role;
set local role service_role;
select public.equora_apply_broker_sync_activation_command_v1(
  'd1000000-0000-4000-8000-000000000001'
);
reset role;

do $$
declare
  v_new_activation_id uuid;
  v_old_activation_replay jsonb;
begin
  select current_sync_activation_id into v_new_activation_id
  from public.broker_sync_activation_series
  where id = '16000000-0000-4000-8000-000000000001';
  if v_new_activation_id is null
    or v_new_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
    or not exists (
      select 1 from public.broker_sync_activation_series
      where id = '16000000-0000-4000-8000-000000000001'
        and current_activation_generation = 2
        and series_row_version = 13 and authority_epoch = 12
    )
    or not exists (
      select 1 from public.broker_sync_activations
      where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
        and activation_state = 'inactive'
        and lifecycle_reason_code = 'superseded'
    )
    or (select count(*) from public.broker_sync_lane_requirements
        where sync_activation_id = v_new_activation_id
          and requirement_source = 'activation_plan'
          and superseded_at is null) <> 4
    or (select count(*) from public.broker_sync_lane_states
        where sync_activation_id = v_new_activation_id
          and observation_status = 'not_observed'
          and superseded_at is null) <> 12
  then raise exception 'TEST_ACTIVATION_SUPERSESSION_INVALID'; end if;

  v_old_activation_replay :=
    public.equora_upsert_broker_sync_lane_requirement_v1(
      'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, 0,
      'historical_orders_v1',
      'mexc_futures_symbol_v1:ETH_USDT:none',
      'instrument_discovery',
      'b1000000-0000-4000-8000-000000000001'
    );
  if v_old_activation_replay ->> 'status' <> 'requirement_created'
    or v_old_activation_replay ->> 'seriesRowVersion' <> '2'
  then raise exception 'TEST_EXACT_REPLAY_AFTER_ACTIVATION_CHANGE_INVALID'; end if;

  begin
    perform public.equora_claim_broker_capture_work_unit_v2(
      '770d4b00-c275-48f1-aa02-9712c6ce1190', 7,
      'd2000000-0000-4000-8000-000000000001',
      'd3000000-0000-4000-8000-000000000001',
      'broker-capture-claim-v1'
    );
    raise exception 'TEST_OLD_ACTIVATION_CLAIM_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CONTROL_ACTIVATION_NOT_CURRENT%' then raise; end if;
  end;
end;
$$;

-- Pause/resume preserves the exact current generation and its 4+12
-- foundation; an exact command replay changes no version or timestamp.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select public.equora_request_broker_sync_activation_v1(
  'b34b98ae-a682-44de-a1bc-21ca75888d45',
  'pause', 13, 0,
  'd1000000-0000-4000-8000-000000000002'
);
reset role;
set local role service_role;
select public.equora_apply_broker_sync_activation_command_v1(
  'd1000000-0000-4000-8000-000000000002'
);
select public.equora_apply_broker_sync_activation_command_v1(
  'd1000000-0000-4000-8000-000000000002'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select public.equora_request_broker_sync_activation_v1(
  'b34b98ae-a682-44de-a1bc-21ca75888d45',
  'resume', 14, 1,
  'd1000000-0000-4000-8000-000000000003'
);
reset role;
set local role service_role;
select public.equora_apply_broker_sync_activation_command_v1(
  'd1000000-0000-4000-8000-000000000003'
);
reset role;

do $$
declare
  v_current uuid;
begin
  select current_sync_activation_id into v_current
  from public.broker_sync_activation_series
  where id = '16000000-0000-4000-8000-000000000001';
  if not exists (
      select 1 from public.broker_sync_activation_series
      where id = '16000000-0000-4000-8000-000000000001'
        and current_sync_activation_id = v_current
        and current_activation_generation = 2
        and series_row_version = 15 and authority_epoch = 14
    )
    or not exists (
      select 1 from public.broker_sync_activations
      where id = v_current and activation_state = 'active'
        and activation_row_version = 2
        and lifecycle_reason_code = 'user_resumed'
    )
    or (select count(*) from public.broker_sync_lane_requirements
        where sync_activation_id = v_current and superseded_at is null) <> 4
    or (select count(*) from public.broker_sync_lane_states
        where sync_activation_id = v_current and superseded_at is null) <> 12
  then raise exception 'TEST_ACTIVATION_RESUME_CHANGED_FOUNDATION'; end if;
end;
$$;

-- A deliberately unbound pre-authority row cannot be paused, resumed, or
-- revoked in place. Activate is the sole migration path and must atomically
-- supersede it with a new bound generation.
update public.broker_sync_activations activation_row
set authority_contract_version = null,
    lifecycle_reason_code = null,
    last_transition_at = null
from public.broker_sync_activation_series series_row
where activation_row.id = series_row.current_sync_activation_id
  and series_row.id = '16000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);
select public.equora_request_broker_sync_activation_v1(
  'b34b98ae-a682-44de-a1bc-21ca75888d45',
  'pause', 15, 2,
  'e1000000-0000-4000-8000-000000000001'
);
select public.equora_request_broker_sync_activation_v1(
  'b34b98ae-a682-44de-a1bc-21ca75888d45',
  'revoke', 15, 2,
  'e1000000-0000-4000-8000-000000000002'
);
select public.equora_request_broker_sync_activation_v1(
  'b34b98ae-a682-44de-a1bc-21ca75888d45',
  'activate', 15, 2,
  'e1000000-0000-4000-8000-000000000003'
);
reset role;

set local role service_role;
do $$
begin
  begin
    perform public.equora_apply_broker_sync_activation_command_v1(
      'e1000000-0000-4000-8000-000000000001'
    );
    raise exception 'TEST_LEGACY_PAUSE_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%ACTIVATION_APPLY_LEGACY_AUTHORITY_UNBOUND%'
    then raise; end if;
  end;
  begin
    perform public.equora_apply_broker_sync_activation_command_v1(
      'e1000000-0000-4000-8000-000000000002'
    );
    raise exception 'TEST_LEGACY_REVOKE_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%ACTIVATION_APPLY_LEGACY_AUTHORITY_UNBOUND%'
    then raise; end if;
  end;
end;
$$;
select public.equora_apply_broker_sync_activation_command_v1(
  'e1000000-0000-4000-8000-000000000003'
);
reset role;

do $$
declare
  v_current uuid;
begin
  select current_sync_activation_id into strict v_current
  from public.broker_sync_activation_series
  where id = '16000000-0000-4000-8000-000000000001';
  if not exists (
      select 1 from public.broker_sync_activation_series
      where id = '16000000-0000-4000-8000-000000000001'
        and current_sync_activation_id = v_current
        and current_activation_generation = 3
        and series_row_version = 16 and authority_epoch = 15
    )
    or not exists (
      select 1 from public.broker_sync_activations
      where activation_series_id = '16000000-0000-4000-8000-000000000001'
        and activation_generation = 2 and activation_state = 'inactive'
        and authority_contract_version is null
        and lifecycle_reason_code is null and last_transition_at is null
    )
    or not exists (
      select 1 from public.broker_sync_activations
      where id = v_current and activation_generation = 3
        and activation_state = 'active'
        and authority_contract_version = 'broker-capture-authority-v1'
        and lifecycle_reason_code = 'superseded_activation'
        and last_transition_at is not null
    )
    or (select count(*) from public.broker_sync_lane_requirements
        where sync_activation_id = v_current and superseded_at is null) <> 4
    or (select count(*) from public.broker_sync_lane_states
        where sync_activation_id = v_current and superseded_at is null
          and observation_status = 'not_observed') <> 12
  then raise exception 'TEST_LEGACY_ACTIVATE_SUPERSESSION_INVALID'; end if;
end;
$$;

rollback;
