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
  array['futures_read_verified', 'read_only_confirmed'],
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
  permission_evidence_version, user_read_only_attested_at
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
  '{"historical_orders_v1":"v1"}'::jsonb,
  '{"historical_orders_v1":{"permission":"View Order Details","status":"documented"}}'::jsonb,
  'mexc_support_2026_08_v1',
  now()
);

update public.broker_sync_activation_series
set current_sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
    current_activation_generation = 1,
    series_row_version = 1
where id = '16000000-0000-4000-8000-000000000001';

insert into public.broker_sync_scopes (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  provider_code, account_identity_digest, account_identity_key_version,
  source_channel, profile_id, profile_version, provider_contract_version,
  adapter_version, capability_id, endpoint_id, instrument_scope_key,
  instrument_symbol, position_type, lane_id, request_start_ms, request_end_ms,
  bucket_start_ms, bucket_end_ms, boundary_policy_version, boundary_semantics,
  overlap_policy, scope_generation, stability_generation, coverage_basis,
  coverage_policy, scope_completeness, stability_status, digest_algorithm,
  digest_contract_version, digest_version, stability_bucket_digest, scope_digest
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
  'f7006f0e92a876de3866e7554c8add59d206b83c554e8325dc1612a852db69b1'
);

insert into public.broker_capture_runs (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  lane_id, trigger_kind, status, adapter_version, algorithm_version, scope_count
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
  1
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

insert into public.broker_capture_work_units (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  run_id, scope_id, lane_id, status, attempt, lease_token_digest,
  lease_token_format_version, lease_expires_at, row_version, checkpoint,
  checkpoint_mac, request_sequence
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
  0
from fixture_checkpoint
cross join (values
  ('670d4b00-c275-48f1-aa02-9712c6ce1190'::uuid),
  ('770d4b00-c275-48f1-aa02-9712c6ce1190'::uuid)
) work_units(work_unit_id);

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
  p_next_checkpoint_override jsonb default null
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
end;
$$;

grant execute on function pg_temp.commit_fixture_page(uuid, uuid, uuid, bigint, timestamptz, text, text, text, text, text, text, text, text, jsonb) to service_role;

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

-- EQUORA_CONCURRENCY_SETUP_END

update public.broker_sync_activations
set activation_state = 'paused'
where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';
set local role service_role;
select pg_temp.expect_fixture_failure('CAPTURE_ACTIVATION_INACTIVE');
reset role;
update public.broker_sync_activations
set activation_state = 'active'
where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';

update public.broker_connections
set status = 'paused'
where id = '12000000-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.expect_fixture_failure('CAPTURE_CONNECTION_INACTIVE');
reset role;
update public.broker_connections
set status = 'ready'
where id = '12000000-0000-4000-8000-000000000001';

update public.broker_credentials
set encrypted_payload = ''
where id = '11000000-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.expect_fixture_failure('CAPTURE_CREDENTIAL_INACTIVE');
reset role;
update public.broker_credentials
set encrypted_payload = 'synthetic-ciphertext-not-a-secret'
where id = '11000000-0000-4000-8000-000000000001';

update equora_private.broker_capture_integrity_keys
set status = 'revoked'
where id = '13000000-0000-4000-8000-000000000001';
set local role service_role;
select pg_temp.expect_fixture_failure('CAPTURE_INTEGRITY_KEY_INVALID');
reset role;
update equora_private.broker_capture_integrity_keys
set status = 'active'
where id = '13000000-0000-4000-8000-000000000001';

update public.broker_providers
set status = 'suspended'
where provider_code = 'mexc';
set local role service_role;
select pg_temp.expect_fixture_failure('CAPTURE_PROVIDER_BLOCKED');
reset role;
update public.broker_providers
set status = 'verified'
where provider_code = 'mexc';

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

reset role;

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
    or not has_function_privilege('service_role', 'public.equora_commit_broker_capture_page_v1(uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)', 'execute')
  then
    raise exception 'TEST_PRIVILEGE_BOUNDARY_FAILED';
  end if;
end;
$$;

rollback;
