\set ON_ERROR_STOP on

-- Requires the committed setup prefix from broker-capture-persistence.integration.sql
-- in an isolated local database with the lane-authority migration applied.
begin;

do $$
declare
  v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
    '2026-08-06T00:00:00Z'
  );
  if v_result ->> 'health' <> 'pending'
    or (v_result ->> 'requiredCapabilityCount')::integer <> 4
    or (v_result ->> 'requiredGrainCount')::integer <> 0
    or (v_result ->> 'requiredLaneStateCount')::integer <> 12
    or (v_result ->> 'missingLaneStateCount')::integer <> 12
    or v_result ->> 'authorityBlocked' <> 'true'
  then
    raise exception 'TEST_LANE_AUTHORITY_EMPTY_SET_NOT_PENDING: %', v_result;
  end if;
end;
$$;

with capabilities(capability_id) as (
  values
    ('funding_records_v1'),
    ('historical_executions_v3'),
    ('historical_orders_v1'),
    ('historical_positions_v1')
)
insert into public.broker_sync_lane_requirements (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  provider_code, provider_contract_version, adapter_version, capability_id,
  capability_version, instrument_scope_key, profile_id, profile_version,
  policy_generation, requirement_source, created_at, updated_at
)
select
  md5('lane-requirement-v1|' || capability_id)::uuid,
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
  1,
  'mexc',
  'mexc_futures_contract_v1',
  'v57_61_0',
  capability_id,
  'v1',
  'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
  'mexc_futures_rest',
  'v1',
  1,
  'activation_plan',
  '2026-08-01T00:00:00Z',
  '2026-08-01T00:00:00Z'
from capabilities;

with capabilities(capability_id) as (
  values
    ('funding_records_v1'),
    ('historical_executions_v3'),
    ('historical_orders_v1'),
    ('historical_positions_v1')
), lanes(lane_id) as (
  values
    ('incremental_fast_6h'),
    ('rolling_audit_7d_daily'),
    ('rolling_audit_28d_weekly')
), fixture as (
  select capability_id, lane_id,
    md5('lane-health-scope-v1|' || capability_id || '|' || lane_id)::uuid as scope_id,
    encode(public.equora_pgcrypto_digest_v1(
      convert_to('lane-health-scope-digest-v1|' || capability_id || '|' || lane_id, 'UTF8'),
      'sha256'
    ), 'hex') as scope_digest,
    encode(public.equora_pgcrypto_digest_v1(
      convert_to('lane-health-bucket-digest-v1|' || capability_id || '|' || lane_id, 'UTF8'),
      'sha256'
    ), 'hex') as bucket_digest
  from capabilities cross join lanes
)
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
  created_at, closed_at, lane_requirement_id, lane_state_id, policy_generation,
  authority_contract_version, authority_digest
)
select
  scope_id,
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
  capability_id,
  capability_id,
  'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
  'BTC_USDT',
  null,
  lane_id,
  1785888000000,
  1785974400000,
  1785888000000,
  1785974400000,
  'mexc_provider_unverified_overlap_v1',
  'provider_unverified',
  'minimum_72h_v1',
  1,
  1,
  'provider_observed',
  'provider_observed_best_effort',
  'complete_for_profile',
  'observed_once',
  'sha256',
  'equora-tcj-v1',
  'equora-tcj-v1',
  bucket_digest,
  scope_digest,
  '2026-08-01T00:00:00Z',
  '2026-08-02T00:00:00Z',
  md5('lane-requirement-v1|' || capability_id)::uuid,
  md5('lane-health-state-v1|' || capability_id || '|' || lane_id)::uuid,
  1,
  'broker-capture-authority-v1',
  public.equora_capture_authority_digest_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    md5('lane-requirement-v1|' || capability_id)::uuid,
    md5('lane-health-state-v1|' || capability_id || '|' || lane_id)::uuid,
    1, capability_id,
    'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority', lane_id,
    'mexc_futures_rest', 'v1', scope_digest
  )
from fixture;

do $$
declare
  v_requirement_id uuid := md5('lane-requirement-v1|historical_orders_v1')::uuid;
  v_scope_id uuid := md5('lane-health-scope-v1|historical_orders_v1|incremental_fast_6h')::uuid;
  v_scope_digest text := encode(public.equora_pgcrypto_digest_v1(
    convert_to('lane-health-scope-digest-v1|historical_orders_v1|incremental_fast_6h', 'UTF8'),
    'sha256'
  ), 'hex');
begin
  begin
    insert into public.broker_sync_lane_states (
      id, user_id, broker_account_id, sync_activation_id, activation_generation,
      lane_requirement_id, provider_code, provider_contract_version,
      adapter_version, capability_id, capability_version, instrument_scope_key,
      lane_id, profile_id, profile_version, policy_generation,
      observation_status, high_watermark_time_ms, high_watermark_tie_breaker,
      watermark_contract_version, watermark_digest, created_at, updated_at
    ) values (
      '7a000000-0000-4000-8000-000000000010',
      '10000000-0000-4000-8000-000000000001',
      '14c6b264-99b8-4c74-a882-135b88e9d100',
      'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, v_requirement_id,
      'mexc', 'mexc_futures_contract_v1', 'v57_61_0',
      'historical_orders_v1', 'v1',
      'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
      'incremental_fast_6h', 'mexc_futures_rest', 'v1', 1,
      'not_observed', 1785888000000, 'forbidden',
      'broker-lane-watermark-v1', repeat('0', 64),
      '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z'
    );
    raise exception 'TEST_NOT_OBSERVED_WATERMARK_WAS_ACCEPTED';
  exception when check_violation then null;
  end;

  begin
    insert into public.broker_sync_lane_states (
      id, user_id, broker_account_id, sync_activation_id, activation_generation,
      lane_requirement_id, provider_code, provider_contract_version,
      adapter_version, capability_id, capability_version, instrument_scope_key,
      lane_id, profile_id, profile_version, policy_generation,
      observation_status, health, last_complete_at, next_due_at,
      last_complete_scope_id, last_complete_scope_digest, created_at, updated_at
    ) values (
      '7a000000-0000-4000-8000-000000000011',
      '10000000-0000-4000-8000-000000000001',
      '14c6b264-99b8-4c74-a882-135b88e9d100',
      'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, v_requirement_id,
      'mexc', 'mexc_futures_contract_v1', 'v57_61_0',
      'historical_orders_v1', 'v1',
      'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
      'incremental_fast_6h', 'mexc_futures_rest', 'v1', 1,
      'observed', 'healthy', '2026-08-02T00:00:00Z',
      '2026-08-10T00:00:00Z', v_scope_id, v_scope_digest,
      '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'
    );
    raise exception 'TEST_HEALTHY_WITHOUT_WATERMARK_WAS_ACCEPTED';
  exception when check_violation then null;
  end;

  begin
    insert into public.broker_sync_lane_states (
      id, user_id, broker_account_id, sync_activation_id, activation_generation,
      lane_requirement_id, provider_code, provider_contract_version,
      adapter_version, capability_id, capability_version, instrument_scope_key,
      lane_id, profile_id, profile_version, policy_generation,
      observation_status, health, last_complete_at, next_due_at,
      last_complete_scope_id, last_complete_scope_digest,
      high_watermark_time_ms, high_watermark_tie_breaker,
      watermark_contract_version, watermark_digest, created_at, updated_at
    ) values (
      '7a000000-0000-4000-8000-000000000012',
      '10000000-0000-4000-8000-000000000001',
      '14c6b264-99b8-4c74-a882-135b88e9d100',
      'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, v_requirement_id,
      'mexc', 'mexc_futures_contract_v1', 'v57_61_0',
      'historical_orders_v1', 'v1',
      'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
      'incremental_fast_6h', 'mexc_futures_rest', 'v1', 1,
      'observed', 'healthy', '2026-08-02T00:00:00Z',
      '2026-08-10T00:00:00Z', v_scope_id, v_scope_digest,
      1785888000000, 'forged', 'broker-lane-watermark-v1', repeat('0', 64),
      '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'
    );
    raise exception 'TEST_FORGED_WATERMARK_DIGEST_WAS_ACCEPTED';
  exception when check_violation then null;
  end;

  begin
    insert into public.broker_sync_lane_states (
      id, user_id, broker_account_id, sync_activation_id, activation_generation,
      lane_requirement_id, provider_code, provider_contract_version,
      adapter_version, capability_id, capability_version, instrument_scope_key,
      lane_id, profile_id, profile_version, policy_generation,
      observation_status, health, last_complete_at, next_due_at,
      last_complete_scope_id, last_complete_scope_digest,
      high_watermark_time_ms, high_watermark_tie_breaker,
      watermark_contract_version, watermark_digest, created_at, updated_at
    ) values (
      '7a000000-0000-4000-8000-000000000013',
      '10000000-0000-4000-8000-000000000001',
      '14c6b264-99b8-4c74-a882-135b88e9d100',
      'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, v_requirement_id,
      'mexc', 'mexc_futures_contract_v1', 'v57_61_0',
      'historical_orders_v1', 'v1',
      'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
      'incremental_fast_6h', 'mexc_futures_rest', 'v1', 1,
      'observed', 'healthy', '2026-08-02T00:00:00Z',
      '2026-08-10T00:00:00Z', v_scope_id, v_scope_digest,
      1785888000000, 'null-digest', 'broker-lane-watermark-v1', null,
      '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'
    );
    raise exception 'TEST_NULL_WATERMARK_DIGEST_WAS_ACCEPTED';
  exception when check_violation then null;
  end;

  begin
    insert into public.broker_sync_lane_states (
      id, user_id, broker_account_id, sync_activation_id, activation_generation,
      lane_requirement_id, provider_code, provider_contract_version,
      adapter_version, capability_id, capability_version, instrument_scope_key,
      lane_id, profile_id, profile_version, policy_generation,
      observation_status, health, last_complete_at, next_due_at,
      last_complete_scope_id, last_complete_scope_digest,
      high_watermark_time_ms, high_watermark_tie_breaker,
      watermark_contract_version, watermark_digest, created_at, updated_at
    ) values (
      '7a000000-0000-4000-8000-000000000014',
      '10000000-0000-4000-8000-000000000001',
      '14c6b264-99b8-4c74-a882-135b88e9d100',
      'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, v_requirement_id,
      'mexc', 'mexc_futures_contract_v1', 'v57_61_0',
      'historical_orders_v1', 'v1',
      'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
      'incremental_fast_6h', 'mexc_futures_rest', 'v1', 1,
      'observed', 'healthy', '2026-08-02T00:00:00Z',
      '2026-08-10T00:00:00Z', v_scope_id, repeat('a', 64),
      1785888000000, 'self-consistent-wrong-scope',
      'broker-lane-watermark-v1',
      public.equora_lane_watermark_digest_v1(
        'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
        '14c6b264-99b8-4c74-a882-135b88e9d100', 'historical_orders_v1',
        'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
        'incremental_fast_6h', 'mexc_futures_rest', 'v1', 1,
        repeat('a', 64), 1785888000000, 'self-consistent-wrong-scope',
        'broker-lane-watermark-v1'
      ),
      '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'
    );
    raise exception 'TEST_SELF_CONSISTENT_WRONG_SCOPE_DIGEST_WAS_ACCEPTED';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.broker_sync_lane_states (
      id, user_id, broker_account_id, sync_activation_id, activation_generation,
      lane_requirement_id, provider_code, provider_contract_version,
      adapter_version, capability_id, capability_version, instrument_scope_key,
      lane_id, profile_id, profile_version, policy_generation,
      observation_status, health, last_complete_at, next_due_at,
      last_complete_scope_id, last_complete_scope_digest, created_at, updated_at
    ) values (
      '7a000000-0000-4000-8000-000000000015',
      '10000000-0000-4000-8000-000000000001',
      '14c6b264-99b8-4c74-a882-135b88e9d100',
      'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, v_requirement_id,
      'mexc', 'mexc_futures_contract_v1', 'v57_61_0',
      'historical_orders_v1', 'v1',
      'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
      'incremental_fast_6h', 'mexc_futures_rest', 'v1', 1,
      'observed', 'degraded', '2026-08-02T00:00:00Z',
      '2026-08-10T00:00:00Z', v_scope_id, null,
      '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'
    );
    raise exception 'TEST_PARTIAL_NULL_COMPLETE_SCOPE_EVIDENCE_WAS_ACCEPTED';
  exception when check_violation then null;
  end;

  begin
    insert into public.broker_sync_lane_states (
      id, user_id, broker_account_id, sync_activation_id, activation_generation,
      lane_requirement_id, provider_code, provider_contract_version,
      adapter_version, capability_id, capability_version, instrument_scope_key,
      lane_id, profile_id, profile_version, policy_generation,
      observation_status, health, last_complete_at, next_due_at,
      last_complete_scope_id, last_complete_scope_digest,
      high_watermark_time_ms, high_watermark_tie_breaker,
      watermark_contract_version, watermark_digest, created_at, updated_at
    ) values (
      '7a000000-0000-4000-8000-000000000016',
      '10000000-0000-4000-8000-000000000001',
      '14c6b264-99b8-4c74-a882-135b88e9d100',
      'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, v_requirement_id,
      'mexc', 'mexc_futures_contract_v1', 'v57_61_0',
      'historical_orders_v1', 'v1',
      'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
      'incremental_fast_6h', 'mexc_futures_rest', 'v1', 1,
      'observed', 'degraded', '2026-08-02T00:00:00Z',
      '2026-08-10T00:00:00Z', v_scope_id, v_scope_digest,
      null, 'partial-null-watermark', 'broker-lane-watermark-v1', repeat('0', 64),
      '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'
    );
    raise exception 'TEST_PARTIAL_NULL_WATERMARK_EVIDENCE_WAS_ACCEPTED';
  exception when check_violation then null;
  end;

  begin
    insert into public.broker_sync_lane_states (
      id, user_id, broker_account_id, sync_activation_id, activation_generation,
      lane_requirement_id, provider_code, provider_contract_version,
      adapter_version, capability_id, capability_version, instrument_scope_key,
      lane_id, profile_id, profile_version, policy_generation,
      observation_status, health, last_error_code, last_error_at,
      created_at, updated_at
    ) values (
      '7a000000-0000-4000-8000-000000000017',
      '10000000-0000-4000-8000-000000000001',
      '14c6b264-99b8-4c74-a882-135b88e9d100',
      'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, v_requirement_id,
      'mexc', 'mexc_futures_contract_v1', 'v57_61_0',
      'historical_orders_v1', 'v1',
      'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
      'incremental_fast_6h', 'mexc_futures_rest', 'v1', 1,
      'observed', 'degraded', null, '2026-08-02T00:00:00Z',
      '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'
    );
    raise exception 'TEST_PARTIAL_NULL_ERROR_EVIDENCE_WAS_ACCEPTED';
  exception when check_violation then null;
  end;
end;
$$;

with capabilities(capability_id) as (
  values
    ('funding_records_v1'),
    ('historical_executions_v3'),
    ('historical_orders_v1'),
    ('historical_positions_v1')
), lanes(lane_id) as (
  values
    ('incremental_fast_6h'),
    ('rolling_audit_7d_daily'),
    ('rolling_audit_28d_weekly')
), fixture as (
  select capability_id, lane_id,
    md5('lane-requirement-v1|' || capability_id)::uuid as requirement_id,
    md5('lane-health-state-v1|' || capability_id || '|' || lane_id)::uuid as lane_state_id,
    md5('lane-health-scope-v1|' || capability_id || '|' || lane_id)::uuid as scope_id,
    encode(public.equora_pgcrypto_digest_v1(
      convert_to('lane-health-scope-digest-v1|' || capability_id || '|' || lane_id, 'UTF8'),
      'sha256'
    ), 'hex') as scope_digest
  from capabilities cross join lanes
)
insert into public.broker_sync_lane_states (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  lane_requirement_id, provider_code, provider_contract_version, adapter_version,
  capability_id, capability_version, instrument_scope_key, lane_id, profile_id,
  profile_version, policy_generation, observation_status, health,
  last_complete_at, next_due_at, last_complete_scope_id,
  last_complete_scope_digest, high_watermark_time_ms,
  high_watermark_tie_breaker, watermark_contract_version, watermark_digest,
  row_version, created_at, updated_at
)
select
  lane_state_id,
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
  1,
  requirement_id,
  'mexc',
  'mexc_futures_contract_v1',
  'v57_61_0',
  capability_id,
  'v1',
  'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
  lane_id,
  'mexc_futures_rest',
  'v1',
  1,
  'observed',
  'healthy',
  '2026-08-02T00:00:00Z',
  '2026-08-20T00:00:00Z',
  scope_id,
  scope_digest,
  1785888000000,
  '123456789',
  'broker-lane-watermark-v1',
  public.equora_lane_watermark_digest_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
    '14c6b264-99b8-4c74-a882-135b88e9d100', capability_id,
    'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority', lane_id,
    'mexc_futures_rest', 'v1', 1, scope_digest, 1785888000000,
    '123456789', 'broker-lane-watermark-v1'
  ),
  1,
  '2026-08-01T00:00:00Z',
  '2026-08-02T00:00:00Z'
from fixture;

do $$
declare
  v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-06T00:00:00Z'
  );
  if v_result ->> 'health' <> 'healthy'
    or (v_result ->> 'requiredGrainCount')::integer <> 4
    or (v_result ->> 'requiredLaneStateCount')::integer <> 12
    or (v_result ->> 'currentLaneStateCount')::integer <> 12
    or (v_result ->> 'missingLaneStateCount')::integer <> 0
    or v_result ->> 'cacheMatchesDerived' <> 'false'
  then
    raise exception 'TEST_COMPLETE_LANE_SET_NOT_HEALTHY: %', v_result;
  end if;
end;
$$;

update public.broker_sync_scopes
set scope_completeness = 'partial'
where id = md5('lane-health-scope-v1|historical_orders_v1|incremental_fast_6h')::uuid;

do $$
declare v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-06T00:00:00Z'
  );
  if v_result ->> 'health' <> 'degraded'
    or (v_result ->> 'invalidCompleteScopeLaneCount')::integer <> 1
  then
    raise exception 'TEST_HEALTHY_PARTIAL_SCOPE_WAS_TRUSTED: %', v_result;
  end if;
end;
$$;

update public.broker_sync_scopes
set scope_completeness = 'complete_for_profile', closed_at = null
where id = md5('lane-health-scope-v1|historical_orders_v1|incremental_fast_6h')::uuid;

do $$
declare v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-06T00:00:00Z'
  );
  if v_result ->> 'health' <> 'degraded'
    or (v_result ->> 'invalidCompleteScopeLaneCount')::integer <> 1
  then
    raise exception 'TEST_HEALTHY_UNCLOSED_SCOPE_WAS_TRUSTED: %', v_result;
  end if;
end;
$$;

update public.broker_sync_scopes
set closed_at = '2026-08-02T00:00:00Z'
where id = md5('lane-health-scope-v1|historical_orders_v1|incremental_fast_6h')::uuid;

update public.broker_sync_scopes
set stability_status = 'invalidated'
where id = md5('lane-health-scope-v1|historical_orders_v1|incremental_fast_6h')::uuid;

do $$
declare v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-06T00:00:00Z'
  );
  if v_result ->> 'health' <> 'degraded'
    or (v_result ->> 'invalidCompleteScopeLaneCount')::integer <> 1
  then
    raise exception 'TEST_HEALTHY_UNSTABLE_SCOPE_WAS_TRUSTED: %', v_result;
  end if;
end;
$$;

update public.broker_sync_scopes
set stability_status = 'observed_once',
    coverage_basis = 'provider_export_observed'
where id = md5('lane-health-scope-v1|historical_orders_v1|incremental_fast_6h')::uuid;

do $$
declare v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-06T00:00:00Z'
  );
  if v_result ->> 'health' <> 'degraded'
    or (v_result ->> 'invalidCompleteScopeLaneCount')::integer <> 1
  then
    raise exception 'TEST_HEALTHY_SOURCE_COVERAGE_MISMATCH_WAS_TRUSTED: %', v_result;
  end if;
end;
$$;

update public.broker_sync_scopes
set coverage_basis = 'provider_observed'
where id = md5('lane-health-scope-v1|historical_orders_v1|incremental_fast_6h')::uuid;

update public.broker_sync_lane_states
set last_complete_at = '2026-08-01T12:00:00Z'
where id = md5('lane-health-state-v1|historical_orders_v1|incremental_fast_6h')::uuid;

do $$
declare v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-06T00:00:00Z'
  );
  if v_result ->> 'health' <> 'degraded'
    or (v_result ->> 'invalidCompleteScopeLaneCount')::integer <> 1
  then
    raise exception 'TEST_HEALTHY_PREMATURE_COMPLETION_TIME_WAS_TRUSTED: %', v_result;
  end if;
end;
$$;

update public.broker_sync_lane_states
set last_complete_at = '2026-08-02T00:00:00Z'
where id = md5('lane-health-state-v1|historical_orders_v1|incremental_fast_6h')::uuid;

do $$
declare v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-06T00:00:00Z'
  );
  if v_result ->> 'health' <> 'healthy'
    or (v_result ->> 'invalidCompleteScopeLaneCount')::integer <> 0
  then
    raise exception 'TEST_VALID_COMPLETE_SCOPE_RECOVERY_NOT_HEALTHY: %', v_result;
  end if;
end;
$$;

do $$
begin
  begin
    update public.broker_sync_scopes
    set scope_digest = encode(public.equora_pgcrypto_digest_v1(
      convert_to('post-hoc-referenced-scope-digest-drift', 'UTF8'), 'sha256'
    ), 'hex')
    where id = md5('lane-health-scope-v1|historical_orders_v1|incremental_fast_6h')::uuid;
    raise exception 'TEST_REFERENCED_COMPLETE_SCOPE_DIGEST_DRIFT_WAS_ACCEPTED';
  exception when foreign_key_violation then null;
  end;
end;
$$;

insert into public.broker_sync_lane_requirements (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  provider_code, provider_contract_version, adapter_version, capability_id,
  capability_version, instrument_scope_key, profile_id, profile_version,
  policy_generation, requirement_source, created_at, updated_at
) values (
  '8a000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
  'mexc', 'mexc_futures_contract_v1', 'v57_61_0',
  'historical_orders_v1', 'v1',
  'mexc_futures_symbol_v1:ETH_USDT:none:lane-authority',
  'mexc_futures_rest', 'v1', 2, 'instrument_discovery',
  '2026-08-02T00:00:00Z', '2026-08-02T00:00:00Z'
);

do $$
declare v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-06T00:00:00Z'
  );
  if v_result ->> 'health' <> 'pending'
    or (v_result ->> 'requiredGrainCount')::integer <> 5
    or (v_result ->> 'requiredLaneStateCount')::integer <> 15
    or (v_result ->> 'missingLaneStateCount')::integer <> 3
  then
    raise exception 'TEST_REQUIRED_INSTRUMENT_GRAIN_WAS_INVISIBLE: %', v_result;
  end if;
end;
$$;

update public.broker_sync_lane_requirements
set superseded_at = '2026-08-03T00:00:00Z',
    updated_at = '2026-08-03T00:00:00Z',
    row_version = row_version + 1
where id = '8a000000-0000-4000-8000-000000000001';

update public.broker_sync_lane_states
set next_due_at = '2026-08-06T00:00:00Z',
    updated_at = '2026-08-06T00:00:00Z',
    row_version = row_version + 1
where capability_id = 'historical_orders_v1'
  and lane_id = 'rolling_audit_7d_daily'
  and superseded_at is null;

do $$
declare v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-06T00:00:00Z'
  );
  if v_result ->> 'health' <> 'degraded'
    or (v_result ->> 'overdueLaneCount')::integer <> 1
  then
    raise exception 'TEST_DUE_BOUNDARY_NOT_DEGRADED: %', v_result;
  end if;
end;
$$;

update public.broker_sync_lane_states
set next_due_at = '2026-08-20T00:00:00Z',
    updated_at = '2026-08-06T00:00:01Z',
    row_version = row_version + 1
where capability_id = 'historical_orders_v1'
  and lane_id = 'rolling_audit_7d_daily'
  and superseded_at is null;

insert into public.broker_sync_gaps (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  lane_state_id, capability_id, instrument_scope_key, lane_id, profile_id,
  profile_version, policy_generation, gap_from_ms, gap_to_ms, cause, status,
  reason_code, required_resolution_source, discovery_scope_id,
  detected_at, last_checked_at, created_at, updated_at
) values (
  '6a000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
  md5('lane-health-state-v1|historical_orders_v1|incremental_fast_6h')::uuid,
  'historical_orders_v1',
  'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
  'incremental_fast_6h', 'mexc_futures_rest', 'v1', 1,
  1785801600000, 1785888000000, 'scheduler_lapse', 'open',
  'gap_unproven', 'complete_api_scope',
  md5('lane-health-scope-v1|historical_orders_v1|incremental_fast_6h')::uuid,
  '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z',
  '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z'
);

do $$
begin
  begin
    update public.broker_sync_gaps
    set status = 'reconciled',
        resolution_scope_id = md5('lane-health-scope-v1|historical_orders_v1|incremental_fast_6h')::uuid,
        resolution_scope_digest = null,
        resolution_contract_version = 'equora-gap-resolution-v1',
        resolution_evidence_digest = null,
        reconciled_at = '2026-08-02T00:00:00Z'
    where id = '6a000000-0000-4000-8000-000000000001';
    raise exception 'TEST_PARTIAL_NULL_RECONCILIATION_EVIDENCE_WAS_ACCEPTED';
  exception when check_violation then null;
  end;
end;
$$;

do $$
declare v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-06T00:00:00Z'
  );
  if v_result ->> 'health' <> 'degraded'
    or (v_result ->> 'nonExportGapCount')::integer <> 1
  then
    raise exception 'TEST_OPEN_GAP_NOT_DEGRADED: %', v_result;
  end if;
end;
$$;

update public.broker_sync_gaps
set status = 'requires_export',
    required_resolution_source = 'provider_export_scope',
    last_checked_at = '2026-08-03T00:00:00Z',
    updated_at = '2026-08-03T00:00:00Z'
where id = '6a000000-0000-4000-8000-000000000001';

update public.broker_sync_lane_states
set health = 'gap_requires_export',
    updated_at = '2026-08-06T00:00:02Z',
    row_version = row_version + 1
where id = md5('lane-health-state-v1|historical_orders_v1|incremental_fast_6h')::uuid;

do $$
declare v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-06T00:00:00Z'
  );
  if v_result ->> 'health' <> 'gap_requires_export'
    or (v_result ->> 'requiresExportGapCount')::integer <> 1
    or (v_result ->> 'exportBlockedLaneCount')::integer <> 1
  then
    raise exception 'TEST_EXPORT_COUNTERS_NOT_SEPARATED: %', v_result;
  end if;
end;
$$;

update public.broker_sync_lane_states
set health = 'healthy', updated_at = '2026-08-06T00:00:03Z',
    row_version = row_version + 1
where id = md5('lane-health-state-v1|historical_orders_v1|incremental_fast_6h')::uuid;

-- Supersede the old policy authority and install a fully healthy replacement.
-- The old unresolved gap must remain visible because gaps are activation/generation
-- evidence, not merely a projection of the current policy row.
update public.broker_sync_lane_states
set superseded_at = '2026-08-07T00:00:00Z',
    updated_at = '2026-08-07T00:00:00Z', row_version = row_version + 1
where capability_id = 'historical_orders_v1'
  and instrument_scope_key = 'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority'
  and superseded_at is null;

update public.broker_sync_lane_requirements
set superseded_at = '2026-08-07T00:00:00Z',
    updated_at = '2026-08-07T00:00:00Z', row_version = row_version + 1
where id = md5('lane-requirement-v1|historical_orders_v1')::uuid;

insert into public.broker_sync_lane_requirements (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  provider_code, provider_contract_version, adapter_version, capability_id,
  capability_version, instrument_scope_key, profile_id, profile_version,
  policy_generation, requirement_source, created_at, updated_at
) values (
  md5('lane-requirement-v2|historical_orders_v1')::uuid,
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
  'mexc', 'mexc_futures_contract_v1', 'v57_61_0',
  'historical_orders_v1', 'v1',
  'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
  'mexc_futures_rest', 'v1', 2, 'activation_plan',
  '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'
);

with lanes(lane_id) as (
  values
    ('incremental_fast_6h'),
    ('rolling_audit_7d_daily'),
    ('rolling_audit_28d_weekly')
), fixture as (
  select lane_id,
    md5('lane-health-scope-v1|historical_orders_v1|' || lane_id)::uuid as scope_id,
    encode(public.equora_pgcrypto_digest_v1(
      convert_to('lane-health-scope-digest-v1|historical_orders_v1|' || lane_id, 'UTF8'),
      'sha256'
    ), 'hex') as scope_digest
  from lanes
)
insert into public.broker_sync_lane_states (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  lane_requirement_id, provider_code, provider_contract_version, adapter_version,
  capability_id, capability_version, instrument_scope_key, lane_id, profile_id,
  profile_version, policy_generation, observation_status, health,
  last_complete_at, next_due_at, last_complete_scope_id,
  last_complete_scope_digest, high_watermark_time_ms,
  high_watermark_tie_breaker, watermark_contract_version, watermark_digest,
  row_version, created_at, updated_at
)
select
  md5('lane-health-state-v2|historical_orders_v1|' || lane_id)::uuid,
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
  md5('lane-requirement-v2|historical_orders_v1')::uuid,
  'mexc', 'mexc_futures_contract_v1', 'v57_61_0',
  'historical_orders_v1', 'v1',
  'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority', lane_id,
  'mexc_futures_rest', 'v1', 2, 'observed', 'healthy',
  '2026-08-07T00:00:00Z', '2026-08-20T00:00:00Z', scope_id, scope_digest,
  1785888000000, 'policy2', 'broker-lane-watermark-v1',
  public.equora_lane_watermark_digest_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
    '14c6b264-99b8-4c74-a882-135b88e9d100', 'historical_orders_v1',
    'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority', lane_id,
    'mexc_futures_rest', 'v1', 2, scope_digest, 1785888000000,
    'policy2', 'broker-lane-watermark-v1'
  ),
  1, '2026-08-07T00:00:00Z', '2026-08-07T00:00:00Z'
from fixture;

do $$
declare v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-08T00:00:00Z'
  );
  if v_result ->> 'health' <> 'gap_requires_export'
    or (v_result ->> 'requiresExportGapCount')::integer <> 1
    or (v_result ->> 'currentLaneStateCount')::integer <> 12
  then
    raise exception 'TEST_POLICY_SUPERSESSION_MASKED_UNRESOLVED_GAP: %', v_result;
  end if;
end;
$$;

do $$
begin
  begin
    update public.broker_sync_gaps
    set status = 'reconciled',
        resolution_scope_id = md5('lane-health-scope-v1|historical_orders_v1|incremental_fast_6h')::uuid,
        resolution_scope_digest = encode(public.equora_pgcrypto_digest_v1(
          convert_to('lane-health-scope-digest-v1|historical_orders_v1|incremental_fast_6h', 'UTF8'),
          'sha256'
        ), 'hex'),
        resolution_contract_version = 'equora-gap-resolution-v1',
        resolution_evidence_digest = repeat('0', 64),
        reconciled_at = '2026-08-08T00:00:00Z',
        last_checked_at = '2026-08-08T00:00:00Z',
        updated_at = '2026-08-08T00:00:00Z'
    where id = '6a000000-0000-4000-8000-000000000001';
    raise exception 'TEST_FORGED_RECONCILIATION_DIGEST_WAS_ACCEPTED';
  exception when check_violation then null;
  end;
end;
$$;

-- Structurally canonical evidence still fails closed when the referenced scope
-- does not cover the gap and is the wrong source for an export-required gap.
update public.broker_sync_gaps gap
set status = 'reconciled',
    resolution_scope_id = md5('lane-health-scope-v1|historical_orders_v1|incremental_fast_6h')::uuid,
    resolution_scope_digest = encode(public.equora_pgcrypto_digest_v1(
      convert_to('lane-health-scope-digest-v1|historical_orders_v1|incremental_fast_6h', 'UTF8'),
      'sha256'
    ), 'hex'),
    resolution_contract_version = 'equora-gap-resolution-v1',
    reconciled_at = '2026-08-08T00:00:00Z',
    last_checked_at = '2026-08-08T00:00:00Z',
    updated_at = '2026-08-08T00:00:00Z',
    resolution_evidence_digest = public.equora_gap_resolution_digest_v1(
      gap.id, gap.sync_activation_id, gap.activation_generation,
      gap.broker_account_id, gap.capability_id, gap.instrument_scope_key,
      gap.lane_id, gap.profile_id, gap.profile_version, gap.policy_generation,
      gap.gap_from_ms, gap.gap_to_ms, gap.left_boundary_unknown,
      gap.right_boundary_unknown, gap.required_resolution_source,
      md5('lane-health-scope-v1|historical_orders_v1|incremental_fast_6h')::uuid,
      encode(public.equora_pgcrypto_digest_v1(
        convert_to('lane-health-scope-digest-v1|historical_orders_v1|incremental_fast_6h', 'UTF8'),
        'sha256'
      ), 'hex'), 'equora-gap-resolution-v1'
    )
where gap.id = '6a000000-0000-4000-8000-000000000001';

do $$
declare v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-08T00:00:00Z'
  );
  if v_result ->> 'health' <> 'gap_requires_export'
    or (v_result ->> 'invalidReconciliationCount')::integer <> 1
  then
    raise exception 'TEST_OUT_OF_WINDOW_OR_WRONG_SOURCE_RECONCILIATION_PASSED: %', v_result;
  end if;
end;
$$;

with fixture as (
  select
    encode(public.equora_pgcrypto_digest_v1(
      convert_to('lane-health-partial-resolution-scope', 'UTF8'), 'sha256'
    ), 'hex') as scope_digest,
    encode(public.equora_pgcrypto_digest_v1(
      convert_to('lane-health-partial-resolution-bucket', 'UTF8'), 'sha256'
    ), 'hex') as bucket_digest
)
insert into public.broker_sync_scopes (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  provider_code, account_identity_digest, account_identity_key_version,
  source_channel, profile_id, profile_version, provider_contract_version,
  adapter_version, capability_id, endpoint_id, instrument_scope_key,
  instrument_symbol, lane_id, request_start_ms, request_end_ms,
  bucket_start_ms, bucket_end_ms, boundary_policy_version, boundary_semantics,
  overlap_policy, scope_generation, stability_generation, coverage_basis,
  coverage_policy, scope_completeness, stability_status, digest_algorithm,
  digest_contract_version, digest_version, stability_bucket_digest, scope_digest,
  created_at, lane_requirement_id, lane_state_id, policy_generation,
  authority_contract_version, authority_digest
)
select
  '9a000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, 'mexc',
  '854f380b62cd55dd1edae274af280e93357e860da38e4078f6dad303e86d22fd',
  'v1', 'provider_api_observation', 'mexc_futures_rest', 'v1',
  'mexc_futures_contract_v1', 'v57_61_0', 'historical_orders_v1',
  'historical_orders_v1',
  'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority', 'BTC_USDT',
  'incremental_fast_6h', 1785700000000, 1785900000000,
  1785700000000, 1785900000000, 'mexc_provider_unverified_overlap_v1',
  'provider_unverified', 'minimum_72h_v1', 2, 1, 'provider_observed',
  'provider_observed_best_effort', 'partial', 'observed_once', 'sha256',
  'equora-tcj-v1', 'equora-tcj-v1', bucket_digest, scope_digest,
  '2026-08-08T00:00:00Z',
  md5('lane-requirement-v1|historical_orders_v1')::uuid,
  md5('lane-health-state-v1|historical_orders_v1|incremental_fast_6h')::uuid,
  1, 'broker-capture-authority-v1',
  public.equora_capture_authority_digest_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    md5('lane-requirement-v1|historical_orders_v1')::uuid,
    md5('lane-health-state-v1|historical_orders_v1|incremental_fast_6h')::uuid,
    1, 'historical_orders_v1',
    'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
    'incremental_fast_6h', 'mexc_futures_rest', 'v1', scope_digest
  )
from fixture;

update public.broker_sync_gaps gap
set resolution_scope_id = '9a000000-0000-4000-8000-000000000001',
    resolution_scope_digest = scope_row.scope_digest,
    reconciled_at = '2026-08-09T00:00:00Z',
    last_checked_at = '2026-08-09T00:00:00Z',
    updated_at = '2026-08-09T00:00:00Z',
    resolution_evidence_digest = public.equora_gap_resolution_digest_v1(
      gap.id, gap.sync_activation_id, gap.activation_generation,
      gap.broker_account_id, gap.capability_id, gap.instrument_scope_key,
      gap.lane_id, gap.profile_id, gap.profile_version, gap.policy_generation,
      gap.gap_from_ms, gap.gap_to_ms, gap.left_boundary_unknown,
      gap.right_boundary_unknown, gap.required_resolution_source,
      scope_row.id, scope_row.scope_digest, gap.resolution_contract_version
    )
from public.broker_sync_scopes scope_row
where gap.id = '6a000000-0000-4000-8000-000000000001'
  and scope_row.id = '9a000000-0000-4000-8000-000000000001';

do $$
declare v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-09T00:00:00Z'
  );
  if (v_result ->> 'invalidReconciliationCount')::integer <> 1 then
    raise exception 'TEST_PARTIAL_UNCLOSED_RECONCILIATION_PASSED: %', v_result;
  end if;
end;
$$;

update public.broker_sync_scopes
set scope_completeness = 'complete_for_profile',
    closed_at = '2026-08-08T12:00:00Z'
where id = '9a000000-0000-4000-8000-000000000001';

do $$
declare v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-09T00:00:00Z'
  );
  if (v_result ->> 'invalidReconciliationCount')::integer <> 1 then
    raise exception 'TEST_WRONG_SOURCE_RECONCILIATION_PASSED: %', v_result;
  end if;
end;
$$;

with fixture as (
  select
    encode(public.equora_pgcrypto_digest_v1(
      convert_to('lane-health-valid-export-resolution-scope', 'UTF8'), 'sha256'
    ), 'hex') as scope_digest,
    encode(public.equora_pgcrypto_digest_v1(
      convert_to('lane-health-valid-export-resolution-bucket', 'UTF8'), 'sha256'
    ), 'hex') as bucket_digest
)
insert into public.broker_sync_scopes (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  provider_code, account_identity_digest, account_identity_key_version,
  source_channel, profile_id, profile_version, provider_contract_version,
  adapter_version, capability_id, endpoint_id, instrument_scope_key,
  instrument_symbol, lane_id, request_start_ms, request_end_ms,
  bucket_start_ms, bucket_end_ms, boundary_policy_version, boundary_semantics,
  overlap_policy, scope_generation, stability_generation, coverage_basis,
  coverage_policy, scope_completeness, stability_status, digest_algorithm,
  digest_contract_version, digest_version, stability_bucket_digest, scope_digest,
  created_at, closed_at, lane_requirement_id, lane_state_id, policy_generation,
  authority_contract_version, authority_digest
)
select
  '9a000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '14c6b264-99b8-4c74-a882-135b88e9d100',
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, 'mexc',
  '854f380b62cd55dd1edae274af280e93357e860da38e4078f6dad303e86d22fd',
  'v1', 'provider_export_file', 'mexc_futures_rest', 'v1',
  'mexc_futures_contract_v1', 'v57_61_0', 'historical_orders_v1',
  'historical_orders_v1',
  'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority', 'BTC_USDT',
  'incremental_fast_6h', 1785700000000, 1785900000000,
  1785700000000, 1785900000000, 'mexc_provider_unverified_overlap_v1',
  'provider_unverified', 'minimum_72h_v1', 3, 1,
  'provider_export_observed', 'strict_export_verified', 'complete_for_profile',
  'observed_once', 'sha256', 'equora-tcj-v1', 'equora-tcj-v1',
  bucket_digest, scope_digest, '2026-08-09T00:00:00Z', '2026-08-09T12:00:00Z',
  md5('lane-requirement-v1|historical_orders_v1')::uuid,
  md5('lane-health-state-v1|historical_orders_v1|incremental_fast_6h')::uuid,
  1, 'broker-capture-authority-v1',
  public.equora_capture_authority_digest_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    md5('lane-requirement-v1|historical_orders_v1')::uuid,
    md5('lane-health-state-v1|historical_orders_v1|incremental_fast_6h')::uuid,
    1, 'historical_orders_v1',
    'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
    'incremental_fast_6h', 'mexc_futures_rest', 'v1', scope_digest
  )
from fixture;

update public.broker_sync_gaps gap
set resolution_scope_id = '9a000000-0000-4000-8000-000000000002',
    resolution_scope_digest = scope_row.scope_digest,
    reconciled_at = '2026-08-10T00:00:00Z',
    last_checked_at = '2026-08-10T00:00:00Z',
    updated_at = '2026-08-10T00:00:00Z',
    resolution_evidence_digest = public.equora_gap_resolution_digest_v1(
      gap.id, gap.sync_activation_id, gap.activation_generation,
      gap.broker_account_id, gap.capability_id, gap.instrument_scope_key,
      gap.lane_id, gap.profile_id, gap.profile_version, gap.policy_generation,
      gap.gap_from_ms, gap.gap_to_ms, gap.left_boundary_unknown,
      gap.right_boundary_unknown, gap.required_resolution_source,
      scope_row.id, scope_row.scope_digest, gap.resolution_contract_version
    )
from public.broker_sync_scopes scope_row
where gap.id = '6a000000-0000-4000-8000-000000000001'
  and scope_row.id = '9a000000-0000-4000-8000-000000000002';

do $$
declare v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-10T00:00:01Z'
  );
  if v_result ->> 'health' <> 'healthy'
    or (v_result ->> 'invalidReconciliationCount')::integer <> 0
    or (v_result ->> 'requiresExportGapCount')::integer <> 0
  then
    raise exception 'TEST_VALID_EXACT_RECONCILIATION_NOT_ACCEPTED: %', v_result;
  end if;

  update public.broker_sync_activations
  set activation_state = 'paused', capture_health = 'paused'
  where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-10T00:00:01Z'
  );
  if v_result ->> 'health' <> 'paused' then
    raise exception 'TEST_PAUSE_PRECEDENCE_INVALID: %', v_result;
  end if;

  update public.broker_sync_activations
  set activation_state = 'revoked', capture_health = 'revoked'
  where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';
  v_result := public.equora_derive_capture_health_at_v1(
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-10T00:00:01Z'
  );
  if v_result ->> 'health' <> 'revoked' then
    raise exception 'TEST_REVOKE_PRECEDENCE_INVALID: %', v_result;
  end if;
end;
$$;

update public.broker_sync_activations
set activation_state = 'active', capture_health = 'pending'
where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';

insert into public.broker_sync_activations (
  id, activation_series_id, activation_generation, user_id,
  connection_account_id, broker_account_id, provider_code, environment,
  active_credential_id, active_credential_key_version,
  capture_integrity_key_id, capture_integrity_key_version,
  activation_cutover_at, activated_by, onboarding_profile_id,
  scheduler_policy_version, scheduler_target_seconds,
  fast_lane_overlap_seconds, audit_policy_version, activation_state,
  capture_health, provider_contract_version, adapter_version, profile_id,
  profile_version, capability_versions, permission_evidence,
  permission_evidence_version, user_read_only_attested_at
)
select
  'b25526c9-c0e7-4ace-a3d1-f8055de216c8', activation_series_id, 2,
  user_id, connection_account_id, broker_account_id, provider_code,
  environment, active_credential_id, active_credential_key_version,
  capture_integrity_key_id, capture_integrity_key_version,
  activation_cutover_at, 'synthetic_cross_generation_fixture',
  onboarding_profile_id, scheduler_policy_version, scheduler_target_seconds,
  fast_lane_overlap_seconds, audit_policy_version, 'active', 'pending',
  provider_contract_version, adapter_version, profile_id, profile_version,
  capability_versions, permission_evidence, permission_evidence_version,
  user_read_only_attested_at
from public.broker_sync_activations
where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';

do $$
declare v_result jsonb;
begin
  v_result := public.equora_derive_capture_health_at_v1(
    'b25526c9-c0e7-4ace-a3d1-f8055de216c8', '2026-08-10T00:00:01Z'
  );
  if v_result ->> 'health' <> 'pending'
    or (v_result ->> 'missingLaneStateCount')::integer <> 12
  then
    raise exception 'TEST_CROSS_GENERATION_LANE_REUSE_ACCEPTED: %', v_result;
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.broker_sync_lane_states (
      id, user_id, broker_account_id, sync_activation_id, activation_generation,
      lane_requirement_id, provider_code, provider_contract_version,
      adapter_version, capability_id, capability_version, instrument_scope_key,
      lane_id, profile_id, profile_version, policy_generation,
      observation_status, created_at, updated_at
    ) values (
      '7a000000-0000-4000-8000-000000000020',
      '10000000-0000-4000-8000-000000000001',
      '14c6b264-99b8-4c74-a882-135b88e9d100',
      'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
      md5('lane-requirement-v2|historical_orders_v1')::uuid,
      'mexc', 'mexc_futures_contract_v1', 'v57_61_0',
      'historical_orders_v1', 'v1',
      'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
      'incremental_fast_6h', 'mexc_futures_rest', 'v1', 2,
      'not_observed', '2026-08-10T00:00:00Z', '2026-08-10T00:00:00Z'
    );
    raise exception 'TEST_DUPLICATE_CURRENT_LANE_STATE_WAS_ACCEPTED';
  exception when unique_violation then null;
  end;

  begin
    insert into public.broker_sync_gaps (
      id, user_id, broker_account_id, sync_activation_id, activation_generation,
      lane_state_id, capability_id, instrument_scope_key, lane_id, profile_id,
      profile_version, policy_generation, gap_from_ms, gap_to_ms, cause, status,
      reason_code, required_resolution_source, detected_at, last_checked_at,
      created_at, updated_at
    ) values (
      '6a000000-0000-4000-8000-000000000003',
      '20000000-0000-4000-8000-000000000002',
      '14c6b264-99b8-4c74-a882-135b88e9d100',
      'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
      md5('lane-health-state-v2|historical_orders_v1|incremental_fast_6h')::uuid,
      'historical_orders_v1',
      'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
      'incremental_fast_6h', 'mexc_futures_rest', 'v1', 2,
      1785801600000, 1785888000000, 'provider_error', 'open',
      'gap_unproven', 'complete_api_scope',
      '2026-08-10T00:00:00Z', '2026-08-10T00:00:00Z',
      '2026-08-10T00:00:00Z', '2026-08-10T00:00:00Z'
    );
    raise exception 'TEST_CROSS_TENANT_GAP_BINDING_WAS_ACCEPTED';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.broker_sync_gaps (
      id, user_id, broker_account_id, sync_activation_id, activation_generation,
      lane_state_id, capability_id, instrument_scope_key, lane_id, profile_id,
      profile_version, policy_generation, gap_from_ms, gap_to_ms, cause, status,
      reason_code, required_resolution_source, detected_at, last_checked_at,
      created_at, updated_at
    ) values (
      '6a000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000001',
      '14c6b264-99b8-4c74-a882-135b88e9d100',
      'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1,
      md5('lane-health-state-v2|historical_orders_v1|incremental_fast_6h')::uuid,
      'historical_orders_v1',
      'mexc_futures_symbol_v1:BTC_USDT:none:lane-authority',
      'incremental_fast_6h', 'mexc_futures_rest', 'v1', 2,
      1785801600000, 1785888000000, 'provider_error', 'reconciled',
      'gap_unproven', 'complete_api_scope',
      '2026-08-10T00:00:00Z', '2026-08-10T00:00:00Z',
      '2026-08-10T00:00:00Z', '2026-08-10T00:00:00Z'
    );
    raise exception 'TEST_UNEVIDENCED_GAP_RECONCILIATION_WAS_ACCEPTED';
  exception when check_violation then null;
  end;
end;
$$;

do $$
begin
  if has_table_privilege(
      'service_role', 'public.broker_sync_lane_requirements',
      'select,insert,update,delete'
    )
    or has_table_privilege(
      'service_role', 'public.broker_sync_lane_states',
      'select,insert,update,delete'
    )
    or has_table_privilege(
      'authenticated', 'public.broker_sync_gaps',
      'select,insert,update,delete'
    )
    or has_function_privilege(
      'service_role',
      'public.equora_derive_capture_health_at_v1(uuid,timestamp with time zone)',
      'execute'
    )
    or has_function_privilege(
      'service_role',
      'public.equora_lane_watermark_digest_v1(uuid,integer,uuid,text,text,text,text,text,bigint,text,bigint,text,text)',
      'execute'
    )
    or has_function_privilege(
      'service_role',
      'public.equora_gap_resolution_digest_v1(uuid,uuid,integer,uuid,text,text,text,text,text,bigint,bigint,bigint,boolean,boolean,text,uuid,text,text)',
      'execute'
    )
    or not has_function_privilege(
      'service_role', 'public.equora_derive_capture_health_v1(uuid)', 'execute'
    )
  then
    raise exception 'TEST_LANE_AUTHORITY_PRIVILEGE_BOUNDARY_INVALID';
  end if;
end;
$$;

grant select on public.broker_sync_lane_requirements,
  public.broker_sync_lane_states, public.broker_sync_gaps to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true
);
do $$
begin
  if (select count(*) from public.broker_sync_lane_requirements) <> 6
    or (select count(*) from public.broker_sync_lane_states) <> 15
    or (select count(*) from public.broker_sync_gaps) <> 1
  then
    raise exception 'TEST_LANE_AUTHORITY_OWNER_RLS_READ_INVALID';
  end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true
);
do $$
begin
  if (select count(*) from public.broker_sync_lane_requirements) <> 0
    or (select count(*) from public.broker_sync_lane_states) <> 0
    or (select count(*) from public.broker_sync_gaps) <> 0
  then
    raise exception 'TEST_LANE_AUTHORITY_CROSS_TENANT_RLS_LEAK';
  end if;
end;
$$;
reset role;

revoke select on public.broker_sync_lane_requirements,
  public.broker_sync_lane_states, public.broker_sync_gaps from authenticated;

set local role service_role;
select public.equora_derive_capture_health_v1(
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
);
reset role;

rollback;
