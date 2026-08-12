\set ON_ERROR_STOP on

begin;

do $$
begin
  if array[
    public.equora_tcj_decimal_v1('1.0'),
    public.equora_tcj_decimal_v1('123e-5'),
    public.equora_tcj_decimal_v1('1.23e5'),
    public.equora_tcj_decimal_v1('-0.000e999'),
    public.equora_tcj_decimal_v1('0e8388609')
  ] is distinct from array['1', '0.00123', '123000', '0', '0']
    or public.equora_raw_response_body_digest_v1(convert_to('{"ok":true}', 'UTF8'))
      <> 'ad8425132568e49067f0d18bef62f3c2f9d79d7c2f4219d07dcf690e227a7708'
  then
    raise exception 'TEST_SQL_TCJ_GOLDEN_VECTOR_DRIFT';
  end if;
end;
$$;

do $$
declare
  v_page_metadata jsonb;
begin
  select jsonb_build_object(
    'requestPageNumber', 1,
    'requestScope', jsonb_build_object(
      'symbol', 'BTC_USDT',
      'startTimeMs', 1759708800000,
      'endTimeMs', 1759968000000,
      'pageSize', 1000,
      'positionType', null
    ),
    'terminalEvidence', 'short_bare_array',
    'providerPage', null,
    'cursor', null,
    'orderedRawEventContentDigests', jsonb_agg(jsonb_build_object(
      'digestAlgorithm', 'sha256',
      'digestContractVersion', 'equora-tcj-v1',
      'domain', 'raw_event_content',
      'digest', repeat(to_hex((item % 15) + 1), 64)
    )),
    'authorityBlocked', true
  ) into v_page_metadata
  from generate_series(1, 372) as item;

  if octet_length(v_page_metadata::text) not between 65537 and 262144 then
    raise exception 'TEST_PAGE_METADATA_BOUNDARY_FIXTURE_DRIFT: %', octet_length(v_page_metadata::text);
  end if;

  begin
    perform public.equora_commit_broker_capture_page_v1(
      p_work_unit_id => '01000000-0000-4000-8000-000000000001',
      p_expected_run_id => '02000000-0000-4000-8000-000000000001',
      p_expected_broker_account_id => '03000000-0000-4000-8000-000000000001',
      p_expected_connection_account_id => '04000000-0000-4000-8000-000000000001',
      p_expected_sync_activation_id => '05000000-0000-4000-8000-000000000001',
      p_expected_activation_generation => 1,
      p_expected_scope_digest => repeat('1', 64),
      p_transition_mac_version => 'equora-broker-capture-transition-hmac-sha256-v1',
      p_transition_integrity_key_version => 'test_v1',
      p_transition_mac => repeat('2', 64),
      p_lease_token => '06000000-0000-4000-8000-000000000001',
      p_expected_work_unit_row_version => 0,
      p_expected_checkpoint_mac => repeat('3', 64),
      p_expected_ledger_generation => 0,
      p_request_result_id => '07000000-0000-4000-8000-000000000001',
      p_request_sequence => 1,
      p_method => 'GET',
      p_request_origin => 'https://api.mexc.com',
      p_request_path => '/api/v1/private/order/list/order_deals/v3',
      p_request_query => '{}'::jsonb,
      p_transport_contract_version => 'mexc-readonly-transport-v1',
      p_request_started_at => '2025-10-09T00:00:00Z',
      p_response_received_at => '2025-10-09T00:00:00Z',
      p_request_duration_ms => 0,
      p_http_status => 200,
      p_provider_status_class => 'success',
      p_response_classification => 'valid_read_preview_only',
      p_raw_body_base64 => 'eA==',
      p_raw_body_digest => repeat('4', 64),
      p_raw_body_bytes => 1,
      p_page_observation_digest => repeat('5', 64),
      p_page_metadata => v_page_metadata,
      p_scope_completeness => 'unverified',
      p_next_checkpoint => '{}'::jsonb,
      p_next_checkpoint_mac => repeat('6', 64),
      p_next_checkpoint_status => 'continue',
      p_next_checkpoint_reason => 'page_committed',
      p_next_page_number => 2,
      p_events => '[]'::jsonb
    );
    raise exception 'TEST_LARGE_VALID_METADATA_WAS_NOT_ROUTED_PAST_RESOURCE_GATE';
  exception when others then
    if sqlerrm not like '%CAPTURE_WORK_UNIT_NOT_FOUND%' then raise; end if;
  end;
end;
$$;

insert into auth.users (id, email, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'owner-one@example.invalid', now(), now()),
  ('20000000-0000-4000-8000-000000000002', 'owner-two@example.invalid', now(), now());

insert into public.broker_credentials (id, user_id, provider, encrypted_payload, key_version)
values (
  '11000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'mexc',
  'synthetic-ciphertext-not-a-secret',
  'test_v1'
);

insert into public.broker_connections (
  id, user_id, provider, account_label, environment, status,
  permissions, sync_mode, credential_reference
) values (
  '12000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'mexc',
  'Local SQL fixture',
  'live',
  'ready',
  array['read_only_user_attested'],
  'manual',
  '11000000-0000-4000-8000-000000000001'
), (
  '12000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'mexc',
  'Cross-tenant negative fixture parent',
  'live',
  'draft',
  '{}'::text[],
  'manual',
  null
);

insert into public.broker_accounts (
  id, user_id, provider_code, environment, display_label, identity_status,
  capability_profile_id, provider_contract_version, status
) values (
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  '10000000-0000-4000-8000-000000000001',
  'mexc',
  'live',
  'Local SQL fixture',
  'connection_scoped',
  'mexc_futures_rest',
  'mexc_futures_contract_v1',
  'active'
);

insert into equora_private.broker_capture_integrity_keys (
  id, user_id, broker_account_id, key_version, key_material,
  status, valid_from
) values (
  '13000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'test_v1',
  convert_to('0123456789abcdef0123456789abcdef', 'UTF8'),
  'active',
  '2025-01-01T00:00:00Z'
);

insert into public.broker_account_identities (
  id, user_id, broker_account_id, provider_code, environment, identity_type,
  digest_purpose, digest_algorithm, digest_contract_version, hmac_key_version,
  hmac_digest, evidence_source, verification_status, valid_from, status
) values (
  '14000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'mexc',
  'live',
  'conflicting_or_insufficient',
  'broker_account_identity_v1',
  'hmac-sha256',
  'equora-tcj-v1',
  'v1',
  '854f380b62cd55dd1edae274af280e93357e860da38e4078f6dad303e86d22fd',
  'synthetic_sql_fixture',
  'unverified_reference',
  now(),
  'active'
);

insert into public.broker_connection_accounts (
  id, user_id, connection_id, broker_account_id, provider_code, environment,
  assignment_source, valid_from, status
) values (
  'b34b98ae-a682-44de-a1bc-21ca75888d45',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'mexc',
  'live',
  'connection_scoped',
  '2025-01-01T00:00:00Z',
  'active'
);

insert into public.broker_sync_activation_series (
  id, user_id, connection_account_id, broker_account_id, series_policy_version
) values (
  '16000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'b34b98ae-a682-44de-a1bc-21ca75888d45',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'prospective_capture_v1'
);

insert into public.broker_sync_activations (
  id, activation_series_id, activation_generation, user_id,
  connection_account_id, broker_account_id, provider_code, environment,
  active_credential_id, active_credential_key_version,
  capture_integrity_key_id, capture_integrity_key_version,
  activation_cutover_at, activated_by,
  onboarding_profile_id, scheduler_policy_version, scheduler_target_seconds,
  fast_lane_overlap_seconds, audit_policy_version, activation_state,
  capture_health, provider_contract_version, adapter_version, profile_id,
  profile_version, capability_versions, permission_evidence,
  permission_evidence_version, user_read_only_attested_at,
  activation_row_version, authority_contract_version,
  lifecycle_reason_code, last_transition_at
) values (
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
  '16000000-0000-4000-8000-000000000001',
  1,
  '10000000-0000-4000-8000-000000000001',
  'b34b98ae-a682-44de-a1bc-21ca75888d45',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'mexc',
  'live',
  '11000000-0000-4000-8000-000000000001',
  'test_v1',
  '13000000-0000-4000-8000-000000000001',
  'test_v1',
  now(),
  'synthetic_sql_fixture',
  'recent_28d_plus_current_utc_day_v1',
  'scheduler_v1',
  21600,
  259200,
  'audit_v1',
  'active',
  'pending',
  'mexc_futures_contract_v1',
  'v57_61_0',
  'mexc_futures_rest',
  'v1',
  '{"funding_records_v1":"v1","historical_executions_v3":"v1","historical_orders_v1":"v1","historical_positions_v1":"v1"}'::jsonb,
  '{"mappingEvidence":"official_docs_plus_support_statement_2026-08-05","requiredCapabilities":["funding_records_v1","historical_executions_v3","historical_orders_v1","historical_positions_v1"],"technicallyDetectedWritePermissions":[],"userAttestation":"read_only_user_attested","writePermissionIntrospection":"unavailable"}'::jsonb,
  'mexc_permission_evidence_v1',
  now(),
  0, 'broker-capture-authority-v1', 'activated', now()
);

update public.broker_sync_activation_series
set current_sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
    current_activation_generation = 1,
    series_row_version = 1
where id = '16000000-0000-4000-8000-000000000001';

-- EQUORA_LANE_HEALTH_SETUP_END

insert into public.broker_sync_lane_requirements (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  provider_code, provider_contract_version, adapter_version, capability_id,
  capability_version, instrument_scope_key, profile_id, profile_version,
  policy_generation, requirement_source
) values
  (
    '26000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, 'mexc',
    'mexc_futures_contract_v1', 'v57_61_0', 'historical_orders_v1', 'v1',
    'mexc_futures_symbol_v1:BTC_USDT:none', 'mexc_futures_rest', 'v1', 1,
    'activation_plan'
  ),
  (
    '26000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, 'mexc',
    'mexc_futures_contract_v1', 'v57_61_0', 'historical_orders_v1', 'v1',
    'mexc_futures_symbol_v1:BTC_USDT:none:control', 'mexc_futures_rest', 'v1', 1,
    'activation_plan'
  );

insert into public.broker_sync_lane_states (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  lane_requirement_id, provider_code, provider_contract_version,
  adapter_version, capability_id, capability_version, instrument_scope_key,
  lane_id, profile_id, profile_version, policy_generation
)
select lane_state_id,
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, requirement_id, 'mexc',
  'mexc_futures_contract_v1', 'v57_61_0', 'historical_orders_v1', 'v1',
  instrument_scope_key, lane_id, 'mexc_futures_rest', 'v1', 1
from (values
  ('26000000-0000-4000-8000-000000000011'::uuid,
    '26000000-0000-4000-8000-000000000001'::uuid,
    'mexc_futures_symbol_v1:BTC_USDT:none', 'incremental_fast_6h'),
  ('26000000-0000-4000-8000-000000000012'::uuid,
    '26000000-0000-4000-8000-000000000001'::uuid,
    'mexc_futures_symbol_v1:BTC_USDT:none', 'rolling_audit_7d_daily'),
  ('26000000-0000-4000-8000-000000000013'::uuid,
    '26000000-0000-4000-8000-000000000001'::uuid,
    'mexc_futures_symbol_v1:BTC_USDT:none', 'rolling_audit_28d_weekly'),
  ('26000000-0000-4000-8000-000000000021'::uuid,
    '26000000-0000-4000-8000-000000000002'::uuid,
    'mexc_futures_symbol_v1:BTC_USDT:none:control', 'incremental_fast_6h'),
  ('26000000-0000-4000-8000-000000000022'::uuid,
    '26000000-0000-4000-8000-000000000002'::uuid,
    'mexc_futures_symbol_v1:BTC_USDT:none:control', 'rolling_audit_7d_daily'),
  ('26000000-0000-4000-8000-000000000023'::uuid,
    '26000000-0000-4000-8000-000000000002'::uuid,
    'mexc_futures_symbol_v1:BTC_USDT:none:control', 'rolling_audit_28d_weekly')
) fixture(lane_state_id, requirement_id, instrument_scope_key, lane_id);

-- EQUORA_SCHEDULER_CONTROL_SETUP_END

insert into public.broker_sync_scopes (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  provider_code, account_identity_digest, account_identity_key_version,
  source_channel, profile_id, profile_version, provider_contract_version,
  adapter_version, capability_id, endpoint_id, instrument_scope_key,
  instrument_symbol, position_type, lane_id, request_start_ms, request_end_ms,
  bucket_start_ms, bucket_end_ms, boundary_policy_version, boundary_semantics,
  overlap_policy, scope_generation, stability_generation, coverage_basis,
  coverage_policy, scope_completeness, stability_status, digest_algorithm,
  digest_contract_version, digest_version, stability_bucket_digest, scope_digest,
  lane_requirement_id, lane_state_id, policy_generation,
  authority_contract_version, authority_digest
) values (
  '18000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
  1,
  'mexc',
  '854f380b62cd55dd1edae274af280e93357e860da38e4078f6dad303e86d22fd',
  'v1',
  'provider_api_observation',
  'mexc_futures_rest',
  'v1',
  'mexc_futures_contract_v1',
  'v57_61_0',
  'historical_orders_v1',
  'historical_orders_v1',
  'mexc_futures_symbol_v1:BTC_USDT:none',
  'BTC_USDT',
  null,
  'incremental_fast_6h',
  1759708800000,
  1759968000000,
  1759881600000,
  1759968000000,
  'mexc_provider_unverified_overlap_v1',
  'provider_unverified',
  'minimum_72h_v1',
  1,
  1,
  'provider_observed',
  'provider_observed_best_effort',
  'unverified',
  'not_observed',
  'sha256',
  'equora-tcj-v1',
  'equora-tcj-v1',
  repeat('a', 64),
  'f7006f0e92a876de3866e7554c8add59d206b83c554e8325dc1612a852db69b1',
  '26000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000011', 1,
  'broker-capture-authority-v1',
  public.equora_capture_authority_digest_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    '26000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000011', 1,
    'historical_orders_v1', 'mexc_futures_symbol_v1:BTC_USDT:none',
    'incremental_fast_6h', 'mexc_futures_rest', 'v1',
    'f7006f0e92a876de3866e7554c8add59d206b83c554e8325dc1612a852db69b1'
  )
);

insert into public.broker_capture_runs (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  lane_id, trigger_kind, status, adapter_version, algorithm_version, scope_count,
  authority_contract_version, authority_plan_digest
) values (
  'acba2551-2100-480b-a6fc-3ccd14c65be5',
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
  1,
  'incremental_fast_6h',
  'user',
  'running',
  'v57_61_0',
  'broker-raw-ledger-v1',
  1,
  'broker-capture-authority-v1', repeat('c', 64)
);

insert into public.broker_sync_scopes (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  provider_code, account_identity_digest, account_identity_key_version,
  source_channel, profile_id, profile_version, provider_contract_version,
  adapter_version, capability_id, endpoint_id, instrument_scope_key,
  instrument_symbol, position_type, lane_id, request_start_ms, request_end_ms,
  bucket_start_ms, bucket_end_ms, boundary_policy_version, boundary_semantics,
  overlap_policy, scope_generation, stability_generation, coverage_basis,
  coverage_policy, scope_completeness, stability_status, digest_algorithm,
  digest_contract_version, digest_version, stability_bucket_digest, scope_digest,
  lane_requirement_id, lane_state_id, policy_generation,
  authority_contract_version, authority_digest
) values (
  '28000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
  1,
  'mexc',
  '854f380b62cd55dd1edae274af280e93357e860da38e4078f6dad303e86d22fd',
  'v1',
  'provider_api_observation',
  'mexc_futures_rest',
  'v1',
  'mexc_futures_contract_v1',
  'v57_61_0',
  'historical_orders_v1',
  'historical_orders_v1',
  'mexc_futures_symbol_v1:BTC_USDT:none:control',
  'BTC_USDT',
  null,
  'incremental_fast_6h',
  1759708800000,
  1759968000000,
  1759881600000,
  1759968000000,
  'mexc_provider_unverified_overlap_v1',
  'provider_unverified',
  'minimum_72h_v1',
  1,
  1,
  'provider_observed',
  'provider_observed_best_effort',
  'unverified',
  'not_observed',
  'sha256',
  'equora-tcj-v1',
  'equora-tcj-v1',
  repeat('b', 64),
  repeat('b', 64),
  '26000000-0000-4000-8000-000000000002',
  '26000000-0000-4000-8000-000000000021', 1,
  'broker-capture-authority-v1',
  public.equora_capture_authority_digest_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    '26000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000021', 1,
    'historical_orders_v1', 'mexc_futures_symbol_v1:BTC_USDT:none:control',
    'incremental_fast_6h', 'mexc_futures_rest', 'v1', repeat('b', 64)
  )
);

insert into public.broker_capture_runs (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  lane_id, trigger_kind, status, adapter_version, algorithm_version, scope_count,
  authority_contract_version, authority_plan_digest
) values (
  'bcba2551-2100-480b-a6fc-3ccd14c65be5',
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
  1,
  'incremental_fast_6h',
  'user',
  'pending',
  'v57_61_0',
  'broker-capture-control-v1',
  1,
  'broker-capture-authority-v1', repeat('d', 64)
);

create temporary table fixture_checkpoint (
  current_checkpoint jsonb not null,
  next_checkpoint jsonb not null,
  repeat_observation_digest text
);
insert into fixture_checkpoint values (
  $json${"checkpointVersion":"mexc-page-checkpoint-v1","checkpointMacVersion":"mexc-page-checkpoint-hmac-sha256-v1","budgetProfileId":"mexc-history-page-budget-v1","budgetProfileDigest":"aba71711421cebbff9f7ab4f8c761865aac36dffc91adc3d7468b6e632ab56aa","capabilityId":"historical_orders_v1","scope":{"symbol":"BTC_USDT","startTime":1759708800000,"endTime":1759968000000,"pageNumber":1,"pageSize":20},"scopeDigest":"20312b1ad761af60427439f96991429d4b508fb871815ad850a64e0a9e2f947d","status":"ready","reason":"initialized","workUnitSequence":1,"nextPageNumber":1,"unitSuccessfulPages":0,"unitRequestAttempts":0,"unitRawEvents":0,"unitResponseBytes":0,"unitElapsedMs":0,"unitRetryCount":0,"unitBackoffMs":0,"totalSuccessfulPages":0,"totalRequestAttempts":0,"totalRawEvents":0,"totalResponseBytes":0,"totalElapsedMs":0,"authorityBlocked":true,"terminalEvidence":"none","lastCursor":null,"lastPageFingerprint":null,"seenPageFingerprints":[],"orderedProviderIdentitySequenceDigest":"abc75af3e6e8f3380b3b96243cf6eaf0529eca3f40e4323cd6c8b924d1928e05","lastErrorCode":null,"suggestedBackoffMs":null,"retryNotBeforeMs":null,"checkpointMac":"160125df2a0a32533e0847d0f3586d24ffca6f139f2767e3fe712f1f16ae04c0"}$json$::jsonb,
  $json${"checkpointVersion":"mexc-page-checkpoint-v1","checkpointMacVersion":"mexc-page-checkpoint-hmac-sha256-v1","budgetProfileId":"mexc-history-page-budget-v1","budgetProfileDigest":"aba71711421cebbff9f7ab4f8c761865aac36dffc91adc3d7468b6e632ab56aa","capabilityId":"historical_orders_v1","scope":{"symbol":"BTC_USDT","startTime":1759708800000,"endTime":1759968000000,"pageNumber":1,"pageSize":20},"scopeDigest":"20312b1ad761af60427439f96991429d4b508fb871815ad850a64e0a9e2f947d","status":"terminal_observed","reason":"terminal_short_bare_array","workUnitSequence":1,"nextPageNumber":2,"unitSuccessfulPages":1,"unitRequestAttempts":1,"unitRawEvents":1,"unitResponseBytes":362,"unitElapsedMs":1,"unitRetryCount":0,"unitBackoffMs":0,"totalSuccessfulPages":1,"totalRequestAttempts":1,"totalRawEvents":1,"totalResponseBytes":362,"totalElapsedMs":1,"authorityBlocked":true,"terminalEvidence":"short_bare_array","lastCursor":{"providerTime":1759924800000,"providerId":"123"},"lastPageFingerprint":"c4236e0fe9a39bce1c511cba67cdfb536f07ec94551492e004f14edd8d7b387d","seenPageFingerprints":["c4236e0fe9a39bce1c511cba67cdfb536f07ec94551492e004f14edd8d7b387d"],"orderedProviderIdentitySequenceDigest":"595ba4e27b29a556812f670a010b854808bcb47a99415e89f0a66ed51aa0ba10","lastErrorCode":null,"suggestedBackoffMs":null,"retryNotBeforeMs":null,"checkpointMac":"cc47566304ceb8dc0e662e906ecd1912f1ebed3517e2e7a92d629eec158b90ea"}$json$::jsonb,
  public.equora_raw_event_observation_digest_v1(
    'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59',
    'd5086fb6f6a9e8e9ab86e0e853ce92ae1d47ea3a6b3cafb33e4c966ddf8b0c40',
    'acba2551-2100-480b-a6fc-3ccd14c65be5',
    '407e7468-8c64-4a94-ac00-897dbae4bb17',
    0,
    'repeated_observation'
  )
);

do $$
declare
  v_key bytea := convert_to('0123456789abcdef0123456789abcdef', 'UTF8');
begin
  if public.equora_mexc_checkpoint_mac_v1(
      (select current_checkpoint from fixture_checkpoint),
      v_key
    ) is distinct from '160125df2a0a32533e0847d0f3586d24ffca6f139f2767e3fe712f1f16ae04c0'
    or public.equora_mexc_checkpoint_mac_v1(
      (select next_checkpoint from fixture_checkpoint),
      v_key
    ) is distinct from 'cc47566304ceb8dc0e662e906ecd1912f1ebed3517e2e7a92d629eec158b90ea'
  then
    raise exception 'TEST_SQL_CHECKPOINT_HMAC_GOLDEN_VECTOR_DRIFT';
  end if;
end;
$$;

grant select on pg_temp.fixture_checkpoint to service_role;

create temporary table fixture_control_checkpoint (
  current_checkpoint jsonb not null,
  checkpoint_mac text not null
);
with prepared as (
  select current_checkpoint as checkpoint
  from fixture_checkpoint
), signed as (
  select checkpoint,
    public.equora_mexc_checkpoint_mac_v1(
      checkpoint,
      convert_to('0123456789abcdef0123456789abcdef', 'UTF8')
    ) as checkpoint_mac
  from prepared
)
insert into fixture_control_checkpoint (current_checkpoint, checkpoint_mac)
select jsonb_set(checkpoint, '{checkpointMac}', to_jsonb(checkpoint_mac)),
  checkpoint_mac
from signed;

grant select on pg_temp.fixture_control_checkpoint to service_role;

insert into public.broker_capture_work_units (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  run_id, scope_id, lane_id, status, attempt, lease_token_digest,
  lease_token_format_version, lease_expires_at, row_version, checkpoint,
  checkpoint_mac, request_sequence, lane_requirement_id, lane_state_id,
  policy_generation, authority_contract_version, authority_digest
)
select work_unit_id,
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
  1,
  'acba2551-2100-480b-a6fc-3ccd14c65be5',
  '18000000-0000-4000-8000-000000000001',
  'incremental_fast_6h',
  'running',
  1,
  public.equora_lease_token_digest_v1('2c80af13-0e7c-4958-aa8e-40b306691fd9'),
  'uuid-sha256-v1',
  now() + interval '1 hour',
  7,
  fixture_checkpoint.current_checkpoint,
  '160125df2a0a32533e0847d0f3586d24ffca6f139f2767e3fe712f1f16ae04c0',
  0,
  '26000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000011', 1,
  'broker-capture-authority-v1',
  public.equora_capture_authority_digest_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    '26000000-0000-4000-8000-000000000001',
    '26000000-0000-4000-8000-000000000011', 1,
    'historical_orders_v1', 'mexc_futures_symbol_v1:BTC_USDT:none',
    'incremental_fast_6h', 'mexc_futures_rest', 'v1',
    'f7006f0e92a876de3866e7554c8add59d206b83c554e8325dc1612a852db69b1'
  )
from fixture_checkpoint
cross join (values
  ('670d4b00-c275-48f1-aa02-9712c6ce1190'::uuid),
  ('770d4b00-c275-48f1-aa02-9712c6ce1190'::uuid)
) work_units(work_unit_id);

insert into public.broker_capture_work_units (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  run_id, scope_id, lane_id, status, attempt, row_version, checkpoint,
  checkpoint_mac, request_sequence, lane_requirement_id, lane_state_id,
  policy_generation, authority_contract_version, authority_digest
)
select
  '870d4b00-c275-48f1-aa02-9712c6ce1190',
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
  1,
  'bcba2551-2100-480b-a6fc-3ccd14c65be5',
  '28000000-0000-4000-8000-000000000001',
  'incremental_fast_6h',
  'pending',
  0,
  0,
  fixture_control_checkpoint.current_checkpoint,
  fixture_control_checkpoint.checkpoint_mac,
  0,
  '26000000-0000-4000-8000-000000000002',
  '26000000-0000-4000-8000-000000000021', 1,
  'broker-capture-authority-v1',
  public.equora_capture_authority_digest_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    '26000000-0000-4000-8000-000000000002',
    '26000000-0000-4000-8000-000000000021', 1,
    'historical_orders_v1', 'mexc_futures_symbol_v1:BTC_USDT:none:control',
    'incremental_fast_6h', 'mexc_futures_rest', 'v1', repeat('b', 64)
  )
from fixture_control_checkpoint;

do $$
declare
  v_claim_mixed_null_rejected boolean := false;
  v_error_mixed_null_rejected boolean := false;
begin
  begin
    update public.broker_capture_work_units
    set last_claim_request_id = 'f1000000-0000-4000-8000-000000000001',
        claimed_at = clock_timestamp(),
        claim_policy_version = null
    where id = '870d4b00-c275-48f1-aa02-9712c6ce1190';
  exception
    when check_violation then
      v_claim_mixed_null_rejected := true;
  end;
  if not v_claim_mixed_null_rejected then
    raise exception 'TEST_CONTROL_CLAIM_MIXED_NULL_WAS_ACCEPTED';
  end if;

  begin
    update public.broker_capture_work_units
    set last_error_code = null,
        last_error_at = clock_timestamp()
    where id = '870d4b00-c275-48f1-aa02-9712c6ce1190';
  exception
    when check_violation then
      v_error_mixed_null_rejected := true;
  end;
  if not v_error_mixed_null_rejected then
    raise exception 'TEST_CONTROL_ERROR_MIXED_NULL_WAS_ACCEPTED';
  end if;

  if not exists (
    select 1
    from public.broker_capture_work_units
    where id = '870d4b00-c275-48f1-aa02-9712c6ce1190'
      and last_claim_request_id is null
      and claimed_at is null
      and claim_policy_version is null
      and last_error_code is null
      and last_error_at is null
  ) then
    raise exception 'TEST_CONTROL_MIXED_NULL_REJECTION_LEFT_PARTIAL_STATE';
  end if;
end;
$$;

create or replace function pg_temp.commit_fixture_page(
  p_work_unit_id uuid,
  p_request_result_id uuid,
  p_expected_run_id uuid,
  p_expected_ledger_generation bigint,
  p_response_received_at timestamptz,
  p_occurrence text,
  p_first_observed_at_us text,
  p_observation_digest text,
  p_raw_body_base64 text,
  p_raw_body_digest text,
  p_page_observation_digest text,
  p_transition_mac_override text default null,
  p_raw_event_digest_override text default null,
  p_next_checkpoint_override jsonb default null,
  p_request_authorization_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_checkpoint jsonb;
  v_event jsonb;
  v_events jsonb;
  v_page_metadata jsonb;
  v_request_query jsonb := '{"symbol":"BTC_USDT","start_time":"1759708800000","end_time":"1759968000000","page_num":"1","page_size":"20"}'::jsonb;
  v_request_started_at timestamptz := p_response_received_at;
  v_transition_payload jsonb;
  v_transition_mac text;
  v_integrity_key bytea;
begin
  select next_checkpoint into v_next_checkpoint from pg_temp.fixture_checkpoint;
  if p_next_checkpoint_override is not null then
    v_next_checkpoint := p_next_checkpoint_override;
  end if;
  v_event := $json${"accountIdentityDigest":"854f380b62cd55dd1edae274af280e93357e860da38e4078f6dad303e86d22fd","digestAlgorithm":"sha256","digestContractVersion":"equora-tcj-v1","endpointId":"historical_orders_v1","eventIndex":0,"eventType":"order","externalEventId":"123","firstObservedAtUs":"1759968000000000","identityStatus":"stable_provider_id","membershipKey":"4:mexc|11:hmac-sha256|13:equora-tcj-v1|26:broker_account_identity_v1|2:v1|64:854f380b62cd55dd1edae274af280e93357e860da38e4078f6dad303e86d22fd|5:order|3:123|21:payload_hash_fallback|64:d5086fb6f6a9e8e9ab86e0e853ce92ae1d47ea3a6b3cafb33e4c966ddf8b0c40","observationDigest":"afa896aa7449842f8c23b8d41d458b364dcca0c113077d7133da4689a397ba10","observedAtUs":"1759968000000000","occurrence":"first_observation","pageObservationDigest":"a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59","providerCode":"mexc","providerContractVersion":"mexc_futures_contract_v1","providerOccurredAtUs":"1759924800000000","providerRevision":null,"providerRevisionAuthority":"unverified","rawEventContentDigest":"d5086fb6f6a9e8e9ab86e0e853ce92ae1d47ea3a6b3cafb33e4c966ddf8b0c40","rawPayloadJson":"{\"category\":1,\"createTime\":1759924800000,\"dealAvgPrice\":\"100.1250\",\"dealVol\":\"2.5000\",\"feeCurrency\":\"USDT\",\"makerFee\":\"0\",\"orderId\":\"123\",\"orderType\":1,\"positionId\":\"456\",\"positionMode\":1,\"price\":\"100.1250\",\"profit\":\"1.5000\",\"side\":1,\"state\":3,\"symbol\":\"BTC_USDT\",\"takerFee\":\"-0.0100\",\"updateTime\":1759924801000,\"vol\":\"2.5000\"}","revisionDiscriminator":"payload_hash_fallback","revisionDiscriminatorValue":"d5086fb6f6a9e8e9ab86e0e853ce92ae1d47ea3a6b3cafb33e4c966ddf8b0c40"}$json$::jsonb;
  v_event := jsonb_set(v_event, '{occurrence}', to_jsonb(p_occurrence));
  v_event := jsonb_set(v_event, '{firstObservedAtUs}', to_jsonb(p_first_observed_at_us));
  v_event := jsonb_set(v_event, '{observedAtUs}', to_jsonb((extract(epoch from p_response_received_at) * 1000000)::bigint::text));
  v_event := jsonb_set(v_event, '{observationDigest}', to_jsonb(p_observation_digest));
  v_event := jsonb_set(v_event, '{pageObservationDigest}', to_jsonb(p_page_observation_digest));
  if p_raw_event_digest_override is not null then
    v_event := jsonb_set(v_event, '{rawEventContentDigest}', to_jsonb(p_raw_event_digest_override));
  end if;
  v_events := jsonb_build_array(v_event);
  v_page_metadata := $json${"requestPageNumber":1,"requestScope":{"symbol":"BTC_USDT","startTimeMs":1759708800000,"endTimeMs":1759968000000,"pageSize":20,"positionType":null},"terminalEvidence":"short_bare_array","providerPage":null,"cursor":{"providerTimeMs":1759924800000,"providerId":"123"},"orderedRawEventContentDigests":[{"digestAlgorithm":"sha256","digestContractVersion":"equora-tcj-v1","domain":"raw_event_content","digest":"d5086fb6f6a9e8e9ab86e0e853ce92ae1d47ea3a6b3cafb33e4c966ddf8b0c40"}],"authorityBlocked":true}$json$::jsonb;

  select key_material into strict v_integrity_key
  from equora_private.broker_capture_integrity_keys
  where id = '13000000-0000-4000-8000-000000000001';
  v_transition_payload := jsonb_build_object(
    'p_work_unit_id', p_work_unit_id::text,
    'p_expected_run_id', p_expected_run_id::text,
    'p_expected_broker_account_id', '14c6b264-99b8-4c74-a882-135b88e9d100',
    'p_expected_connection_account_id', 'b34b98ae-a682-44de-a1bc-21ca75888d45',
    'p_expected_sync_activation_id', 'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
    'p_expected_activation_generation', 1,
    'p_expected_scope_digest', 'f7006f0e92a876de3866e7554c8add59d206b83c554e8325dc1612a852db69b1',
    'p_transition_mac_version', 'equora-broker-capture-transition-hmac-sha256-v1',
    'p_transition_integrity_key_version', 'test_v1',
    'p_lease_token', '2c80af13-0e7c-4958-aa8e-40b306691fd9',
    'p_expected_work_unit_row_version', 7,
    'p_expected_checkpoint_mac', '160125df2a0a32533e0847d0f3586d24ffca6f139f2767e3fe712f1f16ae04c0',
    'p_expected_ledger_generation', p_expected_ledger_generation,
    'p_request_result_id', p_request_result_id::text,
    'p_request_sequence', 1,
    'p_method', 'GET',
    'p_request_origin', 'https://api.mexc.com',
    'p_request_path', '/api/v1/private/order/list/history_orders',
    'p_request_query', v_request_query,
    'p_transport_contract_version', 'mexc-readonly-transport-v1',
    'p_request_started_at', to_char(v_request_started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'p_response_received_at', to_char(p_response_received_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'p_request_duration_ms', 1,
    'p_http_status', 200,
    'p_provider_status_class', 'success',
    'p_response_classification', 'valid_read_preview_only',
    'p_raw_body_base64', p_raw_body_base64,
    'p_raw_body_digest', p_raw_body_digest,
    'p_raw_body_bytes', 362,
    'p_page_observation_digest', p_page_observation_digest,
    'p_page_metadata', v_page_metadata,
    'p_scope_completeness', 'unverified',
    'p_next_checkpoint', v_next_checkpoint,
    'p_next_checkpoint_mac', 'cc47566304ceb8dc0e662e906ecd1912f1ebed3517e2e7a92d629eec158b90ea',
    'p_next_checkpoint_status', 'terminal_observed',
    'p_next_checkpoint_reason', 'terminal_short_bare_array',
    'p_next_page_number', 2,
    'p_events', v_events
  );
  v_transition_mac := public.equora_capture_transition_mac_v1(
    v_transition_payload,
    v_integrity_key
  );
  if p_work_unit_id = '670d4b00-c275-48f1-aa02-9712c6ce1190'
    and p_request_result_id = '307e7468-8c64-4a94-ac00-897dbae4bb17'
    and p_expected_run_id = 'acba2551-2100-480b-a6fc-3ccd14c65be5'
    and p_expected_ledger_generation = 0
    and p_response_received_at = '2025-10-09T00:00:00.000000Z'
    and p_occurrence = 'first_observation'
    and p_transition_mac_override is null
    and p_raw_event_digest_override is null
    and v_transition_mac is distinct from '649a5134e60d5543d8e46737ae627850170431acccb925d430904295f17d0dee'
  then
    raise exception 'TEST_CROSS_RUNTIME_TRANSITION_HMAC_GOLDEN_VECTOR_DRIFT';
  end if;

  if p_request_authorization_id is null then
    return public.equora_commit_broker_capture_page_v1(
      p_work_unit_id => p_work_unit_id,
      p_expected_run_id => p_expected_run_id,
      p_expected_broker_account_id => '14c6b264-99b8-4c74-a882-135b88e9d100',
      p_expected_connection_account_id => 'b34b98ae-a682-44de-a1bc-21ca75888d45',
      p_expected_sync_activation_id => 'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
      p_expected_activation_generation => 1,
      p_expected_scope_digest => 'f7006f0e92a876de3866e7554c8add59d206b83c554e8325dc1612a852db69b1',
      p_transition_mac_version => 'equora-broker-capture-transition-hmac-sha256-v1',
      p_transition_integrity_key_version => 'test_v1',
      p_transition_mac => coalesce(p_transition_mac_override, v_transition_mac),
      p_lease_token => '2c80af13-0e7c-4958-aa8e-40b306691fd9',
      p_expected_work_unit_row_version => 7,
      p_expected_checkpoint_mac => '160125df2a0a32533e0847d0f3586d24ffca6f139f2767e3fe712f1f16ae04c0',
      p_expected_ledger_generation => p_expected_ledger_generation,
      p_request_result_id => p_request_result_id,
      p_request_sequence => 1,
      p_method => 'GET',
      p_request_origin => 'https://api.mexc.com',
      p_request_path => '/api/v1/private/order/list/history_orders',
      p_request_query => v_request_query,
      p_transport_contract_version => 'mexc-readonly-transport-v1',
      p_request_started_at => v_request_started_at,
      p_response_received_at => p_response_received_at,
      p_request_duration_ms => 1,
      p_http_status => 200,
      p_provider_status_class => 'success',
      p_response_classification => 'valid_read_preview_only',
      p_raw_body_base64 => p_raw_body_base64,
      p_raw_body_digest => p_raw_body_digest,
      p_raw_body_bytes => 362,
      p_page_observation_digest => p_page_observation_digest,
      p_page_metadata => v_page_metadata,
      p_scope_completeness => 'unverified',
      p_next_checkpoint => v_next_checkpoint,
      p_next_checkpoint_mac => 'cc47566304ceb8dc0e662e906ecd1912f1ebed3517e2e7a92d629eec158b90ea',
      p_next_checkpoint_status => 'terminal_observed',
      p_next_checkpoint_reason => 'terminal_short_bare_array',
      p_next_page_number => 2,
      p_events => v_events
    );
  end if;

  return public.equora_commit_broker_capture_page_v2(
    p_request_authorization_id => p_request_authorization_id,
    p_work_unit_id => p_work_unit_id,
    p_expected_run_id => p_expected_run_id,
    p_expected_broker_account_id => '14c6b264-99b8-4c74-a882-135b88e9d100',
    p_expected_connection_account_id => 'b34b98ae-a682-44de-a1bc-21ca75888d45',
    p_expected_sync_activation_id => 'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
    p_expected_activation_generation => 1,
    p_expected_scope_digest => 'f7006f0e92a876de3866e7554c8add59d206b83c554e8325dc1612a852db69b1',
    p_transition_mac_version => 'equora-broker-capture-transition-hmac-sha256-v1',
    p_transition_integrity_key_version => 'test_v1',
    p_transition_mac => coalesce(p_transition_mac_override, v_transition_mac),
    p_lease_token => '2c80af13-0e7c-4958-aa8e-40b306691fd9',
    p_expected_work_unit_row_version => 7,
    p_expected_checkpoint_mac => '160125df2a0a32533e0847d0f3586d24ffca6f139f2767e3fe712f1f16ae04c0',
    p_expected_ledger_generation => p_expected_ledger_generation,
    p_request_result_id => p_request_result_id,
    p_request_sequence => 1,
    p_method => 'GET',
    p_request_origin => 'https://api.mexc.com',
    p_request_path => '/api/v1/private/order/list/history_orders',
    p_request_query => v_request_query,
    p_transport_contract_version => 'mexc-readonly-transport-v1',
    p_request_started_at => v_request_started_at,
    p_response_received_at => p_response_received_at,
    p_request_duration_ms => 1,
    p_http_status => 200,
    p_provider_status_class => 'success',
    p_response_classification => 'valid_read_preview_only',
    p_raw_body_base64 => p_raw_body_base64,
    p_raw_body_digest => p_raw_body_digest,
    p_raw_body_bytes => 362,
    p_page_observation_digest => p_page_observation_digest,
    p_page_metadata => v_page_metadata,
    p_scope_completeness => 'unverified',
    p_next_checkpoint => v_next_checkpoint,
    p_next_checkpoint_mac => 'cc47566304ceb8dc0e662e906ecd1912f1ebed3517e2e7a92d629eec158b90ea',
    p_next_checkpoint_status => 'terminal_observed',
    p_next_checkpoint_reason => 'terminal_short_bare_array',
    p_next_page_number => 2,
    p_events => v_events
  );
end;
$$;

grant execute on function pg_temp.commit_fixture_page(uuid, uuid, uuid, bigint, timestamptz, text, text, text, text, text, text, text, text, jsonb, uuid) to service_role;

-- Legacy persistence regression tests continue to exercise the frozen v1
-- transition body through an owner-only fixture adapter. Runtime authority is
-- tested separately through the v2 permit fence; service_role never regains
-- direct EXECUTE on the v1 function.
create or replace function pg_temp.record_fixture_failure(
  p_work_unit_id uuid,
  p_expected_work_unit_row_version bigint,
  p_outcome_id uuid,
  p_lease_token uuid,
  p_request_sequence integer,
  p_expected_checkpoint_mac text,
  p_expected_capability_id text,
  p_expected_page_scope_digest text,
  p_failure_code text,
  p_http_status integer,
  p_response_bytes integer,
  p_request_duration_ms integer,
  p_failure_policy_version text
) returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.equora_record_broker_capture_failure_v1(
    p_work_unit_id,
    p_expected_work_unit_row_version,
    p_outcome_id,
    p_lease_token,
    p_request_sequence,
    p_expected_checkpoint_mac,
    p_expected_capability_id,
    p_expected_page_scope_digest,
    p_failure_code,
    p_http_status,
    p_response_bytes,
    p_request_duration_ms,
    p_failure_policy_version
  )
$$;

grant execute on function pg_temp.record_fixture_failure(
  uuid, bigint, uuid, uuid, integer, text, text, text, text,
  integer, integer, integer, text
) to service_role;

create or replace function pg_temp.expect_fixture_failure(
  p_expected_error text,
  p_next_checkpoint_override jsonb default null
) returns void
language plpgsql
set search_path = ''
as $$
begin
  begin
    perform pg_temp.commit_fixture_page(
      '670d4b00-c275-48f1-aa02-9712c6ce1190',
      '1f7e7468-8c64-4a94-ac00-897dbae4bb17',
      'acba2551-2100-480b-a6fc-3ccd14c65be5',
      0,
      '2025-10-09T00:00:00.000000Z',
      'first_observation',
      '1759968000000000',
      'afa896aa7449842f8c23b8d41d458b364dcca0c113077d7133da4689a397ba10',
      'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0=',
      '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a',
      'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59',
      null,
      null,
      p_next_checkpoint_override
    );
    raise exception 'TEST_EXPECTED_FAILURE_WAS_ACCEPTED';
  exception when others then
    if position(p_expected_error in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

grant execute on function pg_temp.expect_fixture_failure(text, jsonb) to service_role;

create or replace function pg_temp.expect_control_claim_failure(
  p_expected_error text
) returns void
language plpgsql
set search_path = ''
as $$
begin
  begin
    perform public.equora_claim_broker_capture_work_unit_v2(
      '870d4b00-c275-48f1-aa02-9712c6ce1190',
      0,
      '84000000-0000-4000-8000-000000000001',
      '94000000-0000-4000-8000-000000000001',
      'broker-capture-claim-v1'
    );
    raise exception 'TEST_EXPECTED_CONTROL_CLAIM_FAILURE_WAS_ACCEPTED';
  exception when others then
    if position(p_expected_error in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

grant execute on function pg_temp.expect_control_claim_failure(text) to service_role;

-- EQUORA_CONCURRENCY_SETUP_END

update public.broker_capture_work_units
set checkpoint = jsonb_set(checkpoint, '{totalRequestAttempts}', '1'::jsonb)
where id = '870d4b00-c275-48f1-aa02-9712c6ce1190';
set local role service_role;
select pg_temp.expect_control_claim_failure('CONTROL_CHECKPOINT_INVALID');
reset role;
update public.broker_capture_work_units as work_unit
set checkpoint = fixture.current_checkpoint,
    checkpoint_mac = fixture.checkpoint_mac
from fixture_control_checkpoint as fixture
where work_unit.id = '870d4b00-c275-48f1-aa02-9712c6ce1190';

do $$
declare
  v_checkpoint jsonb;
  v_checkpoint_mac text;
begin
  select jsonb_set(current_checkpoint, '{totalRawEvents}', '1'::jsonb)
  into v_checkpoint
  from fixture_control_checkpoint;
  v_checkpoint_mac := public.equora_mexc_checkpoint_mac_v1(
    v_checkpoint,
    convert_to('0123456789abcdef0123456789abcdef', 'UTF8')
  );
  v_checkpoint := jsonb_set(v_checkpoint, '{checkpointMac}', to_jsonb(v_checkpoint_mac));
  update public.broker_capture_work_units
  set checkpoint = v_checkpoint,
      checkpoint_mac = v_checkpoint_mac
  where id = '870d4b00-c275-48f1-aa02-9712c6ce1190';
end;
$$;
set local role service_role;
select pg_temp.expect_control_claim_failure('CONTROL_CHECKPOINT_INVALID');
reset role;
update public.broker_capture_work_units as work_unit
set checkpoint = fixture.current_checkpoint,
    checkpoint_mac = fixture.checkpoint_mac
from fixture_control_checkpoint as fixture
where work_unit.id = '870d4b00-c275-48f1-aa02-9712c6ce1190';

do $$
declare
  v_checkpoint jsonb;
  v_checkpoint_mac text;
begin
  select jsonb_set(current_checkpoint, '{checkpointVersion}', '"mexc-page-checkpoint-v2"'::jsonb)
  into v_checkpoint
  from fixture_control_checkpoint;
  v_checkpoint_mac := public.equora_mexc_checkpoint_mac_v1(
    v_checkpoint,
    convert_to('0123456789abcdef0123456789abcdef', 'UTF8')
  );
  v_checkpoint := jsonb_set(v_checkpoint, '{checkpointMac}', to_jsonb(v_checkpoint_mac));
  update public.broker_capture_work_units
  set checkpoint = v_checkpoint,
      checkpoint_mac = v_checkpoint_mac
  where id = '870d4b00-c275-48f1-aa02-9712c6ce1190';
end;
$$;
set local role service_role;
select pg_temp.expect_control_claim_failure('CONTROL_CHECKPOINT_INVALID');
reset role;
do $$
begin
  if not exists (
    select 1 from public.broker_capture_work_units
    where id = '870d4b00-c275-48f1-aa02-9712c6ce1190'
      and status = 'pending'
      and row_version = 0
      and claim_count = 0
      and last_claim_request_id is null
  ) then
    raise exception 'TEST_HMAC_VALID_NONCANONICAL_CHECKPOINT_MUTATED_CLAIM_STATE';
  end if;
end;
$$;
update public.broker_capture_work_units as work_unit
set checkpoint = fixture.current_checkpoint,
    checkpoint_mac = fixture.checkpoint_mac
from fixture_control_checkpoint as fixture
where work_unit.id = '870d4b00-c275-48f1-aa02-9712c6ce1190';

do $$
declare
  v_checkpoint jsonb;
  v_checkpoint_mac text;
begin
  select jsonb_set(current_checkpoint, '{scope,pageSize}', '101'::jsonb)
  into v_checkpoint
  from fixture_control_checkpoint;
  v_checkpoint_mac := public.equora_mexc_checkpoint_mac_v1(
    v_checkpoint,
    convert_to('0123456789abcdef0123456789abcdef', 'UTF8')
  );
  v_checkpoint := jsonb_set(v_checkpoint, '{checkpointMac}', to_jsonb(v_checkpoint_mac));
  update public.broker_capture_work_units
  set checkpoint = v_checkpoint,
      checkpoint_mac = v_checkpoint_mac
  where id = '870d4b00-c275-48f1-aa02-9712c6ce1190';
end;
$$;
set local role service_role;
select pg_temp.expect_control_claim_failure('CONTROL_CHECKPOINT_INVALID');
reset role;
update public.broker_capture_work_units as work_unit
set checkpoint = fixture.current_checkpoint,
    checkpoint_mac = fixture.checkpoint_mac
from fixture_control_checkpoint as fixture
where work_unit.id = '870d4b00-c275-48f1-aa02-9712c6ce1190';

do $$
declare
  v_checkpoint jsonb;
  v_page_scope_digest text;
  v_checkpoint_mac text;
begin
  update public.broker_sync_scopes
  set capability_id = 'historical_positions_v1',
      endpoint_id = 'historical_positions_v1',
      position_type = null
  where id = '28000000-0000-4000-8000-000000000001';

  select jsonb_set(
    jsonb_set(
      current_checkpoint,
      '{capabilityId}',
      '"historical_positions_v1"'::jsonb
    ),
    '{scope}',
    (current_checkpoint -> 'scope') || '{"positionType":null}'::jsonb
  )
  into v_checkpoint
  from fixture_control_checkpoint;
  v_page_scope_digest := public.equora_mexc_page_scope_digest_v1(
    'historical_positions_v1',
    'BTC_USDT',
    1759708800000,
    1759968000000,
    1,
    20,
    null,
    'mexc-history-page-budget-v1',
    'aba71711421cebbff9f7ab4f8c761865aac36dffc91adc3d7468b6e632ab56aa'
  );
  v_checkpoint := jsonb_set(v_checkpoint, '{scopeDigest}', to_jsonb(v_page_scope_digest));
  v_checkpoint_mac := public.equora_mexc_checkpoint_mac_v1(
    v_checkpoint,
    convert_to('0123456789abcdef0123456789abcdef', 'UTF8')
  );
  v_checkpoint := jsonb_set(v_checkpoint, '{checkpointMac}', to_jsonb(v_checkpoint_mac));
  update public.broker_capture_work_units
  set checkpoint = v_checkpoint,
      checkpoint_mac = v_checkpoint_mac
  where id = '870d4b00-c275-48f1-aa02-9712c6ce1190';
end;
$$;
set local role service_role;
select pg_temp.expect_control_claim_failure('CONTROL_CHECKPOINT_INVALID');
reset role;
update public.broker_sync_scopes
set capability_id = 'historical_orders_v1',
    endpoint_id = 'historical_orders_v1',
    position_type = null
where id = '28000000-0000-4000-8000-000000000001';
update public.broker_capture_work_units as work_unit
set checkpoint = fixture.current_checkpoint,
    checkpoint_mac = fixture.checkpoint_mac
from fixture_control_checkpoint as fixture
where work_unit.id = '870d4b00-c275-48f1-aa02-9712c6ce1190';

update public.broker_sync_activations
set activation_state = 'paused'
where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';
set local role service_role;
select pg_temp.expect_fixture_failure('CAPTURE_ACTIVATION_INACTIVE');
select pg_temp.expect_control_claim_failure('CONTROL_ACTIVATION_NOT_CURRENT');
reset role;
update public.broker_sync_activations
set activation_state = 'active'
where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';

update public.broker_sync_activations
set permission_evidence = '{}'::jsonb
where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';
set local role service_role;
select pg_temp.expect_control_claim_failure('CONTROL_PERMISSION_EVIDENCE_INVALID');
reset role;
update public.broker_sync_activations
set permission_evidence = '{"mappingEvidence":"official_docs_plus_support_statement_2026-08-05","requiredCapabilities":["funding_records_v1","historical_executions_v3","historical_orders_v1","historical_positions_v1"],"technicallyDetectedWritePermissions":[],"userAttestation":"read_only_user_attested","writePermissionIntrospection":"unavailable"}'::jsonb
where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';

update public.broker_sync_activations
set capability_versions = jsonb_set(
  capability_versions,
  '{historical_orders_v1}',
  'null'::jsonb
)
where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';
set local role service_role;
select pg_temp.expect_control_claim_failure('CONTROL_PERMISSION_EVIDENCE_INVALID');
reset role;
update public.broker_sync_activations
set capability_versions = '{"funding_records_v1":"v1","historical_executions_v3":"v1","historical_orders_v1":"v1","historical_positions_v1":"v1"}'::jsonb
where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';

update public.broker_connections
set status = 'paused'
where id = '12000000-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.expect_fixture_failure('CAPTURE_CONNECTION_INACTIVE');
select pg_temp.expect_control_claim_failure('CONTROL_CONNECTION_INACTIVE');
reset role;
update public.broker_connections
set status = 'ready'
where id = '12000000-0000-4000-8000-000000000001';

update public.broker_credentials
set encrypted_payload = ''
where id = '11000000-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.expect_fixture_failure('CAPTURE_CREDENTIAL_INACTIVE');
select pg_temp.expect_control_claim_failure('CONTROL_CREDENTIAL_INACTIVE');
reset role;
update public.broker_credentials
set encrypted_payload = 'synthetic-ciphertext-not-a-secret'
where id = '11000000-0000-4000-8000-000000000001';

update equora_private.broker_capture_integrity_keys
set status = 'revoked'
where id = '13000000-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.expect_fixture_failure('CAPTURE_INTEGRITY_KEY_INVALID');
select pg_temp.expect_control_claim_failure('CONTROL_INTEGRITY_KEY_INACTIVE');
reset role;
update equora_private.broker_capture_integrity_keys
set status = 'active'
where id = '13000000-0000-4000-8000-000000000001';

update public.broker_providers
set status = 'suspended'
where provider_code = 'mexc';
set local role service_role;
select pg_temp.expect_fixture_failure('CAPTURE_PROVIDER_BLOCKED');
select pg_temp.expect_control_claim_failure('CONTROL_PROVIDER_BLOCKED');
reset role;
update public.broker_providers
set status = 'verified'
where provider_code = 'mexc';

do $$
begin
  begin
    update public.broker_providers
    set readonly_capabilities = readonly_capabilities - 'historical_orders_v1'
    where provider_code = 'mexc';
    raise exception 'TEST_MEXC_PROVIDER_MISSING_CAPABILITY_WAS_ACCEPTED';
  exception when check_violation then
    null;
  end;

  begin
    update public.broker_providers
    set readonly_capabilities = jsonb_set(
      readonly_capabilities,
      '{historical_orders_v1}',
      (readonly_capabilities -> 'historical_orders_v1') - 'method'
    )
    where provider_code = 'mexc';
    raise exception 'TEST_MEXC_PROVIDER_MISSING_METHOD_WAS_ACCEPTED';
  exception when check_violation then
    null;
  end;
end;
$$;

update public.broker_capture_work_units
set lease_expires_at = now() - interval '1 second'
where id = '670d4b00-c275-48f1-aa02-9712c6ce1190';
set local role service_role;
select pg_temp.expect_fixture_failure('CAPTURE_LEASE_INVALID');
reset role;
update public.broker_capture_work_units
set lease_expires_at = now() + interval '1 hour'
where id = '670d4b00-c275-48f1-aa02-9712c6ce1190';

set local role service_role;

do $$
begin
  perform pg_temp.expect_fixture_failure(
    'CAPTURE_CHECKPOINT_MAC_MISMATCH',
    jsonb_set(
      (select next_checkpoint from pg_temp.fixture_checkpoint),
      '{status}',
      '"continue"'::jsonb
    )
  );

  begin
    perform pg_temp.commit_fixture_page(
      '670d4b00-c275-48f1-aa02-9712c6ce1190',
      '207e7468-8c64-4a94-ac00-897dbae4bb10',
      'acba2551-2100-480b-a6fc-3ccd14c65be5',
      0,
      '2025-10-09T00:00:00.000000Z',
      'first_observation',
      '1759968000000000',
      'afa896aa7449842f8c23b8d41d458b364dcca0c113077d7133da4689a397ba10',
      'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0=',
      '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a',
      'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59',
      repeat('0', 64)
    );
    raise exception 'TEST_DIRECT_SERVICE_ROLE_TRANSITION_MAC_BYPASS';
  exception when others then
    if sqlerrm not like '%CAPTURE_TRANSITION_MAC_MISMATCH%' then raise; end if;
  end;

  begin
    perform pg_temp.commit_fixture_page(
      '670d4b00-c275-48f1-aa02-9712c6ce1190',
      '207e7468-8c64-4a94-ac00-897dbae4bb11',
      'acba2551-2100-480b-a6fc-3ccd14c65be5',
      0,
      '2025-10-09T00:00:00.000000Z',
      'first_observation',
      '1759968000000000',
      'afa896aa7449842f8c23b8d41d458b364dcca0c113077d7133da4689a397ba10',
      'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0=',
      '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a',
      'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59',
      null,
      repeat('3', 64)
    );
    raise exception 'TEST_WRONG_RAW_EVENT_DIGEST_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CAPTURE_EVENT_CONTRACT_MISMATCH%' then raise; end if;
  end;

  begin
    perform pg_temp.commit_fixture_page(
      '670d4b00-c275-48f1-aa02-9712c6ce1190',
      '207e7468-8c64-4a94-ac00-897dbae4bb12',
      'acba2551-2100-480b-a6fc-3ccd14c65be5',
      0,
      '2025-10-09T00:00:00.000000Z',
      'first_observation',
      '1759968000000000',
      'afa896aa7449842f8c23b8d41d458b364dcca0c113077d7133da4689a397ba10',
      'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0=',
      '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a',
      repeat('2', 64)
    );
    raise exception 'TEST_WRONG_PAGE_DIGEST_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CAPTURE_PAGE_DIGEST_MISMATCH%' then raise; end if;
  end;

  begin
    perform pg_temp.commit_fixture_page(
      '670d4b00-c275-48f1-aa02-9712c6ce1190',
      '207e7468-8c64-4a94-ac00-897dbae4bb17',
      'bcba2551-2100-480b-a6fc-3ccd14c65be5',
      0,
      '2025-10-09T00:00:00.000000Z',
      'first_observation',
      '1759968000000000',
      'afa896aa7449842f8c23b8d41d458b364dcca0c113077d7133da4689a397ba10',
      'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0=',
      '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a',
      'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59'
    );
    raise exception 'TEST_CROSS_RUN_BINDING_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CAPTURE_PURPOSE_BINDING_MISMATCH%' then raise; end if;
  end;

  begin
    perform pg_temp.commit_fixture_page(
      '670d4b00-c275-48f1-aa02-9712c6ce1190',
      '207e7468-8c64-4a94-ac00-897dbae4bb18',
      'acba2551-2100-480b-a6fc-3ccd14c65be5',
      0,
      '2025-10-09T00:00:00.000000Z',
      'first_observation',
      '1759968000000000',
      'afa896aa7449842f8c23b8d41d458b364dcca0c113077d7133da4689a397ba10',
      'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiOTk5In1dfQ==',
      '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a',
      'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59'
    );
    raise exception 'TEST_BODY_SUBSTITUTION_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CAPTURE_RAW_BODY_%' then raise; end if;
  end;

  begin
    perform pg_temp.commit_fixture_page(
      '670d4b00-c275-48f1-aa02-9712c6ce1190',
      '207e7468-8c64-4a94-ac00-897dbae4bb19',
      'acba2551-2100-480b-a6fc-3ccd14c65be5',
      0,
      '2025-10-09T00:00:00.000000Z',
      'first_observation',
      '1759968000000000',
      repeat('1', 64),
      'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0=',
      '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a',
      'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59'
    );
    raise exception 'TEST_MID_COMMIT_DIGEST_FAILURE_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CAPTURE_OBSERVATION_DIGEST_MISMATCH%' then raise; end if;
  end;
end;
$$;

do $$
declare
  v_result jsonb;
begin
  v_result := pg_temp.commit_fixture_page(
    '670d4b00-c275-48f1-aa02-9712c6ce1190',
    '307e7468-8c64-4a94-ac00-897dbae4bb17',
    'acba2551-2100-480b-a6fc-3ccd14c65be5',
    0,
    '2025-10-09T00:00:00.000000Z',
    'first_observation',
    '1759968000000000',
    'afa896aa7449842f8c23b8d41d458b364dcca0c113077d7133da4689a397ba10',
    'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0=',
    '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a',
    'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59'
  );
  if v_result <> '{"status":"page_committed","requestResultId":"307e7468-8c64-4a94-ac00-897dbae4bb17","workUnitRowVersion":8,"ledgerGeneration":1,"insertedRawEvents":1,"repeatedObservations":0,"observations":1,"scopeCompleteness":"unverified","authorityBlocked":true}'::jsonb then
    raise exception 'TEST_UNEXPECTED_FIRST_COMMIT_RESULT: %', v_result;
  end if;
end;
$$;

do $$
declare
  v_observation_digest text;
  v_result jsonb;
begin
  select repeat_observation_digest into v_observation_digest from pg_temp.fixture_checkpoint;
  v_result := pg_temp.commit_fixture_page(
    '770d4b00-c275-48f1-aa02-9712c6ce1190',
    '407e7468-8c64-4a94-ac00-897dbae4bb17',
    'acba2551-2100-480b-a6fc-3ccd14c65be5',
    1,
    '2025-10-09T00:00:01.000000Z',
    'repeated_observation',
    '1759968000000000',
    v_observation_digest,
    'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0=',
    '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a',
    'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59'
  );
  if v_result ->> 'insertedRawEvents' <> '0' or v_result ->> 'repeatedObservations' <> '1' then
    raise exception 'TEST_UNEXPECTED_REPEAT_RESULT: %', v_result;
  end if;
end;
$$;

do $$
begin
  begin
    perform pg_temp.commit_fixture_page(
      '670d4b00-c275-48f1-aa02-9712c6ce1190',
      '507e7468-8c64-4a94-ac00-897dbae4bb17',
      'acba2551-2100-480b-a6fc-3ccd14c65be5',
      2,
      '2025-10-09T00:00:02.000000Z',
      'repeated_observation',
      '1759968000000000',
      repeat('1', 64),
      'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0=',
      '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a',
      'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59'
    );
    raise exception 'TEST_TERMINAL_REPLAY_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CAPTURE_LEASE_INVALID%' then raise; end if;
  end;
end;
$$;

do $$
declare
  v_claim jsonb;
  v_claim_replay jsonb;
  v_failure jsonb;
  v_failure_replay jsonb;
begin
  v_claim := public.equora_claim_broker_capture_work_unit_v2(
    '870d4b00-c275-48f1-aa02-9712c6ce1190',
    0,
    '81000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'broker-capture-claim-v1'
  );
  if v_claim ->> 'status' <> 'claimed'
    or v_claim ->> 'workUnitRowVersion' <> '1'
    or v_claim ->> 'attempt' <> '1'
    or v_claim ->> 'requestSequence' <> '1'
    or v_claim ->> 'claimPolicyVersion' <> 'broker-capture-claim-v1'
    or v_claim ->> 'scopeDigest' <> repeat('b', 64)
    or v_claim ->> 'pageScopeDigest' <> '20312b1ad761af60427439f96991429d4b508fb871815ad850a64e0a9e2f947d'
    or v_claim -> 'checkpoint' ->> 'scopeDigest' <> v_claim ->> 'pageScopeDigest'
    or v_claim ->> 'authorityBlocked' <> 'true'
    or v_claim ?| array[
      'apiKey', 'secretKey', 'encryptedPayload', 'integrityKey', 'leaseToken'
    ]
    or (v_claim -> 'credentialReference' ->> 'id')
      <> '11000000-0000-4000-8000-000000000001'
    or (v_claim -> 'integrityKeyReference' ->> 'id')
      <> '13000000-0000-4000-8000-000000000001'
  then
    raise exception 'TEST_CONTROL_CLAIM_RESULT_INVALID: %', v_claim;
  end if;

  v_claim_replay := public.equora_claim_broker_capture_work_unit_v2(
    '870d4b00-c275-48f1-aa02-9712c6ce1190',
    0,
    '81000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'broker-capture-claim-v1'
  );
  if v_claim_replay is distinct from v_claim then
    raise exception 'TEST_CONTROL_CLAIM_REPLAY_CHANGED: %, %', v_claim, v_claim_replay;
  end if;

  begin
    perform public.equora_claim_broker_capture_work_unit_v2(
      '870d4b00-c275-48f1-aa02-9712c6ce1190',
      99,
      '81000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001',
      'broker-capture-claim-v1'
    );
    raise exception 'TEST_CONTROL_CLAIM_REPLAY_ROW_VERSION_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CONTROL_CLAIM_REPLAY_MISMATCH%' then raise; end if;
  end;

  begin
    perform public.equora_claim_broker_capture_work_unit_v2(
      '870d4b00-c275-48f1-aa02-9712c6ce1190',
      0,
      '81000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000099',
      'broker-capture-claim-v1'
    );
    raise exception 'TEST_CONTROL_CLAIM_REPLAY_MISMATCH_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CONTROL_CLAIM_REPLAY_MISMATCH%' then raise; end if;
  end;

  begin
    perform pg_temp.record_fixture_failure(
      '870d4b00-c275-48f1-aa02-9712c6ce1190', 1,
      '82000000-0000-4000-8000-000000000008',
      '91000000-0000-4000-8000-000000000001', 1,
      v_claim ->> 'checkpointMac', 'historical_executions_v3',
      v_claim ->> 'pageScopeDigest', 'rate_limited', 429, 128, 10,
      'broker-capture-failure-policy-v1'
    );
    raise exception 'TEST_CONTROL_FAILURE_CAPABILITY_PRECONDITION_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CONTROL_WORK_UNIT_CAS_MISMATCH%' then raise; end if;
  end;

  begin
    perform pg_temp.record_fixture_failure(
      '870d4b00-c275-48f1-aa02-9712c6ce1190', 1,
      '82000000-0000-4000-8000-000000000009',
      '91000000-0000-4000-8000-000000000001', 1,
      v_claim ->> 'checkpointMac', v_claim ->> 'capabilityId',
      repeat('f', 64), 'rate_limited', 429, 128, 10,
      'broker-capture-failure-policy-v1'
    );
    raise exception 'TEST_CONTROL_FAILURE_SCOPE_DIGEST_PRECONDITION_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CONTROL_WORK_UNIT_CAS_MISMATCH%' then raise; end if;
  end;

  -- The immediately following valid transition uses the unchanged row-version,
  -- sequence and checkpoint preconditions. Its success proves both rejected
  -- calls left Work Unit, Run and Scope unchanged; the owner-context postflight
  -- below additionally proves that neither rejected Outcome ID was inserted.

  v_failure := pg_temp.record_fixture_failure(
    '870d4b00-c275-48f1-aa02-9712c6ce1190',
    1,
    '82000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    1,
    v_claim ->> 'checkpointMac',
    v_claim ->> 'capabilityId',
    v_claim ->> 'pageScopeDigest',
    'rate_limited',
    429,
    128,
    10,
    'broker-capture-failure-policy-v1'
  );
  if v_failure ->> 'status' <> 'retry_pending'
    or v_failure ->> 'workUnitRowVersion' <> '2'
    or v_failure ->> 'attempt' <> '1'
    or v_failure ->> 'requestSequence' <> '1'
    or v_failure ->> 'failureCode' <> 'rate_limited'
    or v_failure ->> 'failureClass' <> 'provider'
    or v_failure ->> 'runStatus' <> 'running'
    or v_failure ->> 'authorityBlocked' <> 'true'
  then
    raise exception 'TEST_CONTROL_RETRY_RESULT_INVALID: %', v_failure;
  end if;

  v_failure_replay := pg_temp.record_fixture_failure(
    '870d4b00-c275-48f1-aa02-9712c6ce1190',
    1,
    '82000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    1,
    v_claim ->> 'checkpointMac',
    v_claim ->> 'capabilityId',
    v_claim ->> 'pageScopeDigest',
    'rate_limited',
    429,
    128,
    10,
    'broker-capture-failure-policy-v1'
  );
  if v_failure_replay is distinct from v_failure then
    raise exception 'TEST_CONTROL_FAILURE_REPLAY_CHANGED: %, %', v_failure, v_failure_replay;
  end if;

  begin
    perform pg_temp.record_fixture_failure(
      '870d4b00-c275-48f1-aa02-9712c6ce1190', 1,
      '82000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000001', 1,
      v_claim ->> 'checkpointMac', v_claim ->> 'capabilityId',
      repeat('f', 64), 'rate_limited', 429, 128, 10,
      'broker-capture-failure-policy-v1'
    );
    raise exception 'TEST_CONTROL_FAILURE_PRECONDITION_REPLAY_DRIFT_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CONTROL_FAILURE_REPLAY_MISMATCH%' then raise; end if;
  end;

  begin
    perform public.equora_claim_broker_capture_work_unit_v2(
      '870d4b00-c275-48f1-aa02-9712c6ce1190',
      2,
      '81000000-0000-4000-8000-000000000002',
      '91000000-0000-4000-8000-000000000002',
      'broker-capture-claim-v1'
    );
    raise exception 'TEST_CONTROL_EARLY_RETRY_WAS_ACCEPTED';
  exception when others then
    if sqlerrm not like '%CONTROL_RETRY_NOT_DUE%' then raise; end if;
  end;

  begin
    perform count(*) from public.broker_capture_attempt_outcomes;
    raise exception 'TEST_CONTROL_DIRECT_SERVICE_ROLE_SELECT_WAS_ACCEPTED';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select pg_sleep(1.1);

do $$
declare
  v_claim jsonb;
  v_terminal jsonb;
  v_terminal_replay jsonb;
begin
  v_claim := public.equora_claim_broker_capture_work_unit_v2(
    '870d4b00-c275-48f1-aa02-9712c6ce1190',
    2,
    '81000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    'broker-capture-claim-v1'
  );
  if v_claim ->> 'workUnitRowVersion' <> '3'
    or v_claim ->> 'attempt' <> '2'
    or v_claim ->> 'requestSequence' <> '2'
  then
    raise exception 'TEST_CONTROL_SECOND_CLAIM_INVALID: %', v_claim;
  end if;

  v_terminal := pg_temp.record_fixture_failure(
    '870d4b00-c275-48f1-aa02-9712c6ce1190',
    3,
    '82000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    2,
    v_claim ->> 'checkpointMac',
    v_claim ->> 'capabilityId',
    v_claim ->> 'pageScopeDigest',
    'invalid_credential',
    401,
    64,
    20,
    'broker-capture-failure-policy-v1'
  );
  if v_terminal ->> 'status' <> 'terminal_failed'
    or v_terminal ->> 'workUnitRowVersion' <> '4'
    or v_terminal ->> 'attempt' <> '2'
    or v_terminal ->> 'requestSequence' <> '2'
    or v_terminal ->> 'failureCode' <> 'invalid_credential'
    or v_terminal ->> 'failureClass' <> 'authority'
    or v_terminal ->> 'runStatus' <> 'failed'
    or v_terminal -> 'retryNotBefore' <> 'null'::jsonb
  then
    raise exception 'TEST_CONTROL_TERMINAL_RESULT_INVALID: %', v_terminal;
  end if;

  v_terminal_replay := pg_temp.record_fixture_failure(
    '870d4b00-c275-48f1-aa02-9712c6ce1190',
    3,
    '82000000-0000-4000-8000-000000000002',
    '91000000-0000-4000-8000-000000000002',
    2,
    v_claim ->> 'checkpointMac',
    v_claim ->> 'capabilityId',
    v_claim ->> 'pageScopeDigest',
    'invalid_credential',
    401,
    64,
    20,
    'broker-capture-failure-policy-v1'
  );
  if v_terminal_replay is distinct from v_terminal then
    raise exception 'TEST_CONTROL_TERMINAL_REPLAY_CHANGED: %, %', v_terminal, v_terminal_replay;
  end if;
end;
$$;

reset role;

do $$
declare
  v_terminal_failed_null_rejected boolean := false;
  v_partial_failed_null_rejected boolean := false;
begin
  begin
    update public.broker_capture_attempt_outcomes
    set terminal_reason = null
    where id = '82000000-0000-4000-8000-000000000002';
  exception
    when check_violation then
      v_terminal_failed_null_rejected := true;
  end;
  if not v_terminal_failed_null_rejected then
    raise exception 'TEST_CONTROL_TERMINAL_FAILED_NULL_REASON_WAS_ACCEPTED';
  end if;

  begin
    update public.broker_capture_attempt_outcomes
    set outcome_status = 'partial_failed',
        terminal_reason = null
    where id = '82000000-0000-4000-8000-000000000002';
  exception
    when check_violation then
      v_partial_failed_null_rejected := true;
  end;
  if not v_partial_failed_null_rejected then
    raise exception 'TEST_CONTROL_PARTIAL_FAILED_NULL_REASON_WAS_ACCEPTED';
  end if;

  if not exists (
    select 1
    from public.broker_capture_attempt_outcomes
    where id = '82000000-0000-4000-8000-000000000002'
      and outcome_status = 'terminal_failed'
      and terminal_reason = 'non_retryable_failure'
  ) then
    raise exception
      'TEST_CONTROL_OUTCOME_REASON_REJECTION_LEFT_PARTIAL_STATE';
  end if;
end;
$$;

do $$
declare
  v_table text;
  v_role text;
  v_privilege text;
begin
  if (select count(*) from public.broker_provider_request_results) <> 2
    or (select count(*) from public.broker_raw_responses) <> 2
    or (select count(*) from public.broker_capture_raw_events) <> 1
    or (select count(*) from public.broker_capture_event_observations) <> 2
    or (select ledger_generation from public.broker_accounts where id = '14c6b264-99b8-4c74-a882-135b88e9d100') <> 2
    or exists (select 1 from public.broker_raw_responses where raw_body is null or erasure_status <> 'retained')
    or exists (select 1 from public.broker_capture_raw_events where raw_payload is null or erasure_status <> 'retained')
    or (select count(*) from public.broker_capture_attempt_outcomes) <> 2
    or exists (
      select 1 from public.broker_capture_attempt_outcomes
      where id in (
        '82000000-0000-4000-8000-000000000008',
        '82000000-0000-4000-8000-000000000009'
      )
    )
    or exists (
      select 1
      from public.broker_capture_attempt_outcomes
      where outcome_status not in ('retry_pending', 'terminal_failed')
        or failure_code not in ('rate_limited', 'invalid_credential')
        or lease_token_digest !~ '^[a-f0-9]{64}$'
        or checkpoint_after ->> 'checkpointMac' is distinct from checkpoint_mac_after
    )
    or exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'broker_capture_attempt_outcomes'
        and column_name in (
          'raw_body', 'raw_payload', 'provider_message', 'api_key', 'secret_key',
          'encrypted_payload', 'lease_token'
        )
    )
    or not exists (
      select 1
      from public.broker_capture_work_units
      where id = '870d4b00-c275-48f1-aa02-9712c6ce1190'
        and status = 'partial_failed'
        and row_version = 4
        and attempt = 2
        and claim_count = 2
        and request_sequence = 2
        and lease_token_digest is null
        and lease_expires_at is null
        and retry_not_before is null
        and terminal_reason = 'non_retryable_failure'
    )
    or not exists (
      select 1
      from public.broker_capture_runs
      where id = 'bcba2551-2100-480b-a6fc-3ccd14c65be5'
        and status = 'failed'
        and failed_request_count = 2
        and completed_at is not null
    )
    or not exists (
      select 1
      from public.broker_sync_scopes
      where id = '28000000-0000-4000-8000-000000000001'
        and scope_completeness = 'failed'
        and stability_status = 'invalidated'
        and closed_at is not null
    )
  then
    raise exception 'TEST_ATOMIC_COUNTS_OR_RETENTION_FAILED';
  end if;

  begin
    insert into public.broker_connection_accounts (
      id, user_id, connection_id, broker_account_id, provider_code,
      environment, assignment_source, valid_from, status
    ) values (
      '2a000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002',
      '12000000-0000-4000-8000-000000000002',
      '14c6b264-99b8-4c74-a882-135b88e9d100',
      'mexc', 'live', 'connection_scoped', now(), 'active'
    );
    raise exception 'TEST_CROSS_TENANT_PARENT_WAS_ACCEPTED';
  exception when foreign_key_violation then
    null;
  end;

  foreach v_table in array array[
    'broker_accounts',
    'broker_account_identities',
    'broker_connection_accounts',
    'broker_sync_activation_series',
    'broker_sync_activations',
    'broker_sync_scopes',
    'broker_capture_runs',
    'broker_capture_work_units',
    'broker_capture_attempt_outcomes',
    'broker_provider_request_results',
    'broker_raw_responses',
    'broker_capture_raw_events',
    'broker_capture_event_observations'
  ] loop
    if not exists (
      select 1 from pg_class
      where oid = format('public.%I', v_table)::regclass
        and relrowsecurity = true
    ) then
      raise exception 'TEST_RLS_NOT_ENABLED: %', v_table;
    end if;
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      foreach v_privilege in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
        if has_table_privilege(v_role, format('public.%I', v_table), v_privilege) then
          raise exception 'TEST_DIRECT_TABLE_PRIVILEGE_PRESENT: %.% %', v_role, v_table, v_privilege;
        end if;
      end loop;
    end loop;
  end loop;

  if has_schema_privilege('service_role', 'equora_private', 'usage')
    or has_table_privilege('service_role', 'equora_private.broker_capture_integrity_keys', 'select')
    or has_function_privilege('service_role', 'public.equora_capture_transition_mac_v1(jsonb,bytea)', 'execute')
    or has_function_privilege('service_role', 'public.equora_mexc_checkpoint_mac_v1(jsonb,bytea)', 'execute')
    or has_function_privilege('authenticated', 'public.equora_commit_broker_capture_page_v1(uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)', 'execute')
    or has_function_privilege('service_role', 'public.equora_commit_broker_capture_page_v1(uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)', 'execute')
    or not has_function_privilege('service_role', 'public.equora_commit_broker_capture_page_v2(uuid,uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)', 'execute')
    or has_function_privilege('service_role', 'public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)', 'execute')
    or not has_function_privilege('service_role', 'public.equora_claim_broker_capture_work_unit_v2(uuid,bigint,uuid,uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)', 'execute')
    or has_function_privilege('service_role', 'public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)', 'execute')
    or not has_function_privilege('service_role', 'public.equora_record_broker_capture_failure_v2(uuid,timestamptz,uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)', 'execute')
  then
    raise exception 'TEST_PRIVILEGE_BOUNDARY_FAILED';
  end if;
end;
$$;

-- Capture-Control boundary fixtures: attempt exhaustion, resumable multi-Scope
-- Runs and Scope-local completeness derivation.
insert into public.broker_sync_lane_requirements (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  provider_code, provider_contract_version, adapter_version, capability_id,
  capability_version, instrument_scope_key, profile_id, profile_version,
  policy_generation, requirement_source
)
select
  variants.requirement_id,
  source.user_id,
  source.broker_account_id,
  source.sync_activation_id,
  source.activation_generation,
  source.provider_code,
  source.provider_contract_version,
  source.adapter_version,
  source.capability_id,
  source.capability_version,
  source.instrument_scope_key || ':' || variants.suffix,
  source.profile_id,
  source.profile_version,
  1,
  'instrument_discovery'
from public.broker_sync_lane_requirements as source
cross join (values
  ('36000000-0000-4000-8000-000000000001'::uuid, 'attempt'),
  ('46000000-0000-4000-8000-000000000001'::uuid, 'multi_a'),
  ('56000000-0000-4000-8000-000000000001'::uuid, 'multi_b'),
  ('66000000-0000-4000-8000-000000000001'::uuid, 'partial'),
  ('76000000-0000-4000-8000-000000000001'::uuid, 'cross_run')
) variants(requirement_id, suffix)
where source.id = '26000000-0000-4000-8000-000000000002';

insert into public.broker_sync_lane_states (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  lane_requirement_id, provider_code, provider_contract_version,
  adapter_version, capability_id, capability_version, instrument_scope_key,
  lane_id, profile_id, profile_version, policy_generation
)
select
  variants.lane_state_id,
  requirement.user_id,
  requirement.broker_account_id,
  requirement.sync_activation_id,
  requirement.activation_generation,
  requirement.id,
  requirement.provider_code,
  requirement.provider_contract_version,
  requirement.adapter_version,
  requirement.capability_id,
  requirement.capability_version,
  requirement.instrument_scope_key,
  variants.lane_id,
  requirement.profile_id,
  requirement.profile_version,
  requirement.policy_generation
from (values
  ('36000000-0000-4000-8000-000000000001'::uuid, '36000000-0000-4000-8000-000000000011'::uuid, 'incremental_fast_6h'),
  ('36000000-0000-4000-8000-000000000001'::uuid, '36000000-0000-4000-8000-000000000012'::uuid, 'rolling_audit_7d_daily'),
  ('36000000-0000-4000-8000-000000000001'::uuid, '36000000-0000-4000-8000-000000000013'::uuid, 'rolling_audit_28d_weekly'),
  ('46000000-0000-4000-8000-000000000001'::uuid, '46000000-0000-4000-8000-000000000011'::uuid, 'incremental_fast_6h'),
  ('46000000-0000-4000-8000-000000000001'::uuid, '46000000-0000-4000-8000-000000000012'::uuid, 'rolling_audit_7d_daily'),
  ('46000000-0000-4000-8000-000000000001'::uuid, '46000000-0000-4000-8000-000000000013'::uuid, 'rolling_audit_28d_weekly'),
  ('56000000-0000-4000-8000-000000000001'::uuid, '56000000-0000-4000-8000-000000000011'::uuid, 'incremental_fast_6h'),
  ('56000000-0000-4000-8000-000000000001'::uuid, '56000000-0000-4000-8000-000000000012'::uuid, 'rolling_audit_7d_daily'),
  ('56000000-0000-4000-8000-000000000001'::uuid, '56000000-0000-4000-8000-000000000013'::uuid, 'rolling_audit_28d_weekly'),
  ('66000000-0000-4000-8000-000000000001'::uuid, '66000000-0000-4000-8000-000000000011'::uuid, 'incremental_fast_6h'),
  ('66000000-0000-4000-8000-000000000001'::uuid, '66000000-0000-4000-8000-000000000012'::uuid, 'rolling_audit_7d_daily'),
  ('66000000-0000-4000-8000-000000000001'::uuid, '66000000-0000-4000-8000-000000000013'::uuid, 'rolling_audit_28d_weekly'),
  ('76000000-0000-4000-8000-000000000001'::uuid, '76000000-0000-4000-8000-000000000011'::uuid, 'incremental_fast_6h'),
  ('76000000-0000-4000-8000-000000000001'::uuid, '76000000-0000-4000-8000-000000000012'::uuid, 'rolling_audit_7d_daily'),
  ('76000000-0000-4000-8000-000000000001'::uuid, '76000000-0000-4000-8000-000000000013'::uuid, 'rolling_audit_28d_weekly')
) variants(requirement_id, lane_state_id, lane_id)
join public.broker_sync_lane_requirements as requirement
  on requirement.id = variants.requirement_id;

insert into public.broker_sync_scopes (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  provider_code, account_identity_digest, account_identity_key_version,
  source_channel, profile_id, profile_version, provider_contract_version,
  adapter_version, capability_id, endpoint_id, instrument_scope_key,
  instrument_symbol, position_type, lane_id, request_start_ms, request_end_ms,
  bucket_start_ms, bucket_end_ms, boundary_policy_version, boundary_semantics,
  overlap_policy, scope_generation, stability_generation, coverage_basis,
  coverage_policy, scope_completeness, stability_status, digest_algorithm,
  digest_contract_version, digest_version, stability_bucket_digest, scope_digest,
  lane_requirement_id, lane_state_id, policy_generation,
  authority_contract_version, authority_digest
)
select
  scope_id,
  source.user_id,
  source.broker_account_id,
  source.sync_activation_id,
  source.activation_generation,
  source.provider_code,
  source.account_identity_digest,
  source.account_identity_key_version,
  source.source_channel,
  source.profile_id,
  source.profile_version,
  source.provider_contract_version,
  source.adapter_version,
  source.capability_id,
  source.endpoint_id,
  source.instrument_scope_key || ':' || suffix,
  source.instrument_symbol,
  source.position_type,
  source.lane_id,
  source.request_start_ms,
  source.request_end_ms,
  source.bucket_start_ms,
  source.bucket_end_ms,
  source.boundary_policy_version,
  source.boundary_semantics,
  source.overlap_policy,
  source.scope_generation,
  source.stability_generation,
  source.coverage_basis,
  source.coverage_policy,
  'unverified',
  'not_observed',
  source.digest_algorithm,
  source.digest_contract_version,
  source.digest_version,
  digest,
  digest,
  variants.requirement_id,
  variants.lane_state_id,
  1,
  'broker-capture-authority-v1',
  public.equora_capture_authority_digest_v1(
    source.sync_activation_id,
    source.activation_generation,
    source.broker_account_id,
    variants.requirement_id,
    variants.lane_state_id,
    1,
    source.capability_id,
    source.instrument_scope_key || ':' || suffix,
    source.lane_id,
    source.profile_id,
    source.profile_version,
    digest
  )
from public.broker_sync_scopes as source
cross join (values
  ('38000000-0000-4000-8000-000000000001'::uuid, 'attempt', repeat('c', 64), '36000000-0000-4000-8000-000000000001'::uuid, '36000000-0000-4000-8000-000000000011'::uuid),
  ('48000000-0000-4000-8000-000000000001'::uuid, 'multi_a', repeat('d', 64), '46000000-0000-4000-8000-000000000001'::uuid, '46000000-0000-4000-8000-000000000011'::uuid),
  ('58000000-0000-4000-8000-000000000001'::uuid, 'multi_b', repeat('e', 64), '56000000-0000-4000-8000-000000000001'::uuid, '56000000-0000-4000-8000-000000000011'::uuid),
  ('68000000-0000-4000-8000-000000000001'::uuid, 'partial', repeat('f', 64), '66000000-0000-4000-8000-000000000001'::uuid, '66000000-0000-4000-8000-000000000011'::uuid),
  ('78000000-0000-4000-8000-000000000001'::uuid, 'cross_run', repeat('9', 64), '76000000-0000-4000-8000-000000000001'::uuid, '76000000-0000-4000-8000-000000000011'::uuid)
) variants(scope_id, suffix, digest, requirement_id, lane_state_id)
where source.id = '28000000-0000-4000-8000-000000000001';

insert into public.broker_capture_runs (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  lane_id, trigger_kind, status, adapter_version, algorithm_version, scope_count,
  authority_contract_version, authority_plan_digest
)
select
  variants.run_id,
  source.user_id,
  source.broker_account_id,
  source.sync_activation_id,
  source.activation_generation,
  source.lane_id,
  'recovery',
  'pending',
  source.adapter_version,
  source.algorithm_version,
  variants.scope_count,
  source.authority_contract_version,
  source.authority_plan_digest
from public.broker_capture_runs as source
cross join (values
  ('ccba2551-2100-480b-a6fc-3ccd14c65be5'::uuid, 1),
  ('dcba2551-2100-480b-a6fc-3ccd14c65be5'::uuid, 2),
  ('ecba2551-2100-480b-a6fc-3ccd14c65be5'::uuid, 2),
  ('fcba2551-2100-480b-a6fc-3ccd14c65be5'::uuid, 1)
) variants(run_id, scope_count)
where source.id = 'bcba2551-2100-480b-a6fc-3ccd14c65be5';

with variants(work_unit_id, run_id, scope_id, scope_digest, max_attempts) as (
  values
    ('970d4b00-c275-48f1-aa02-9712c6ce1190'::uuid, 'ccba2551-2100-480b-a6fc-3ccd14c65be5'::uuid, '38000000-0000-4000-8000-000000000001'::uuid, repeat('c', 64), 1),
    ('a70d4b00-c275-48f1-aa02-9712c6ce1190'::uuid, 'dcba2551-2100-480b-a6fc-3ccd14c65be5'::uuid, '48000000-0000-4000-8000-000000000001'::uuid, repeat('d', 64), 8),
    ('b70d4b00-c275-48f1-aa02-9712c6ce1190'::uuid, 'dcba2551-2100-480b-a6fc-3ccd14c65be5'::uuid, '58000000-0000-4000-8000-000000000001'::uuid, repeat('e', 64), 8),
    ('c70d4b00-c275-48f1-aa02-9712c6ce1190'::uuid, 'ecba2551-2100-480b-a6fc-3ccd14c65be5'::uuid, '68000000-0000-4000-8000-000000000001'::uuid, repeat('f', 64), 8),
    ('e70d4b00-c275-48f1-aa02-9712c6ce1190'::uuid, 'fcba2551-2100-480b-a6fc-3ccd14c65be5'::uuid, '78000000-0000-4000-8000-000000000001'::uuid, repeat('9', 64), 8)
), unsigned as (
  select
    variants.*,
    fixture_control_checkpoint.current_checkpoint as checkpoint
  from variants
  cross join fixture_control_checkpoint
), signed as (
  select
    unsigned.*,
    public.equora_mexc_checkpoint_mac_v1(
      unsigned.checkpoint,
      integrity_key.key_material
    ) as checkpoint_mac
  from unsigned
  cross join equora_private.broker_capture_integrity_keys as integrity_key
  where integrity_key.id = '13000000-0000-4000-8000-000000000001'
)
insert into public.broker_capture_work_units (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  run_id, scope_id, lane_id, status, attempt, row_version, checkpoint,
  checkpoint_mac, request_sequence, max_attempts,
  lane_requirement_id, lane_state_id, policy_generation,
  authority_contract_version, authority_digest
)
select
  signed.work_unit_id,
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
  1,
  signed.run_id,
  signed.scope_id,
  'incremental_fast_6h',
  'pending',
  0,
  0,
  signed.checkpoint || jsonb_build_object('checkpointMac', signed.checkpoint_mac),
  signed.checkpoint_mac,
  0,
  signed.max_attempts,
  scope_binding.lane_requirement_id,
  scope_binding.lane_state_id,
  scope_binding.policy_generation,
  scope_binding.authority_contract_version,
  scope_binding.authority_digest
from signed
join public.broker_sync_scopes as scope_binding
  on scope_binding.id = signed.scope_id;

with variants(work_unit_id, scope_id) as (
  values
    ('d70d4b00-c275-48f1-aa02-9712c6ce1190'::uuid, '68000000-0000-4000-8000-000000000001'::uuid),
    ('f70d4b00-c275-48f1-aa02-9712c6ce1190'::uuid, '78000000-0000-4000-8000-000000000001'::uuid)
), unsigned as (
  select variants.*, fixture_checkpoint.next_checkpoint || jsonb_build_object(
    'status', 'yielded',
    'reason', 'work_unit_budget_reached',
    'terminalEvidence', 'none'
  ) as checkpoint
  from variants
  cross join fixture_checkpoint
), signed as (
  select
    unsigned.*,
    public.equora_mexc_checkpoint_mac_v1(
      unsigned.checkpoint,
      integrity_key.key_material
    ) as checkpoint_mac
  from unsigned
  cross join equora_private.broker_capture_integrity_keys as integrity_key
  where integrity_key.id = '13000000-0000-4000-8000-000000000001'
)
insert into public.broker_capture_work_units (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  run_id, scope_id, lane_id, status, attempt, row_version, checkpoint,
  checkpoint_mac, request_sequence, successful_page_count,
  observed_event_count, response_bytes,
  lane_requirement_id, lane_state_id, policy_generation,
  authority_contract_version, authority_digest
)
select
  signed.work_unit_id,
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
  1,
  'ecba2551-2100-480b-a6fc-3ccd14c65be5',
  signed.scope_id,
  'incremental_fast_6h',
  'yielded',
  1,
  1,
  signed.checkpoint || jsonb_build_object('checkpointMac', signed.checkpoint_mac),
  signed.checkpoint_mac,
  1,
  1,
  1,
  362,
  scope_binding.lane_requirement_id,
  scope_binding.lane_state_id,
  scope_binding.policy_generation,
  scope_binding.authority_contract_version,
  scope_binding.authority_digest
from signed
join public.broker_sync_scopes as scope_binding
  on scope_binding.id = signed.scope_id;

-- A successful request result in the dedicated partial Scope proves that
-- completeness is derived from this Scope, not from unrelated Run counters.
insert into public.broker_provider_request_results (
  id, user_id, broker_account_id, run_id, scope_id, work_unit_id,
  provider_code, capability_id, endpoint_id, request_sequence, method,
  request_origin, request_path, request_query, transport_contract_version,
  request_started_at, response_received_at, request_duration_ms, http_status,
  provider_status_class, response_classification, result_count, response_bytes,
  page_observation_digest, page_metadata, scope_completeness
)
select
  variants.result_id,
  source.user_id,
  source.broker_account_id,
  'ecba2551-2100-480b-a6fc-3ccd14c65be5',
  variants.scope_id,
  variants.work_unit_id,
  source.provider_code,
  source.capability_id,
  source.endpoint_id,
  1,
  source.method,
  source.request_origin,
  source.request_path,
  source.request_query,
  source.transport_contract_version,
  source.request_started_at,
  source.response_received_at,
  source.request_duration_ms,
  source.http_status,
  source.provider_status_class,
  source.response_classification,
  source.result_count,
  source.response_bytes,
  source.page_observation_digest,
  source.page_metadata,
  source.scope_completeness
from (
  select *
  from public.broker_provider_request_results
  order by created_at, id
  limit 1
) as source
cross join (values
  ('e5000000-0000-4000-8000-000000000001'::uuid, '68000000-0000-4000-8000-000000000001'::uuid, 'd70d4b00-c275-48f1-aa02-9712c6ce1190'::uuid),
  ('f5000000-0000-4000-8000-000000000001'::uuid, '78000000-0000-4000-8000-000000000001'::uuid, 'f70d4b00-c275-48f1-aa02-9712c6ce1190'::uuid)
) variants(result_id, scope_id, work_unit_id);

set local role service_role;

do $$
declare
  v_claim jsonb;
  v_failure jsonb;
  v_replay jsonb;
begin
  v_claim := public.equora_claim_broker_capture_work_unit_v2(
    '970d4b00-c275-48f1-aa02-9712c6ce1190', 0,
    '87000000-0000-4000-8000-000000000001',
    '88000000-0000-4000-8000-000000000001',
    'broker-capture-claim-v1'
  );
  v_failure := pg_temp.record_fixture_failure(
    '970d4b00-c275-48f1-aa02-9712c6ce1190', 1,
    '89000000-0000-4000-8000-000000000001',
    '88000000-0000-4000-8000-000000000001', 1,
    v_claim ->> 'checkpointMac', v_claim ->> 'capabilityId',
    v_claim ->> 'pageScopeDigest', 'rate_limited', 429, 32, 5,
    'broker-capture-failure-policy-v1'
  );
  v_replay := pg_temp.record_fixture_failure(
    '970d4b00-c275-48f1-aa02-9712c6ce1190', 1,
    '89000000-0000-4000-8000-000000000001',
    '88000000-0000-4000-8000-000000000001', 1,
    v_claim ->> 'checkpointMac', v_claim ->> 'capabilityId',
    v_claim ->> 'pageScopeDigest', 'rate_limited', 429, 32, 5,
    'broker-capture-failure-policy-v1'
  );
  if v_failure is distinct from v_replay
    or v_failure ->> 'status' <> 'terminal_failed'
    or v_failure ->> 'terminalReason' <> 'claim_attempt_budget_reached'
    or v_failure ->> 'requestSequence' <> '1'
    or v_failure -> 'retryNotBefore' <> 'null'::jsonb
  then
    raise exception 'TEST_CONTROL_ATTEMPT_BOUNDARY_INVALID: %, %', v_failure, v_replay;
  end if;

  v_claim := public.equora_claim_broker_capture_work_unit_v2(
    'a70d4b00-c275-48f1-aa02-9712c6ce1190', 0,
    '87000000-0000-4000-8000-000000000002',
    '88000000-0000-4000-8000-000000000002',
    'broker-capture-claim-v1'
  );
  v_failure := pg_temp.record_fixture_failure(
    'a70d4b00-c275-48f1-aa02-9712c6ce1190', 1,
    '89000000-0000-4000-8000-000000000002',
    '88000000-0000-4000-8000-000000000002', 1,
    v_claim ->> 'checkpointMac', v_claim ->> 'capabilityId',
    v_claim ->> 'pageScopeDigest', 'invalid_credential', 401, 16, 5,
    'broker-capture-failure-policy-v1'
  );
  if v_failure ->> 'status' <> 'terminal_failed'
    or v_failure ->> 'runStatus' <> 'partial'
  then
    raise exception 'TEST_CONTROL_MULTI_SCOPE_PARTIAL_INVALID: %', v_failure;
  end if;

  v_claim := public.equora_claim_broker_capture_work_unit_v2(
    'b70d4b00-c275-48f1-aa02-9712c6ce1190', 0,
    '87000000-0000-4000-8000-000000000003',
    '88000000-0000-4000-8000-000000000003',
    'broker-capture-claim-v1'
  );
  if v_claim ->> 'status' <> 'claimed' then
    raise exception 'TEST_CONTROL_MULTI_SCOPE_RESUME_INVALID: %', v_claim;
  end if;
  v_failure := pg_temp.record_fixture_failure(
    'b70d4b00-c275-48f1-aa02-9712c6ce1190', 1,
    '89000000-0000-4000-8000-000000000003',
    '88000000-0000-4000-8000-000000000003', 1,
    v_claim ->> 'checkpointMac', v_claim ->> 'capabilityId',
    v_claim ->> 'pageScopeDigest', 'maintenance', 503, 8, 5,
    'broker-capture-failure-policy-v1'
  );
  if v_failure ->> 'status' <> 'terminal_failed'
    or v_failure ->> 'terminalReason' <> 'provider_retry_deferred'
    or v_failure -> 'retryNotBefore' <> 'null'::jsonb
  then
    raise exception 'TEST_CONTROL_MAINTENANCE_WAS_RETRIED: %', v_failure;
  end if;

  -- Scope truth and current-Run truth are independent: this Scope has valid
  -- evidence from ecba..., while the current fcba... Run has neither a result
  -- nor another open Work Unit. SQL must therefore return the durable and
  -- replayable combination partial_failed + failed.
  v_claim := public.equora_claim_broker_capture_work_unit_v2(
    'e70d4b00-c275-48f1-aa02-9712c6ce1190', 0,
    '87000000-0000-4000-8000-000000000005',
    '88000000-0000-4000-8000-000000000005',
    'broker-capture-claim-v1'
  );
  v_failure := pg_temp.record_fixture_failure(
    'e70d4b00-c275-48f1-aa02-9712c6ce1190', 1,
    '89000000-0000-4000-8000-000000000005',
    '88000000-0000-4000-8000-000000000005', 1,
    v_claim ->> 'checkpointMac', v_claim ->> 'capabilityId',
    v_claim ->> 'pageScopeDigest', 'invalid_credential', 401, 16, 5,
    'broker-capture-failure-policy-v1'
  );
  v_replay := pg_temp.record_fixture_failure(
    'e70d4b00-c275-48f1-aa02-9712c6ce1190', 1,
    '89000000-0000-4000-8000-000000000005',
    '88000000-0000-4000-8000-000000000005', 1,
    v_claim ->> 'checkpointMac', v_claim ->> 'capabilityId',
    v_claim ->> 'pageScopeDigest', 'invalid_credential', 401, 16, 5,
    'broker-capture-failure-policy-v1'
  );
  if v_failure is distinct from v_replay
    or v_failure ->> 'status' <> 'partial_failed'
    or v_failure ->> 'runStatus' <> 'failed'
  then
    raise exception 'TEST_CONTROL_CROSS_RUN_SCOPE_RESULT_INVALID: %, %', v_failure, v_replay;
  end if;

  v_claim := public.equora_claim_broker_capture_work_unit_v2(
    'c70d4b00-c275-48f1-aa02-9712c6ce1190', 0,
    '87000000-0000-4000-8000-000000000004',
    '88000000-0000-4000-8000-000000000004',
    'broker-capture-claim-v1'
  );
  v_failure := pg_temp.record_fixture_failure(
    'c70d4b00-c275-48f1-aa02-9712c6ce1190', 1,
    '89000000-0000-4000-8000-000000000004',
    '88000000-0000-4000-8000-000000000004', 1,
    v_claim ->> 'checkpointMac', v_claim ->> 'capabilityId',
    v_claim ->> 'pageScopeDigest', 'invalid_credential', 401, 16, 5,
    'broker-capture-failure-policy-v1'
  );
  if v_failure ->> 'status' <> 'partial_failed'
    or v_failure ->> 'runStatus' <> 'partial'
  then
    raise exception 'TEST_CONTROL_SCOPE_LOCAL_PARTIAL_INVALID: %', v_failure;
  end if;
end;
$$;

reset role;

do $$
begin
  if not exists (
      select 1 from public.broker_capture_work_units
      where id = '970d4b00-c275-48f1-aa02-9712c6ce1190'
        and status = 'partial_failed'
        and request_sequence = 1
        and terminal_reason = 'claim_attempt_budget_reached'
        and lease_token_digest is null
    )
    or not exists (
      select 1 from public.broker_capture_runs
      where id = 'ccba2551-2100-480b-a6fc-3ccd14c65be5'
        and status = 'failed'
        and failed_request_count = 1
        and completed_at is not null
    )
    or not exists (
      select 1 from public.broker_capture_runs
      where id = 'dcba2551-2100-480b-a6fc-3ccd14c65be5'
        and status = 'failed'
        and completed_at is not null
    )
    or not exists (
      select 1 from public.broker_sync_scopes
      where id = '48000000-0000-4000-8000-000000000001'
        and scope_completeness = 'failed'
        and closed_at is not null
    )
    or not exists (
      select 1 from public.broker_capture_work_units
      where id = 'b70d4b00-c275-48f1-aa02-9712c6ce1190'
        and status = 'partial_failed'
        and attempt = 1
        and terminal_reason = 'provider_retry_deferred'
    )
    or not exists (
      select 1 from public.broker_sync_scopes
      where id = '68000000-0000-4000-8000-000000000001'
        and scope_completeness = 'partial'
        and closed_at is not null
    )
    or not exists (
      select 1 from public.broker_capture_work_units
      where id = 'e70d4b00-c275-48f1-aa02-9712c6ce1190'
        and status = 'partial_failed'
        and request_sequence = 1
        and terminal_reason = 'non_retryable_failure'
    )
    or not exists (
      select 1 from public.broker_capture_runs
      where id = 'fcba2551-2100-480b-a6fc-3ccd14c65be5'
        and status = 'failed'
        and completed_at is not null
        and failed_request_count = 1
    )
    or not exists (
      select 1 from public.broker_sync_scopes
      where id = '78000000-0000-4000-8000-000000000001'
        and scope_completeness = 'partial'
        and closed_at is not null
    )
  then
    raise exception 'TEST_CONTROL_BOUNDARY_PERSISTED_STATE_INVALID';
  end if;
end;
$$;

rollback;
