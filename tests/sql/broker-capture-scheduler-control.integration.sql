\set ON_ERROR_STOP on

-- Local-only G1 scheduler/lease integration. The runner creates an isolated
-- database and loads the synthetic persistence fixture before this file.

update public.broker_accounts
set status = 'active', retention_status = 'active'
where id = '14c6b264-99b8-4c74-a882-135b88e9d100'::uuid;

-- Cross-runtime golden vector shared with tests/mexc-sync-scope.test.ts.
grant equora_broker_capture_owner to postgres with set true;
set role equora_broker_capture_owner;
insert into equora_private.broker_capture_runtime_enrollment (
  singleton_key, user_id, provider_code, broker_account_id,
  max_accounts, max_symbols, enabled, enrolled_at, updated_at
) values (
  true,
  '10000000-0000-4000-8000-000000000001'::uuid,
  'mexc',
  '14c6b264-99b8-4c74-a882-135b88e9d100'::uuid,
  1, 5, true, clock_timestamp(), clock_timestamp()
);
do $$
begin
  if public.equora_stability_bucket_identity_digest_v1(
    'mexc', 'hmac-sha256', 'equora-tcj-v1',
    'broker_account_identity_v1', 'v1',
    'b4344a0ab1e23bfbaf955509ad112a25d88502a66980b84e0acb46405a0c739d',
    'unverified_reference',
    '14c6b264-99b8-4c74-a882-135b88e9d100'::uuid,
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8'::uuid,
    1, 'historical_orders_v1', 'mexc_futures_symbol_v1', 'BTC_USDT',
    null, 'mexc_futures_contract_v1', 'v57_61_0', 'mexc_futures_rest',
    'v1', 'mexc_provider_unverified_overlap_v1',
    1759881600000, 1759968000000, 'equora-tcj-v1'
  ) is distinct from
    'e5757fb14d774e9d8d4afc983862c0e6a09d32214727c450012d9cf4aa3c358e'
  then raise exception 'SCHEDULER_TCJ_BUCKET_GOLDEN_VECTOR_DRIFT'; end if;
end;
$$;
reset role;

update public.broker_sync_lane_states
set next_due_at = clock_timestamp() - interval '2 seconds'
where id = '26000000-0000-4000-8000-000000000012'::uuid;

set role service_role;
select public.equora_materialize_next_due_broker_capture_v1(
  '81000000-0000-4000-8000-000000000001'::uuid,
  'broker-capture-schedule-v1'
);
reset role;

do $$
declare
  v_occurrence public.broker_capture_schedule_occurrences%rowtype;
  v_scope public.broker_sync_scopes%rowtype;
begin
  select * into strict v_occurrence
  from public.broker_capture_schedule_occurrences
  where lane_state_id = '26000000-0000-4000-8000-000000000012'::uuid;
  select * into strict v_scope from public.broker_sync_scopes
  where id = v_occurrence.scope_id;
  if v_scope.bucket_count <> 7
    or v_scope.request_end_ms - v_scope.request_start_ms + 1
      <> 7 * 86400000::bigint
    or (select count(*) from public.broker_sync_scope_buckets
        where scope_id = v_scope.id) <> 7
    or (select min(bucket_start_ms) from public.broker_sync_scope_buckets
        where scope_id = v_scope.id) <> v_scope.request_start_ms
    or (select max(bucket_end_ms) from public.broker_sync_scope_buckets
        where scope_id = v_scope.id) <> v_scope.request_end_ms + 1
    or exists (
      select 1 from public.broker_sync_scope_buckets
      where scope_id = v_scope.id
        and bucket_end_ms - bucket_start_ms <> 86400000::bigint
    )
    or v_scope.stability_bucket_set_digest !~ '^[a-f0-9]{64}$'
  then raise exception 'SCHEDULER_7D_BUCKET_ORACLE_FAILED'; end if;
  if (select count(*) from public.broker_capture_runs) <> 1
    or (select count(*) from public.broker_capture_work_units) <> 1
    or (select count(*) from public.broker_capture_run_lane_inputs) <> 1
  then raise exception 'SCHEDULER_ATOMIC_MATERIALIZATION_FAILED'; end if;
end;
$$;

-- The complete child raster is authority evidence. Missing or tampered child
-- rows must fail the helper consumed by Activation lane-success.
set role equora_broker_capture_owner;
do $$
declare
  v_scope_id uuid;
begin
  select scope_id into strict v_scope_id
  from public.broker_capture_schedule_occurrences
  where lane_state_id = '26000000-0000-4000-8000-000000000012'::uuid;
  if public.equora_scope_bucket_set_valid_v1(v_scope_id) is distinct from true
  then raise exception 'SCHEDULER_BUCKET_SET_BASELINE_INVALID'; end if;
end;
$$;
reset role;

begin;
delete from public.broker_sync_scope_buckets
where scope_id = (
  select scope_id from public.broker_capture_schedule_occurrences
  where lane_state_id = '26000000-0000-4000-8000-000000000012'::uuid
) and bucket_ordinal = 6;
set role equora_broker_capture_owner;
do $$
declare
  v_scope_id uuid;
begin
  select scope_id into strict v_scope_id
  from public.broker_capture_schedule_occurrences
  where lane_state_id = '26000000-0000-4000-8000-000000000012'::uuid;
  if public.equora_scope_bucket_set_valid_v1(v_scope_id) is distinct from false
  then raise exception 'SCHEDULER_MISSING_BUCKET_WAS_ACCEPTED'; end if;
end;
$$;
reset role;
rollback;

begin;
update public.broker_sync_scope_buckets
set stability_bucket_digest = repeat('f', 64)
where scope_id = (
  select scope_id from public.broker_capture_schedule_occurrences
  where lane_state_id = '26000000-0000-4000-8000-000000000012'::uuid
) and bucket_ordinal = 6;
set role equora_broker_capture_owner;
do $$
declare
  v_scope_id uuid;
begin
  select scope_id into strict v_scope_id
  from public.broker_capture_schedule_occurrences
  where lane_state_id = '26000000-0000-4000-8000-000000000012'::uuid;
  if public.equora_scope_bucket_set_valid_v1(v_scope_id) is distinct from false
  then raise exception 'SCHEDULER_TAMPERED_BUCKET_WAS_ACCEPTED'; end if;
end;
$$;
reset role;
rollback;
revoke equora_broker_capture_owner from postgres;

-- Exact command replay is a no-op.
set role service_role;
select public.equora_materialize_next_due_broker_capture_v1(
  '81000000-0000-4000-8000-000000000001'::uuid,
  'broker-capture-schedule-v1'
);
reset role;

do $$
begin
  if (select count(*) from public.broker_capture_schedule_occurrences) <> 1
    or (select count(*) from public.broker_capture_runs) <> 1
    or (select count(*) from public.broker_capture_work_units) <> 1
  then raise exception 'SCHEDULER_EXACT_REPLAY_NOT_NOOP'; end if;
end;
$$;

-- An already materialized earliest Lane must not starve the next due Lane.
update public.broker_sync_lane_states
set next_due_at = clock_timestamp() - interval '1 second'
where id = '26000000-0000-4000-8000-000000000013'::uuid;
set role service_role;
select public.equora_materialize_next_due_broker_capture_v1(
  '81000000-0000-4000-8000-000000000002'::uuid,
  'broker-capture-schedule-v1'
);
reset role;

do $$
declare
  v_scope public.broker_sync_scopes%rowtype;
begin
  select scope.* into strict v_scope
  from public.broker_capture_schedule_occurrences occurrence
  join public.broker_sync_scopes scope on scope.id = occurrence.scope_id
  where occurrence.lane_state_id =
    '26000000-0000-4000-8000-000000000013'::uuid;
  if v_scope.bucket_count <> 28
    or v_scope.request_end_ms - v_scope.request_start_ms + 1
      <> 28 * 86400000::bigint
    or (select count(*) from public.broker_sync_scope_buckets
        where scope_id = v_scope.id) <> 28
    or (select count(*) from public.broker_capture_schedule_occurrences) <> 2
  then raise exception 'SCHEDULER_28D_OR_STARVATION_ORACLE_FAILED'; end if;
end;
$$;

select work_unit_id as seven_work_unit_id
from public.broker_capture_schedule_occurrences
where lane_state_id = '26000000-0000-4000-8000-000000000012'::uuid
\gset

set role service_role;
select public.equora_claim_broker_capture_work_unit_v2(
  :'seven_work_unit_id'::uuid, 0,
  '91000000-0000-4000-8000-000000000001'::uuid,
  '92000000-0000-4000-8000-000000000001'::uuid,
  'broker-capture-claim-v1'
);
select public.equora_renew_broker_capture_lease_v1(
  :'seven_work_unit_id'::uuid, 1,
  '92000000-0000-4000-8000-000000000001'::uuid,
  '93000000-0000-4000-8000-000000000001'::uuid,
  'lease-control-v1'
);
select public.equora_renew_broker_capture_lease_v1(
  :'seven_work_unit_id'::uuid, 1,
  '92000000-0000-4000-8000-000000000001'::uuid,
  '93000000-0000-4000-8000-000000000001'::uuid,
  'lease-control-v1'
);
reset role;

do $$
declare
  v_work_unit public.broker_capture_work_units%rowtype;
  v_slot public.broker_capture_account_leases%rowtype;
begin
  select * into strict v_work_unit from public.broker_capture_work_units
  where id = (
    select work_unit_id from public.broker_capture_schedule_occurrences
    where lane_state_id = '26000000-0000-4000-8000-000000000012'::uuid
  );
  select * into strict v_slot from public.broker_capture_account_leases
  where broker_account_id = v_work_unit.broker_account_id
    and sync_kind = 'provider_api_observation';
  if v_work_unit.status <> 'leased' or v_work_unit.row_version <> 2
    or v_work_unit.lease_epoch <> 2 or v_work_unit.lease_renew_count <> 1
    or v_slot.state <> 'leased'
    or v_slot.work_unit_id <> v_work_unit.id
    or v_slot.work_unit_row_version <> v_work_unit.row_version
    or v_slot.lease_epoch <> v_work_unit.lease_epoch
    or v_slot.lease_token_digest <> v_work_unit.lease_token_digest
    or (select count(*) from public.broker_capture_lease_events
        where work_unit_id = v_work_unit.id and event_kind = 'renew') <> 1
  then raise exception 'LEASE_RENEW_OR_REPLAY_ORACLE_FAILED'; end if;
end;
$$;

-- Exercise the real fenced Page-v2 wrapper and its owner-only Page-v1 core
-- with a full 20-row page. A full bare array is non-terminal (`continue`), so
-- the Work-Unit row version and the account/sync-kind Lease mirror must advance
-- atomically before the next request can be authorized.
select checkpoint_mac as seven_page_checkpoint_mac
from public.broker_capture_work_units
where id = :'seven_work_unit_id'::uuid
\gset

set role service_role;
select public.equora_authorize_broker_capture_request_v1(
  :'seven_work_unit_id'::uuid, 2, 1, :'seven_page_checkpoint_mac',
  '92000000-0000-4000-8000-000000000001'::uuid,
  '97000000-0000-4000-8000-000000000001'::uuid
);
reset role;

create or replace function pg_temp.commit_scheduler_continue_page(
  p_work_unit_id uuid,
  p_expected_work_unit_row_version bigint,
  p_lease_token uuid,
  p_request_authorization_id uuid,
  p_request_result_id uuid,
  p_outcome text default 'continue'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_unit public.broker_capture_work_units%rowtype;
  v_scope public.broker_sync_scopes%rowtype;
  v_activation public.broker_sync_activations%rowtype;
  v_identity public.broker_account_identities%rowtype;
  v_authorization public.broker_capture_request_authorizations%rowtype;
  v_ledger_generation bigint;
  v_integrity_key bytea;
  v_request_started_at timestamptz;
  v_response_received_at timestamptz;
  v_request_query jsonb;
  v_body_records jsonb := '[]'::jsonb;
  v_body_json jsonb;
  v_raw_body bytea;
  v_raw_body_base64 text;
  v_raw_body_digest text;
  v_raw_body_bytes integer;
  v_event_identities jsonb := '[]'::jsonb;
  v_ordered_digests jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_provider_ids text[] := '{}'::text[];
  v_sequence_payload bytea := decode('', 'hex');
  v_sequence_part text;
  v_sequence_digest text;
  v_cursor jsonb;
  v_page_metadata jsonb;
  v_page_digest text;
  v_next_checkpoint jsonb;
  v_next_checkpoint_mac text;
  v_transition_payload jsonb;
  v_transition_mac text;
  v_record jsonb;
  v_provider_id text;
  v_provider_time_ms bigint;
  v_provider_occurred_at_us text;
  v_observed_at_us text;
  v_raw_event_digest text;
  v_observation_digest text;
  v_membership_key text;
  v_index integer;
  v_record_count integer;
  v_checkpoint_status text;
  v_checkpoint_reason text;
  v_terminal_evidence text;
  v_scope_completeness text;
begin
  if p_outcome = 'continue' then
    v_record_count := 20;
    v_checkpoint_status := 'continue';
    v_checkpoint_reason := 'page_committed';
    v_terminal_evidence := 'none';
    v_scope_completeness := 'unverified';
  elsif p_outcome = 'terminal_observed' then
    v_record_count := 1;
    v_checkpoint_status := 'terminal_observed';
    v_checkpoint_reason := 'terminal_short_bare_array';
    v_terminal_evidence := 'short_bare_array';
    v_scope_completeness := 'unverified';
  elsif p_outcome = 'loop_blocked' then
    v_record_count := 20;
    v_checkpoint_status := 'loop_blocked';
    v_checkpoint_reason := 'repeated_page_without_cursor_progress';
    v_terminal_evidence := 'none';
    v_scope_completeness := 'partial';
  else
    raise exception 'TEST_SCHEDULER_PAGE_OUTCOME_INVALID';
  end if;

  select * into strict v_work_unit
  from public.broker_capture_work_units
  where id = p_work_unit_id;
  select * into strict v_scope
  from public.broker_sync_scopes
  where id = v_work_unit.scope_id;
  select * into strict v_activation
  from public.broker_sync_activations
  where id = v_work_unit.sync_activation_id;
  select * into strict v_identity
  from public.broker_account_identities
  where broker_account_id = v_work_unit.broker_account_id
    and user_id = v_work_unit.user_id
    and hmac_digest = v_scope.account_identity_digest
    and hmac_key_version = v_scope.account_identity_key_version;
  select * into strict v_authorization
  from public.broker_capture_request_authorizations
  where id = p_request_authorization_id;
  select ledger_generation into strict v_ledger_generation
  from public.broker_accounts
  where id = v_work_unit.broker_account_id;
  select key_material into strict v_integrity_key
  from equora_private.broker_capture_integrity_keys
  where id = v_activation.capture_integrity_key_id
    and key_version = v_activation.capture_integrity_key_version;

  v_request_started_at := v_authorization.consumed_at;
  v_response_received_at := greatest(clock_timestamp(), v_request_started_at);
  v_observed_at_us :=
    (extract(epoch from v_response_received_at) * 1000000)::bigint::text;
  v_request_query := jsonb_build_object(
    'symbol', v_scope.instrument_symbol,
    'start_time', v_scope.request_start_ms::text,
    'end_time', v_scope.request_end_ms::text,
    'page_num', '1',
    'page_size', '20'
  );

  for v_index in 0..v_record_count - 1 loop
    v_provider_id := (7000000000000000000::bigint + v_index)::text;
    v_provider_time_ms :=
      v_scope.request_end_ms - (v_record_count - v_index) * 1000;
    v_record := jsonb_build_object(
      'orderId', v_provider_id,
      'createTime', v_provider_time_ms,
      'symbol', v_scope.instrument_symbol,
      'state', 3
    );
    v_body_records := v_body_records || jsonb_build_array(v_record);
    v_provider_ids := array_append(v_provider_ids, v_provider_id);
  end loop;

  v_body_json := jsonb_build_object(
    'success', true, 'code', 0, 'data', v_body_records
  );
  v_raw_body := convert_to(v_body_json::text, 'UTF8');
  v_raw_body_base64 := replace(replace(
    encode(v_raw_body, 'base64'), chr(10), ''
  ), chr(13), '');
  v_raw_body_digest := public.equora_raw_response_body_digest_v1(v_raw_body);
  v_raw_body_bytes := octet_length(v_raw_body);

  for v_index in 0..v_record_count - 1 loop
    v_record := v_body_records -> v_index;
    v_provider_id := v_record ->> 'orderId';
    v_provider_time_ms := (v_record ->> 'createTime')::bigint;
    v_provider_occurred_at_us := (v_provider_time_ms * 1000)::text;
    v_raw_event_digest := public.equora_raw_event_content_digest_v1(
      v_scope.provider_code,
      v_scope.provider_contract_version,
      v_scope.endpoint_id,
      'order',
      'stable_provider_id',
      v_provider_id,
      'unverified',
      null,
      v_provider_occurred_at_us,
      v_record
    );
    v_event_identities := v_event_identities || jsonb_build_array(
      jsonb_build_object(
        'eventType', 'order',
        'identityStatus', 'stable_provider_id',
        'externalEventId', v_provider_id,
        'providerOrderTimeMs', v_provider_time_ms,
        'revisionDiscriminator', 'payload_hash_fallback',
        'revisionDiscriminatorValue', v_raw_event_digest,
        'rawEventContentDigest', v_raw_event_digest
      )
    );
    v_ordered_digests := v_ordered_digests || jsonb_build_array(
      jsonb_build_object(
        'digestAlgorithm', 'sha256',
        'digestContractVersion', 'equora-tcj-v1',
        'domain', 'raw_event_content',
        'digest', v_raw_event_digest
      )
    );
  end loop;

  v_cursor := jsonb_build_object(
    'providerTimeMs',
      (v_body_records -> (v_record_count - 1) ->> 'createTime')::bigint,
    'providerId', v_body_records -> (v_record_count - 1) ->> 'orderId'
  );
  v_page_digest := public.equora_page_observation_digest_v1(
    v_scope.provider_code,
    v_scope.capability_id,
    v_scope.endpoint_id,
    v_scope.scope_digest,
    1,
    v_scope.instrument_symbol,
    v_scope.request_start_ms,
    v_scope.request_end_ms,
    20,
    v_scope.position_type,
    v_scope.source_channel,
    v_scope.profile_id,
    v_scope.profile_version,
    v_scope.provider_contract_version,
    v_scope.adapter_version,
    v_raw_body_digest,
    v_raw_body_bytes,
    v_cursor,
    'null'::jsonb,
    'valid_read_preview_only',
    v_scope_completeness,
    v_terminal_evidence,
    v_event_identities
  );
  v_page_metadata := jsonb_build_object(
    'requestPageNumber', 1,
    'requestScope', jsonb_build_object(
      'symbol', v_scope.instrument_symbol,
      'startTimeMs', v_scope.request_start_ms,
      'endTimeMs', v_scope.request_end_ms,
      'pageSize', 20,
      'positionType', v_scope.position_type
    ),
    'terminalEvidence', v_terminal_evidence,
    'providerPage', null,
    'cursor', v_cursor,
    'orderedRawEventContentDigests', v_ordered_digests,
    'authorityBlocked', true
  );

  v_sequence_payload := v_sequence_payload || convert_to(
    octet_length(convert_to('mexc-ordered-provider-identity-sequence-v1', 'UTF8'))::text
      || ':mexc-ordered-provider-identity-sequence-v1|',
    'UTF8'
  );
  v_sequence_part := v_work_unit.checkpoint ->>
    'orderedProviderIdentitySequenceDigest';
  v_sequence_payload := v_sequence_payload || convert_to(
    octet_length(convert_to(v_sequence_part, 'UTF8'))::text
      || ':' || v_sequence_part || '|',
    'UTF8'
  );
  foreach v_sequence_part in array v_provider_ids loop
    v_sequence_payload := v_sequence_payload || convert_to(
      octet_length(convert_to(v_sequence_part, 'UTF8'))::text
        || ':' || v_sequence_part || '|',
      'UTF8'
    );
  end loop;
  v_sequence_digest := encode(
    public.equora_pgcrypto_digest_v1(v_sequence_payload, 'sha256'), 'hex'
  );

  for v_index in 0..v_record_count - 1 loop
    v_record := v_body_records -> v_index;
    v_provider_id := v_record ->> 'orderId';
    v_provider_time_ms := (v_record ->> 'createTime')::bigint;
    v_provider_occurred_at_us := (v_provider_time_ms * 1000)::text;
    v_raw_event_digest := v_event_identities -> v_index ->>
      'rawEventContentDigest';
    v_observation_digest := public.equora_raw_event_observation_digest_v1(
      v_page_digest, v_raw_event_digest, v_work_unit.run_id,
      p_request_result_id, v_index, 'first_observation'
    );
    v_membership_key :=
      octet_length(v_scope.provider_code)::text || ':'
        || v_scope.provider_code || '|'
      || octet_length(v_identity.digest_algorithm)::text || ':'
        || v_identity.digest_algorithm || '|'
      || octet_length(v_identity.digest_contract_version)::text || ':'
        || v_identity.digest_contract_version || '|'
      || octet_length(v_identity.digest_purpose)::text || ':'
        || v_identity.digest_purpose || '|'
      || octet_length(v_scope.account_identity_key_version)::text || ':'
        || v_scope.account_identity_key_version || '|'
      || octet_length(v_scope.account_identity_digest)::text || ':'
        || v_scope.account_identity_digest || '|'
      || '5:order|'
      || octet_length(v_provider_id)::text || ':' || v_provider_id || '|'
      || '21:payload_hash_fallback|64:' || v_raw_event_digest;
    v_events := v_events || jsonb_build_array(jsonb_build_object(
      'accountIdentityDigest', v_scope.account_identity_digest,
      'digestAlgorithm', 'sha256',
      'digestContractVersion', 'equora-tcj-v1',
      'endpointId', v_scope.endpoint_id,
      'eventIndex', v_index,
      'eventType', 'order',
      'externalEventId', v_provider_id,
      'firstObservedAtUs', v_observed_at_us,
      'identityStatus', 'stable_provider_id',
      'membershipKey', v_membership_key,
      'observationDigest', v_observation_digest,
      'observedAtUs', v_observed_at_us,
      'occurrence', 'first_observation',
      'pageObservationDigest', v_page_digest,
      'providerCode', v_scope.provider_code,
      'providerContractVersion', v_scope.provider_contract_version,
      'providerOccurredAtUs', v_provider_occurred_at_us,
      'providerRevision', null,
      'providerRevisionAuthority', 'unverified',
      'rawEventContentDigest', v_raw_event_digest,
      'rawPayloadJson', v_record::text,
      'revisionDiscriminator', 'payload_hash_fallback',
      'revisionDiscriminatorValue', v_raw_event_digest
    ));
  end loop;

  v_next_checkpoint := v_work_unit.checkpoint || jsonb_build_object(
    'status', v_checkpoint_status,
    'reason', v_checkpoint_reason,
    'nextPageNumber', 2,
    'unitSuccessfulPages',
      (v_work_unit.checkpoint ->> 'unitSuccessfulPages')::integer + 1,
    'unitRequestAttempts',
      (v_work_unit.checkpoint ->> 'unitRequestAttempts')::integer + 1,
    'unitRawEvents',
      (v_work_unit.checkpoint ->> 'unitRawEvents')::integer + v_record_count,
    'unitResponseBytes',
      (v_work_unit.checkpoint ->> 'unitResponseBytes')::integer
        + v_raw_body_bytes,
    'unitElapsedMs',
      (v_work_unit.checkpoint ->> 'unitElapsedMs')::integer + 1,
    'totalSuccessfulPages',
      (v_work_unit.checkpoint ->> 'totalSuccessfulPages')::integer + 1,
    'totalRequestAttempts',
      (v_work_unit.checkpoint ->> 'totalRequestAttempts')::integer + 1,
    'totalRawEvents',
      (v_work_unit.checkpoint ->> 'totalRawEvents')::integer + v_record_count,
    'totalResponseBytes',
      (v_work_unit.checkpoint ->> 'totalResponseBytes')::integer
        + v_raw_body_bytes,
    'totalElapsedMs',
      (v_work_unit.checkpoint ->> 'totalElapsedMs')::integer + 1,
    'terminalEvidence', v_terminal_evidence,
    'lastCursor', jsonb_build_object(
      'providerTime', v_cursor ->> 'providerTimeMs',
      'providerId', v_cursor ->> 'providerId'
    ),
    'lastPageFingerprint', v_page_digest,
    'seenPageFingerprints',
      (v_work_unit.checkpoint -> 'seenPageFingerprints')
        || jsonb_build_array(v_page_digest),
    'orderedProviderIdentitySequenceDigest', v_sequence_digest,
    'lastErrorCode', null,
    'suggestedBackoffMs', null,
    'retryNotBeforeMs', null
  );
  v_next_checkpoint_mac := public.equora_mexc_checkpoint_mac_v1(
    v_next_checkpoint, v_integrity_key
  );
  v_next_checkpoint := v_next_checkpoint || jsonb_build_object(
    'checkpointMac', v_next_checkpoint_mac
  );

  v_transition_payload := jsonb_build_object(
    'p_work_unit_id', v_work_unit.id::text,
    'p_expected_run_id', v_work_unit.run_id::text,
    'p_expected_broker_account_id', v_work_unit.broker_account_id::text,
    'p_expected_connection_account_id',
      v_activation.connection_account_id::text,
    'p_expected_sync_activation_id', v_work_unit.sync_activation_id::text,
    'p_expected_activation_generation', v_work_unit.activation_generation,
    'p_expected_scope_digest', v_scope.scope_digest,
    'p_transition_mac_version',
      'equora-broker-capture-transition-hmac-sha256-v1',
    'p_transition_integrity_key_version', v_activation.capture_integrity_key_version,
    'p_lease_token', p_lease_token::text,
    'p_expected_work_unit_row_version', p_expected_work_unit_row_version,
    'p_expected_checkpoint_mac', v_work_unit.checkpoint_mac,
    'p_expected_ledger_generation', v_ledger_generation,
    'p_request_result_id', p_request_result_id::text,
    'p_request_sequence', 1,
    'p_method', 'GET',
    'p_request_origin', 'https://api.mexc.com',
    'p_request_path', '/api/v1/private/order/list/history_orders',
    'p_request_query', v_request_query,
    'p_transport_contract_version', 'mexc-readonly-transport-v1',
    'p_request_started_at', to_char(
      v_request_started_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'p_response_received_at', to_char(
      v_response_received_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'p_request_duration_ms', 1,
    'p_http_status', 200,
    'p_provider_status_class', 'success',
    'p_response_classification', 'valid_read_preview_only',
    'p_raw_body_base64', v_raw_body_base64,
    'p_raw_body_digest', v_raw_body_digest,
    'p_raw_body_bytes', v_raw_body_bytes,
    'p_page_observation_digest', v_page_digest,
    'p_page_metadata', v_page_metadata,
    'p_scope_completeness', v_scope_completeness,
    'p_next_checkpoint', v_next_checkpoint,
    'p_next_checkpoint_mac', v_next_checkpoint_mac,
    'p_next_checkpoint_status', v_checkpoint_status,
    'p_next_checkpoint_reason', v_checkpoint_reason,
    'p_next_page_number', 2,
    'p_events', v_events
  );
  v_transition_mac := public.equora_capture_transition_mac_v1(
    v_transition_payload, v_integrity_key
  );

  return public.equora_commit_broker_capture_page_v2(
    p_request_authorization_id => p_request_authorization_id,
    p_work_unit_id => v_work_unit.id,
    p_expected_run_id => v_work_unit.run_id,
    p_expected_broker_account_id => v_work_unit.broker_account_id,
    p_expected_connection_account_id => v_activation.connection_account_id,
    p_expected_sync_activation_id => v_work_unit.sync_activation_id,
    p_expected_activation_generation => v_work_unit.activation_generation,
    p_expected_scope_digest => v_scope.scope_digest,
    p_transition_mac_version =>
      'equora-broker-capture-transition-hmac-sha256-v1',
    p_transition_integrity_key_version =>
      v_activation.capture_integrity_key_version,
    p_transition_mac => v_transition_mac,
    p_lease_token => p_lease_token,
    p_expected_work_unit_row_version => p_expected_work_unit_row_version,
    p_expected_checkpoint_mac => v_work_unit.checkpoint_mac,
    p_expected_ledger_generation => v_ledger_generation,
    p_request_result_id => p_request_result_id,
    p_request_sequence => 1,
    p_method => 'GET',
    p_request_origin => 'https://api.mexc.com',
    p_request_path => '/api/v1/private/order/list/history_orders',
    p_request_query => v_request_query,
    p_transport_contract_version => 'mexc-readonly-transport-v1',
    p_request_started_at => v_request_started_at,
    p_response_received_at => v_response_received_at,
    p_request_duration_ms => 1,
    p_http_status => 200,
    p_provider_status_class => 'success',
    p_response_classification => 'valid_read_preview_only',
    p_raw_body_base64 => v_raw_body_base64,
    p_raw_body_digest => v_raw_body_digest,
    p_raw_body_bytes => v_raw_body_bytes,
    p_page_observation_digest => v_page_digest,
    p_page_metadata => v_page_metadata,
    p_scope_completeness => v_scope_completeness,
    p_next_checkpoint => v_next_checkpoint,
    p_next_checkpoint_mac => v_next_checkpoint_mac,
    p_next_checkpoint_status => v_checkpoint_status,
    p_next_checkpoint_reason => v_checkpoint_reason,
    p_next_page_number => 2,
    p_events => v_events
  );
end;
$$;

set role service_role;
select pg_temp.commit_scheduler_continue_page(
  :'seven_work_unit_id'::uuid,
  2,
  '92000000-0000-4000-8000-000000000001'::uuid,
  '97000000-0000-4000-8000-000000000001'::uuid,
  '97100000-0000-4000-8000-000000000001'::uuid
);
reset role;

do $$
declare
  v_work_unit public.broker_capture_work_units%rowtype;
  v_slot public.broker_capture_account_leases%rowtype;
  v_authorization public.broker_capture_request_authorizations%rowtype;
begin
  select * into strict v_work_unit
  from public.broker_capture_work_units
  where id = (
    select work_unit_id
    from public.broker_capture_schedule_occurrences
    where lane_state_id = '26000000-0000-4000-8000-000000000012'::uuid
  );
  select * into strict v_slot
  from public.broker_capture_account_leases
  where broker_account_id = v_work_unit.broker_account_id
    and sync_kind = 'provider_api_observation';
  select * into strict v_authorization
  from public.broker_capture_request_authorizations
  where id = '97000000-0000-4000-8000-000000000001'::uuid;
  if v_work_unit.status <> 'running'
    or v_work_unit.row_version <> 3
    or v_work_unit.request_sequence <> 1
    or v_work_unit.successful_page_count <> 1
    or v_work_unit.observed_event_count <> 20
    or v_slot.state <> 'leased'
    or v_slot.work_unit_id <> v_work_unit.id
    or v_slot.work_unit_row_version <> v_work_unit.row_version
    or v_slot.lease_epoch <> v_work_unit.lease_epoch
    or v_slot.lease_token_digest <> v_work_unit.lease_token_digest
    or v_authorization.page_commit_input_digest is null
    or v_authorization.page_commit_result ->> 'status' <> 'page_committed'
    or v_authorization.page_committed_at is null
    or (select count(*) from public.broker_provider_request_results
        where work_unit_id = v_work_unit.id) <> 1
    or (select count(*) from public.broker_capture_raw_events
        where provider_code = 'mexc'
          and account_identity_digest = (
            select scope.account_identity_digest
            from public.broker_sync_scopes scope
            where scope.id = v_work_unit.scope_id
          )
          and external_event_id between '7000000000000000000'
            and '7000000000000000019') <> 20
  then raise exception 'PAGE_CONTINUE_ACCOUNT_LEASE_MIRROR_ORACLE_FAILED'; end if;
end;
$$;

set role service_role;
select public.equora_release_broker_capture_lease_v1(
  :'seven_work_unit_id'::uuid, 3,
  '92000000-0000-4000-8000-000000000001'::uuid,
  '94000000-0000-4000-8000-000000000001'::uuid,
  'cooperative_shutdown', 'lease-control-v1'
);
select public.equora_claim_broker_capture_work_unit_v2(
  :'seven_work_unit_id'::uuid, 4,
  '95000000-0000-4000-8000-000000000001'::uuid,
  '96000000-0000-4000-8000-000000000001'::uuid,
  'broker-capture-claim-v1'
);
reset role;

select checkpoint_mac as seven_checkpoint_mac
from public.broker_capture_work_units
where id = :'seven_work_unit_id'::uuid
\gset

set role service_role;
select public.equora_authorize_broker_capture_request_v1(
  :'seven_work_unit_id'::uuid, 5, 2, :'seven_checkpoint_mac',
  '96000000-0000-4000-8000-000000000001'::uuid,
  '97000000-0000-4000-8000-000000000002'::uuid
);
select public.equora_release_broker_capture_lease_v1(
  :'seven_work_unit_id'::uuid, 5,
  '96000000-0000-4000-8000-000000000001'::uuid,
  '98000000-0000-4000-8000-000000000001'::uuid,
  'cooperative_shutdown', 'lease-control-v1'
);
reset role;

do $$
declare
  v_work_unit public.broker_capture_work_units%rowtype;
  v_slot public.broker_capture_account_leases%rowtype;
begin
  select * into strict v_work_unit from public.broker_capture_work_units
  where id = (
    select work_unit_id from public.broker_capture_schedule_occurrences
    where lane_state_id = '26000000-0000-4000-8000-000000000012'::uuid
  );
  select * into strict v_slot from public.broker_capture_account_leases
  where broker_account_id = v_work_unit.broker_account_id
    and sync_kind = 'provider_api_observation';
  if v_work_unit.status <> 'recovery_pending'
    or v_work_unit.recovery_state <> 'uncertain_egress'
    or v_work_unit.row_version <> 6 or v_work_unit.lease_token_digest is not null
    or v_slot.state <> 'available' or v_slot.work_unit_id is not null
  then raise exception 'LEASE_UNCERTAIN_EGRESS_ORACLE_FAILED'; end if;
end;
$$;

-- Simulate a worker crash after the Permit became lease-free. The original
-- five-second send window plus the explicit 30-second quiescence margin are
-- already past, so the bounded recovery pass must make the row claimable
-- again instead of leaving a permanent recovery_pending orphan.
update public.broker_capture_request_authorizations
set consumed_at = clock_timestamp() - interval '60 seconds',
    send_deadline_at = clock_timestamp() - interval '56 seconds'
where id = '97000000-0000-4000-8000-000000000002'::uuid;

do $$
begin
  if exists (
    select 1 from public.broker_capture_request_authorizations
    where id = '97000000-0000-4000-8000-000000000002'::uuid
      and page_commit_input_digest is not null
  ) then raise exception 'QUIESCENT_FIXTURE_PAGE_ALREADY_RESOLVED'; end if;
  if exists (
    select 1
    from public.broker_capture_attempt_outcomes outcome
    join public.broker_capture_request_authorizations authorization_row
      on authorization_row.id = '97000000-0000-4000-8000-000000000002'::uuid
      and outcome.work_unit_id = authorization_row.work_unit_id
      and outcome.expected_work_unit_row_version = authorization_row.work_unit_row_version
      and outcome.request_sequence = authorization_row.request_sequence
  ) then raise exception 'QUIESCENT_FIXTURE_OUTCOME_ALREADY_RESOLVED'; end if;
end;
$$;

set role service_role;
select public.equora_recover_expired_broker_capture_leases_v1(
  '99000000-0000-4000-8000-000000000001'::uuid,
  5, 'lease-control-v1'
);
select public.equora_recover_expired_broker_capture_leases_v1(
  '99000000-0000-4000-8000-000000000001'::uuid,
  5, 'lease-control-v1'
);
reset role;

do $$
declare
  v_work_unit public.broker_capture_work_units%rowtype;
  v_recovery public.broker_capture_recovery_commands%rowtype;
begin
  select * into strict v_work_unit
  from public.broker_capture_work_units
  where id = (
    select work_unit_id from public.broker_capture_schedule_occurrences
    where lane_state_id = '26000000-0000-4000-8000-000000000012'::uuid
  );
  select * into strict v_recovery
  from public.broker_capture_recovery_commands
  where request_id = '99000000-0000-4000-8000-000000000001'::uuid;
  if v_work_unit.status <> 'retry_pending'
    or v_work_unit.recovery_state <> 'none'
    or v_work_unit.row_version <> 7
    or v_work_unit.lease_token_digest is not null
    or v_recovery.status <> 'applied'
    or (v_recovery.result ->> 'inspectedCount')::integer <> 1
    or (v_recovery.result ->> 'requeuedCount')::integer <> 1
    or (v_recovery.result ->> 'uncertainEgressCount')::integer <> 0
    or (select count(*) from public.broker_capture_lease_events
        where request_id = v_recovery.request_id
          and event_kind = 'uncertain_egress_resolution'
          and result_code = 'quiescent_requeue') <> 1
  then raise exception 'QUIESCENT_UNCERTAIN_EGRESS_RECOVERY_OR_REPLAY_FAILED'; end if;
end;
$$;

select work_unit_id as audit_work_unit_id
from public.broker_capture_schedule_occurrences
where lane_state_id = '26000000-0000-4000-8000-000000000013'::uuid
\gset

set role service_role;
select public.equora_claim_broker_capture_work_unit_v2(
  :'audit_work_unit_id'::uuid, 0,
  'a1000000-0000-4000-8000-000000000001'::uuid,
  'a2000000-0000-4000-8000-000000000001'::uuid,
  'broker-capture-claim-v1'
);
reset role;

select checkpoint_mac as audit_checkpoint_mac
from public.broker_capture_work_units
where id = :'audit_work_unit_id'::uuid
\gset

-- Deliberate privileged fixture drift: all three downstream authorities must
-- reject the stale account/sync-kind Lease before any partial effect.
update public.broker_capture_account_leases
set work_unit_row_version = 0
where broker_account_id = '14c6b264-99b8-4c74-a882-135b88e9d100'::uuid
  and sync_kind = 'provider_api_observation';

do $$
declare
  v_work_unit public.broker_capture_work_units%rowtype;
begin
  select work_unit.* into strict v_work_unit
  from public.broker_capture_work_units work_unit
  join public.broker_capture_schedule_occurrences occurrence
    on occurrence.work_unit_id = work_unit.id
  where occurrence.lane_state_id =
    '26000000-0000-4000-8000-000000000013'::uuid;
  perform public.equora_authorize_broker_capture_request_v1(
    v_work_unit.id, 1, 1, v_work_unit.checkpoint_mac,
    'a2000000-0000-4000-8000-000000000001'::uuid,
    'a3000000-0000-4000-8000-000000000001'::uuid
  );
  raise exception 'EXPECTED_REQUEST_AUTH_ACCOUNT_LEASE_REJECTION';
exception when others then
  if sqlerrm <> 'REQUEST_AUTH_ACCOUNT_LEASE_INVALID' then raise; end if;
end;
$$;

do $$
begin
  if exists (select 1 from public.broker_capture_request_authorizations
      where id = 'a3000000-0000-4000-8000-000000000001'::uuid)
    or (select work_unit.row_version
        from public.broker_capture_work_units work_unit
        join public.broker_capture_schedule_occurrences occurrence
          on occurrence.work_unit_id = work_unit.id
        where occurrence.lane_state_id =
          '26000000-0000-4000-8000-000000000013'::uuid) <> 1
  then raise exception 'REQUEST_AUTH_ACCOUNT_LEASE_PARTIAL_EFFECT'; end if;
end;
$$;

update public.broker_capture_account_leases
set work_unit_row_version = 1
where broker_account_id = '14c6b264-99b8-4c74-a882-135b88e9d100'::uuid
  and sync_kind = 'provider_api_observation';

set role service_role;
select public.equora_authorize_broker_capture_request_v1(
  :'audit_work_unit_id'::uuid, 1, 1, :'audit_checkpoint_mac',
  'a2000000-0000-4000-8000-000000000001'::uuid,
  'a3000000-0000-4000-8000-000000000002'::uuid
);
reset role;

select consumed_at as audit_request_started_at,
  page_scope_digest as audit_page_scope_digest,
  capability_id as audit_capability_id
from public.broker_capture_request_authorizations
where id = 'a3000000-0000-4000-8000-000000000002'::uuid
\gset

update public.broker_capture_account_leases
set work_unit_row_version = 0
where broker_account_id = '14c6b264-99b8-4c74-a882-135b88e9d100'::uuid
  and sync_kind = 'provider_api_observation';

do $$
declare
  v_work_unit public.broker_capture_work_units%rowtype;
  v_authorization public.broker_capture_request_authorizations%rowtype;
begin
  select work_unit.* into strict v_work_unit
  from public.broker_capture_work_units work_unit
  join public.broker_capture_schedule_occurrences occurrence
    on occurrence.work_unit_id = work_unit.id
  where occurrence.lane_state_id =
    '26000000-0000-4000-8000-000000000013'::uuid;
  select * into strict v_authorization
  from public.broker_capture_request_authorizations
  where id = 'a3000000-0000-4000-8000-000000000002'::uuid;
  perform public.equora_record_broker_capture_failure_v2(
    'a3000000-0000-4000-8000-000000000002'::uuid,
    v_authorization.consumed_at, v_work_unit.id, 1,
    'a4000000-0000-4000-8000-000000000001'::uuid,
    'a2000000-0000-4000-8000-000000000001'::uuid, 1,
    v_work_unit.checkpoint_mac, v_authorization.capability_id,
    v_authorization.page_scope_digest, 'HTTP_RETRYABLE', 503, 0, 10,
    'broker-capture-failure-v1'
  );
  raise exception 'EXPECTED_FAILURE_ACCOUNT_LEASE_REJECTION';
exception when others then
  if sqlerrm <> 'FAILURE_ACCOUNT_LEASE_INVALID' then raise; end if;
end;
$$;

do $$
declare
  v_work_unit_id uuid;
  v_request_started_at timestamptz;
begin
  select occurrence.work_unit_id into strict v_work_unit_id
  from public.broker_capture_schedule_occurrences occurrence
  where occurrence.lane_state_id =
    '26000000-0000-4000-8000-000000000013'::uuid;
  select consumed_at into strict v_request_started_at
  from public.broker_capture_request_authorizations
  where id = 'a3000000-0000-4000-8000-000000000002'::uuid;
  perform public.equora_commit_broker_capture_page_v2(
    p_request_authorization_id =>
      'a3000000-0000-4000-8000-000000000002'::uuid,
    p_work_unit_id => v_work_unit_id,
    p_expected_run_id => null, p_expected_broker_account_id => null,
    p_expected_connection_account_id => null,
    p_expected_sync_activation_id => null,
    p_expected_activation_generation => null, p_expected_scope_digest => null,
    p_transition_mac_version => null,
    p_transition_integrity_key_version => null, p_transition_mac => null,
    p_lease_token => 'a2000000-0000-4000-8000-000000000001'::uuid,
    p_expected_work_unit_row_version => 1,
    p_expected_checkpoint_mac => null, p_expected_ledger_generation => null,
    p_request_result_id => null, p_request_sequence => null,
    p_method => null, p_request_origin => null, p_request_path => null,
    p_request_query => null, p_transport_contract_version => null,
    p_request_started_at => v_request_started_at,
    p_response_received_at => null, p_request_duration_ms => null,
    p_http_status => null, p_provider_status_class => null,
    p_response_classification => null, p_raw_body_base64 => null,
    p_raw_body_digest => null, p_raw_body_bytes => null,
    p_page_observation_digest => null, p_page_metadata => null,
    p_scope_completeness => null, p_next_checkpoint => null,
    p_next_checkpoint_mac => null, p_next_checkpoint_status => null,
    p_next_checkpoint_reason => null, p_next_page_number => null,
    p_events => null
  );
  raise exception 'EXPECTED_PAGE_ACCOUNT_LEASE_REJECTION';
exception when others then
  if sqlerrm <> 'CAPTURE_ACCOUNT_LEASE_INVALID' then raise; end if;
end;
$$;

do $$
begin
  if exists (select 1 from public.broker_capture_attempt_outcomes
      where id = 'a4000000-0000-4000-8000-000000000001'::uuid)
    or exists (select 1 from public.broker_capture_request_authorizations
      where id = 'a3000000-0000-4000-8000-000000000002'::uuid
        and (page_commit_input_digest is not null
          or page_commit_result is not null or page_committed_at is not null))
    or (select work_unit.row_version
        from public.broker_capture_work_units work_unit
        join public.broker_capture_schedule_occurrences occurrence
          on occurrence.work_unit_id = work_unit.id
        where occurrence.lane_state_id =
          '26000000-0000-4000-8000-000000000013'::uuid) <> 1
  then raise exception 'ACCOUNT_LEASE_FENCE_PARTIAL_EFFECT'; end if;
end;
$$;

update public.broker_capture_account_leases slot
set work_unit_row_version = work_unit.row_version,
    lease_expires_at = work_unit.lease_expires_at
from public.broker_capture_work_units work_unit
where work_unit.id = :'audit_work_unit_id'::uuid
  and slot.broker_account_id = work_unit.broker_account_id
  and slot.sync_kind = 'provider_api_observation';

set role service_role;
select public.equora_release_broker_capture_lease_v1(
  :'audit_work_unit_id'::uuid, 1,
  'a2000000-0000-4000-8000-000000000001'::uuid,
  'a5000000-0000-4000-8000-000000000001'::uuid,
  'recovery_handoff', 'lease-control-v1'
);
reset role;

-- A third Work Unit without a Permit is safely requeued by bounded recovery.
update public.broker_sync_lane_states
set next_due_at = clock_timestamp() - interval '1 second'
where id = '26000000-0000-4000-8000-000000000011'::uuid;
set role service_role;
select public.equora_materialize_next_due_broker_capture_v1(
  'b1000000-0000-4000-8000-000000000001'::uuid,
  'broker-capture-schedule-v1'
);
reset role;

select work_unit_id as fast_work_unit_id
from public.broker_capture_schedule_occurrences
where lane_state_id = '26000000-0000-4000-8000-000000000011'::uuid
\gset

set role service_role;
select public.equora_claim_broker_capture_work_unit_v2(
  :'fast_work_unit_id'::uuid, 0,
  'b2000000-0000-4000-8000-000000000001'::uuid,
  'b3000000-0000-4000-8000-000000000001'::uuid,
  'broker-capture-claim-v1'
);
reset role;

update public.broker_capture_work_units
set lease_expires_at = lease_acquired_at + interval '1 millisecond'
where id = :'fast_work_unit_id'::uuid;
update public.broker_capture_account_leases slot
set lease_expires_at = work_unit.lease_expires_at
from public.broker_capture_work_units work_unit
where work_unit.id = :'fast_work_unit_id'::uuid
  and slot.broker_account_id = work_unit.broker_account_id
  and slot.sync_kind = 'provider_api_observation';

set role service_role;
select public.equora_recover_expired_broker_capture_leases_v1(
  'b4000000-0000-4000-8000-000000000001'::uuid, 10,
  'lease-control-v1'
);
select public.equora_recover_expired_broker_capture_leases_v1(
  'b4000000-0000-4000-8000-000000000001'::uuid, 10,
  'lease-control-v1'
);
reset role;

do $$
declare
  v_result jsonb;
begin
  select result into strict v_result
  from public.broker_capture_recovery_commands
  where request_id = 'b4000000-0000-4000-8000-000000000001'::uuid;
  if (select work_unit.status
      from public.broker_capture_work_units work_unit
      join public.broker_capture_schedule_occurrences occurrence
        on occurrence.work_unit_id = work_unit.id
      where occurrence.lane_state_id =
        '26000000-0000-4000-8000-000000000011'::uuid) <> 'pending'
    or (select work_unit.recovery_state
        from public.broker_capture_work_units work_unit
        join public.broker_capture_schedule_occurrences occurrence
          on occurrence.work_unit_id = work_unit.id
        where occurrence.lane_state_id =
          '26000000-0000-4000-8000-000000000011'::uuid) <> 'none'
    or v_result ->> 'status' <> 'recovered'
    or (v_result ->> 'inspectedCount')::integer <> 1
    or (v_result ->> 'requeuedCount')::integer <> 1
    or (v_result ->> 'uncertainEgressCount')::integer <> 0
    or (v_result ->> 'outcomeDerivedCount')::integer <> 0
    or (select count(*) from public.broker_capture_recovery_commands
        where request_id = 'b4000000-0000-4000-8000-000000000001'::uuid) <> 1
    or (select count(*) from public.broker_capture_lease_events
        where work_unit_id = (
          select work_unit_id from public.broker_capture_schedule_occurrences
          where lane_state_id =
            '26000000-0000-4000-8000-000000000011'::uuid
        )
          and event_kind = 'expired_recovery') <> 1
  then raise exception 'EXPIRED_RECOVERY_OR_REPLAY_ORACLE_FAILED'; end if;
end;
$$;

-- A persisted Page receipt resolves egress uncertainty. Recovery derives the
-- next state from the durable checkpoint instead of blindly requeueing or
-- classifying the request as uncertain. Direct receipt mutation is fixture-
-- only; production writes the same append-once fields through Page-v2.
set role service_role;
select public.equora_claim_broker_capture_work_unit_v2(
  :'fast_work_unit_id'::uuid, 2,
  'b6000000-0000-4000-8000-000000000001'::uuid,
  'b7000000-0000-4000-8000-000000000001'::uuid,
  'broker-capture-claim-v1'
);
reset role;

select checkpoint_mac as resolved_checkpoint_mac
from public.broker_capture_work_units
where id = :'fast_work_unit_id'::uuid
\gset

set role service_role;
select public.equora_authorize_broker_capture_request_v1(
  :'fast_work_unit_id'::uuid, 3, 1, :'resolved_checkpoint_mac',
  'b7000000-0000-4000-8000-000000000001'::uuid,
  'b8000000-0000-4000-8000-000000000001'::uuid
);
reset role;

update public.broker_capture_request_authorizations
set page_commit_input_digest = repeat('d', 64),
    page_commit_result = jsonb_build_object(
      'status', 'page_committed', 'authorityBlocked', true
    ),
    page_committed_at = clock_timestamp()
where id = 'b8000000-0000-4000-8000-000000000001'::uuid;

update public.broker_capture_work_units
set lease_expires_at = lease_acquired_at + interval '1 millisecond'
where id = :'fast_work_unit_id'::uuid;
update public.broker_capture_account_leases slot
set lease_expires_at = work_unit.lease_expires_at
from public.broker_capture_work_units work_unit
where work_unit.id = :'fast_work_unit_id'::uuid
  and slot.broker_account_id = work_unit.broker_account_id
  and slot.sync_kind = 'provider_api_observation';

set role service_role;
select public.equora_recover_expired_broker_capture_leases_v1(
  'b9000000-0000-4000-8000-000000000001'::uuid, 10,
  'lease-control-v1'
);
select public.equora_recover_expired_broker_capture_leases_v1(
  'b9000000-0000-4000-8000-000000000001'::uuid, 10,
  'lease-control-v1'
);
reset role;

do $$
declare
  v_result jsonb;
  v_work_unit_id uuid;
begin
  select work_unit_id into strict v_work_unit_id
  from public.broker_capture_schedule_occurrences
  where lane_state_id = '26000000-0000-4000-8000-000000000011'::uuid;
  select result into strict v_result
  from public.broker_capture_recovery_commands
  where request_id = 'b9000000-0000-4000-8000-000000000001'::uuid;
  if (select status from public.broker_capture_work_units
        where id = v_work_unit_id) <> 'pending'
    or (select recovery_state from public.broker_capture_work_units
        where id = v_work_unit_id) <> 'none'
    or (select row_version from public.broker_capture_work_units
        where id = v_work_unit_id) <> 4
    or (v_result ->> 'inspectedCount')::integer <> 1
    or (v_result ->> 'requeuedCount')::integer <> 0
    or (v_result ->> 'uncertainEgressCount')::integer <> 0
    or (v_result ->> 'outcomeDerivedCount')::integer <> 1
    or (select count(*) from public.broker_capture_lease_events
        where work_unit_id = v_work_unit_id
          and event_kind = 'expired_recovery'
          and result_code = 'outcome_derived') <> 1
  then raise exception 'RESOLVED_OUTCOME_RECOVERY_ORACLE_FAILED'; end if;
end;
$$;

-- A yielded page budget creates exactly one same-Scope successor. The direct
-- status/MAC update below is fixture-only; production reaches yielded through
-- the fenced Page RPC.
with checkpoint_payload as (
  select work_unit.id,
    (work_unit.checkpoint - 'checkpointMac') || jsonb_build_object(
      'status', 'yielded', 'reason', 'work_unit_budget_reached'
    ) as payload,
    integrity_key.key_material
  from public.broker_capture_work_units work_unit
  join public.broker_capture_schedule_occurrences occurrence
    on occurrence.work_unit_id = work_unit.id
  join public.broker_sync_activations activation
    on activation.id = work_unit.sync_activation_id
  join equora_private.broker_capture_integrity_keys integrity_key
    on integrity_key.id = activation.capture_integrity_key_id
   and integrity_key.key_version = activation.capture_integrity_key_version
  where occurrence.lane_state_id =
    '26000000-0000-4000-8000-000000000011'::uuid
), signed_checkpoint as (
  select id, payload,
    public.equora_mexc_checkpoint_mac_v1(payload, key_material) as checkpoint_mac
  from checkpoint_payload
)
update public.broker_capture_work_units work_unit
set status = 'yielded', checkpoint_mac = signed.checkpoint_mac,
    checkpoint = signed.payload || jsonb_build_object(
      'checkpointMac', signed.checkpoint_mac
    )
from signed_checkpoint signed
where work_unit.id = signed.id;

-- A yielded Finder is not mutation authority. Disabling the exact runtime
-- enrollment before Continuation must create neither successor nor receipt and
-- must leave the predecessor version untouched.
select set_config('equora.test.fast_work_unit_id', :'fast_work_unit_id', false);
update equora_private.broker_capture_runtime_enrollment
set enabled = false, updated_at = clock_timestamp()
where singleton_key is true;
set role service_role;
do $$ begin
  begin
    perform public.equora_continue_yielded_broker_capture_work_unit_v1(
      current_setting('equora.test.fast_work_unit_id', true)::uuid, 4,
      'b5000000-0000-4000-8000-000000000009'::uuid,
      'lease-control-v1'
    );
    raise exception 'DISABLED_ENROLLMENT_CONTINUATION_ACCEPTED';
  exception when others then
    if sqlerrm <> 'CONTINUATION_AUTHORITY_BLOCKED' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  if (select row_version from public.broker_capture_work_units
      where id = current_setting('equora.test.fast_work_unit_id')::uuid) <> 4
    or exists (select 1 from public.broker_capture_work_units
      where predecessor_work_unit_id = current_setting('equora.test.fast_work_unit_id')::uuid)
    or exists (select 1 from public.broker_capture_lease_events
      where work_unit_id = current_setting('equora.test.fast_work_unit_id')::uuid
        and event_kind = 'yield_continuation')
  then raise exception 'DISABLED_ENROLLMENT_CONTINUATION_PARTIAL_EFFECT'; end if;
end $$;
update equora_private.broker_capture_runtime_enrollment
set enabled = true, updated_at = clock_timestamp()
where singleton_key is true;

set role service_role;
select public.equora_continue_yielded_broker_capture_work_unit_v1(
  :'fast_work_unit_id'::uuid, 4,
  'b5000000-0000-4000-8000-000000000001'::uuid,
  'lease-control-v1'
);
select public.equora_continue_yielded_broker_capture_work_unit_v1(
  :'fast_work_unit_id'::uuid, 4,
  'b5000000-0000-4000-8000-000000000001'::uuid,
  'lease-control-v1'
);
-- A later process uses a new idempotency key. It must converge on the existing
-- successor rather than attempting a second insert or raising a replay race.
select public.equora_continue_yielded_broker_capture_work_unit_v1(
  :'fast_work_unit_id'::uuid, 5,
  'b5000000-0000-4000-8000-000000000002'::uuid,
  'lease-control-v1'
);
reset role;

do $$
declare
  v_predecessor public.broker_capture_work_units%rowtype;
  v_successor public.broker_capture_work_units%rowtype;
  v_integrity_key equora_private.broker_capture_integrity_keys%rowtype;
begin
  select work_unit.* into strict v_predecessor
  from public.broker_capture_work_units work_unit
  join public.broker_capture_schedule_occurrences occurrence
    on occurrence.work_unit_id = work_unit.id
  where occurrence.lane_state_id =
    '26000000-0000-4000-8000-000000000011'::uuid;
  select * into strict v_successor from public.broker_capture_work_units
  where predecessor_work_unit_id = v_predecessor.id;
  select integrity_key.* into strict v_integrity_key
  from public.broker_sync_activations activation
  join equora_private.broker_capture_integrity_keys integrity_key
    on integrity_key.id = activation.capture_integrity_key_id
   and integrity_key.key_version = activation.capture_integrity_key_version
  where activation.id = v_successor.sync_activation_id;
  if v_predecessor.status <> 'yielded' or v_predecessor.row_version <> 5
    or v_successor.status <> 'pending' or v_successor.row_version <> 0
    or v_successor.run_id <> v_predecessor.run_id
    or v_successor.scope_id <> v_predecessor.scope_id
    or v_successor.continuation_generation <> 1
    or v_successor.checkpoint ->> 'status' <> 'ready'
    or (v_successor.checkpoint ->> 'workUnitSequence')::integer <> 2
    or public.equora_mexc_checkpoint_mac_v1(
      v_successor.checkpoint - 'checkpointMac', v_integrity_key.key_material
    ) <> v_successor.checkpoint_mac
    or (select count(*) from public.broker_capture_lease_events
        where work_unit_id = v_predecessor.id
          and event_kind = 'yield_continuation') <> 2
    or (select count(*) from public.broker_capture_work_units
        where predecessor_work_unit_id = v_predecessor.id) <> 1
    or (select count(distinct result ->> 'successorWorkUnitId')
        from public.broker_capture_lease_events
        where work_unit_id = v_predecessor.id
          and event_kind = 'yield_continuation') <> 1
    or (select count(*) from public.broker_capture_lease_events
        where work_unit_id = v_predecessor.id
          and event_kind = 'yield_continuation'
          and result ->> 'crossRequestReplay' = 'false') <> 1
    or (select count(*) from public.broker_capture_lease_events
        where work_unit_id = v_predecessor.id
          and event_kind = 'yield_continuation'
          and result ->> 'crossRequestReplay' = 'true') <> 1
  then raise exception 'YIELD_CONTINUATION_OR_REPLAY_ORACLE_FAILED'; end if;
end;
$$;

-- The contractual Scope budget is exactly twenty Work Units. Sequence 19 may
-- create sequence 20; sequence 20 must close as scope_exhausted, create no
-- successor and replay the same immutable outcome without another mutation.
select work_unit.id as boundary_19_work_unit_id
from public.broker_capture_work_units work_unit
where work_unit.predecessor_work_unit_id = :'fast_work_unit_id'::uuid
\gset

with checkpoint_payload as (
  select work_unit.id,
    jsonb_set(
      jsonb_set(
        jsonb_set(
          work_unit.checkpoint - 'checkpointMac',
          '{status}', '"yielded"'::jsonb
        ),
        '{reason}', '"work_unit_budget_reached"'::jsonb
      ),
      '{workUnitSequence}', '19'::jsonb
    ) as payload,
    integrity_key.key_material
  from public.broker_capture_work_units work_unit
  join public.broker_sync_activations activation
    on activation.id = work_unit.sync_activation_id
  join equora_private.broker_capture_integrity_keys integrity_key
    on integrity_key.id = activation.capture_integrity_key_id
   and integrity_key.key_version = activation.capture_integrity_key_version
  where work_unit.id = :'boundary_19_work_unit_id'::uuid
), signed_checkpoint as (
  select id, payload,
    public.equora_mexc_checkpoint_mac_v1(payload, key_material) as checkpoint_mac
  from checkpoint_payload
)
update public.broker_capture_work_units work_unit
set status = 'yielded', continuation_generation = 18,
    checkpoint_mac = signed.checkpoint_mac,
    checkpoint = signed.payload || jsonb_build_object(
      'checkpointMac', signed.checkpoint_mac
    )
from signed_checkpoint signed
where work_unit.id = signed.id;

set role service_role;
select public.equora_continue_yielded_broker_capture_work_unit_v1(
  :'boundary_19_work_unit_id'::uuid, 0,
  'b5000000-0000-4000-8000-000000000019'::uuid,
  'lease-control-v1'
);
reset role;

select work_unit.id as boundary_20_work_unit_id
from public.broker_capture_work_units work_unit
where work_unit.predecessor_work_unit_id = :'boundary_19_work_unit_id'::uuid
\gset

with checkpoint_payload as (
  select work_unit.id,
    jsonb_set(
      jsonb_set(
        work_unit.checkpoint - 'checkpointMac',
        '{status}', '"yielded"'::jsonb
      ),
      '{reason}', '"work_unit_budget_reached"'::jsonb
    ) as payload,
    integrity_key.key_material
  from public.broker_capture_work_units work_unit
  join public.broker_sync_activations activation
    on activation.id = work_unit.sync_activation_id
  join equora_private.broker_capture_integrity_keys integrity_key
    on integrity_key.id = activation.capture_integrity_key_id
   and integrity_key.key_version = activation.capture_integrity_key_version
  where work_unit.id = :'boundary_20_work_unit_id'::uuid
), signed_checkpoint as (
  select id, payload,
    public.equora_mexc_checkpoint_mac_v1(payload, key_material) as checkpoint_mac
  from checkpoint_payload
)
update public.broker_capture_work_units work_unit
set status = 'yielded', checkpoint_mac = signed.checkpoint_mac,
    checkpoint = signed.payload || jsonb_build_object(
      'checkpointMac', signed.checkpoint_mac
    )
from signed_checkpoint signed
where work_unit.id = signed.id;

set role service_role;
select public.equora_continue_yielded_broker_capture_work_unit_v1(
  :'boundary_20_work_unit_id'::uuid, 0,
  'b5000000-0000-4000-8000-000000000020'::uuid,
  'lease-control-v1'
);
select public.equora_continue_yielded_broker_capture_work_unit_v1(
  :'boundary_20_work_unit_id'::uuid, 0,
  'b5000000-0000-4000-8000-000000000020'::uuid,
  'lease-control-v1'
);
reset role;

select set_config(
  'equora.test.boundary_19_work_unit_id', :'boundary_19_work_unit_id', false
);
select set_config(
  'equora.test.boundary_20_work_unit_id', :'boundary_20_work_unit_id', false
);
do $$
declare
  v_boundary_20 public.broker_capture_work_units%rowtype;
  v_integrity_key equora_private.broker_capture_integrity_keys%rowtype;
begin
  select * into strict v_boundary_20
  from public.broker_capture_work_units
  where id = current_setting('equora.test.boundary_20_work_unit_id')::uuid;
  select integrity_key.* into strict v_integrity_key
  from public.broker_sync_activations activation
  join equora_private.broker_capture_integrity_keys integrity_key
    on integrity_key.id = activation.capture_integrity_key_id
   and integrity_key.key_version = activation.capture_integrity_key_version
  where activation.id = v_boundary_20.sync_activation_id;
  if (select row_version from public.broker_capture_work_units
      where id = current_setting('equora.test.boundary_19_work_unit_id')::uuid) <> 1
    or v_boundary_20.status <> 'partial_failed'
    or v_boundary_20.row_version <> 1
    or v_boundary_20.continuation_generation <> 19
    or (v_boundary_20.checkpoint ->> 'workUnitSequence')::integer <> 20
    or v_boundary_20.checkpoint ->> 'status' <> 'partial_failed'
    or v_boundary_20.checkpoint ->> 'reason' <> 'scope_budget_exhausted'
    or public.equora_mexc_checkpoint_mac_v1(
      v_boundary_20.checkpoint - 'checkpointMac', v_integrity_key.key_material
    ) <> v_boundary_20.checkpoint_mac
    or exists (select 1 from public.broker_capture_work_units
      where predecessor_work_unit_id = v_boundary_20.id)
    or (select count(*) from public.broker_capture_lease_events
        where work_unit_id = v_boundary_20.id
          and event_kind = 'yield_continuation') <> 1
    or (select result ->> 'status'
        from public.broker_capture_lease_events
        where work_unit_id = v_boundary_20.id
          and event_kind = 'yield_continuation') <> 'scope_exhausted'
    or (select result ->> 'crossRequestReplay'
        from public.broker_capture_lease_events
        where work_unit_id = v_boundary_20.id
          and event_kind = 'yield_continuation') <> 'false'
  then raise exception 'YIELD_CONTINUATION_SCOPE_BOUNDARY_ORACLE_FAILED'; end if;
end;
$$;

-- Every supported private read capability must materialize a checkpoint that
-- the shared Claim validator accepts. Position-bound endpoints require the
-- sixth scope key; Orders and Executions must omit it entirely.
insert into public.broker_sync_lane_requirements (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  provider_code, provider_contract_version, adapter_version, capability_id,
  capability_version, instrument_scope_key, profile_id, profile_version,
  policy_generation, requirement_source
) values
  (
    '27000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, 'mexc',
    'mexc_futures_contract_v1', 'v57_61_0', 'historical_orders_v1', 'v1',
    'mexc_futures_symbol_v1:ETH_USDT:none', 'mexc_futures_rest', 'v1', 1,
    'activation_plan'
  ),
  (
    '27000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, 'mexc',
    'mexc_futures_contract_v1', 'v57_61_0', 'historical_executions_v3', 'v1',
    'mexc_futures_symbol_v1:SOL_USDT:none', 'mexc_futures_rest', 'v1', 1,
    'activation_plan'
  ),
  (
    '27000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, 'mexc',
    'mexc_futures_contract_v1', 'v57_61_0', 'historical_positions_v1', 'v1',
    'mexc_futures_symbol_v1:XRP_USDT:1', 'mexc_futures_rest', 'v1', 1,
    'activation_plan'
  ),
  (
    '27000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, 'mexc',
    'mexc_futures_contract_v1', 'v57_61_0', 'funding_records_v1', 'v1',
    'mexc_futures_symbol_v1:ADA_USDT:2', 'mexc_futures_rest', 'v1', 1,
    'activation_plan'
  );

insert into public.broker_sync_lane_states (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  lane_requirement_id, provider_code, provider_contract_version,
  adapter_version, capability_id, capability_version, instrument_scope_key,
  lane_id, profile_id, profile_version, policy_generation,
  observation_status, next_due_at, due_generation
)
select lane_state_id,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '14c6b264-99b8-4c74-a882-135b88e9d100'::uuid,
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8'::uuid, 1,
  requirement_id, 'mexc', 'mexc_futures_contract_v1', 'v57_61_0',
  capability_id, 'v1', instrument_scope_key, 'incremental_fast_6h',
  'mexc_futures_rest', 'v1', 1, 'not_observed',
  clock_timestamp() - make_interval(secs => 10 - ordinal), 1
from (values
  (1, '28000000-0000-4000-8000-000000000001'::uuid,
    '27000000-0000-4000-8000-000000000001'::uuid,
    'historical_orders_v1', 'mexc_futures_symbol_v1:ETH_USDT:none'),
  (2, '28000000-0000-4000-8000-000000000002'::uuid,
    '27000000-0000-4000-8000-000000000002'::uuid,
    'historical_executions_v3', 'mexc_futures_symbol_v1:SOL_USDT:none'),
  (3, '28000000-0000-4000-8000-000000000003'::uuid,
    '27000000-0000-4000-8000-000000000003'::uuid,
    'historical_positions_v1', 'mexc_futures_symbol_v1:XRP_USDT:1'),
  (4, '28000000-0000-4000-8000-000000000004'::uuid,
    '27000000-0000-4000-8000-000000000004'::uuid,
    'funding_records_v1', 'mexc_futures_symbol_v1:ADA_USDT:2')
) matrix(ordinal, lane_state_id, requirement_id, capability_id,
  instrument_scope_key);

set role service_role;
do $$
declare
  v_case record;
  v_materialization jsonb;
  v_claim jsonb;
  v_permit jsonb;
  v_release jsonb;
  v_scope_shape jsonb;
  v_work_unit_id uuid;
begin
  for v_case in
    select * from (values
      (1, '28000000-0000-4000-8000-000000000001'::uuid,
        'historical_orders_v1', null::integer,
        'c1100000-0000-4000-8000-000000000001'::uuid,
        'c2100000-0000-4000-8000-000000000001'::uuid,
        'c3100000-0000-4000-8000-000000000001'::uuid,
        null::uuid,
        'c5100000-0000-4000-8000-000000000001'::uuid),
      (2, '28000000-0000-4000-8000-000000000002'::uuid,
        'historical_executions_v3', null::integer,
        'c1100000-0000-4000-8000-000000000002'::uuid,
        'c2100000-0000-4000-8000-000000000002'::uuid,
        'c3100000-0000-4000-8000-000000000002'::uuid,
        null::uuid,
        'c5100000-0000-4000-8000-000000000002'::uuid),
      (3, '28000000-0000-4000-8000-000000000003'::uuid,
        'historical_positions_v1', 1,
        'c1100000-0000-4000-8000-000000000003'::uuid,
        'c2100000-0000-4000-8000-000000000003'::uuid,
        'c3100000-0000-4000-8000-000000000003'::uuid,
        'c4100000-0000-4000-8000-000000000003'::uuid,
        'c5100000-0000-4000-8000-000000000003'::uuid),
      (4, '28000000-0000-4000-8000-000000000004'::uuid,
        'funding_records_v1', 2,
        'c1100000-0000-4000-8000-000000000004'::uuid,
        'c2100000-0000-4000-8000-000000000004'::uuid,
        'c3100000-0000-4000-8000-000000000004'::uuid,
        'c4100000-0000-4000-8000-000000000004'::uuid,
        'c5100000-0000-4000-8000-000000000004'::uuid)
    ) cases(ordinal, lane_state_id, capability_id, position_type,
      materialize_request_id, lease_token, claim_request_id,
      permit_id, release_request_id)
    order by ordinal
  loop
    v_materialization := public.equora_materialize_next_due_broker_capture_v1(
      v_case.materialize_request_id, 'broker-capture-schedule-v1'
    );
    if v_materialization ->> 'status' <> 'scheduled'
      or (v_materialization ->> 'authorityBlocked')::boolean is distinct from true
      or (v_materialization ->> 'laneStateId')::uuid <> v_case.lane_state_id
      or (v_materialization ->> 'dueGeneration')::bigint <> 1
      or (v_materialization ->> 'bucketCount')::integer not between 1 and 31
      or v_materialization ->> 'bucketSetDigest' !~ '^[a-f0-9]{64}$'
    then raise exception 'SCHEDULER_CAPABILITY_MATERIALIZATION_MATRIX_FAILED'; end if;

    v_work_unit_id := (v_materialization ->> 'workUnitId')::uuid;
    v_claim := public.equora_claim_broker_capture_work_unit_v2(
      v_work_unit_id, 0, v_case.claim_request_id, v_case.lease_token,
      'broker-capture-claim-v1'
    );
    v_scope_shape := v_claim -> 'checkpoint' -> 'scope';
    if v_claim ->> 'status' <> 'claimed'
      or (v_claim ->> 'authorityBlocked')::boolean is distinct from true
      or (v_claim ->> 'workUnitId')::uuid <> v_work_unit_id
      or (v_claim ->> 'workUnitRowVersion')::bigint <> 1
      or (v_claim ->> 'requestSequence')::integer <> 1
      or v_claim ->> 'capabilityId' <> v_case.capability_id
      or v_claim ->> 'pageScopeDigest'
        is distinct from v_claim -> 'checkpoint' ->> 'scopeDigest'
      or v_claim -> 'checkpoint' ->> 'status' <> 'ready'
      or v_claim -> 'checkpoint' ->> 'reason' <> 'initialized'
      or (
        v_case.position_type is null and (
          (select count(*) from jsonb_object_keys(v_scope_shape)) <> 5
          or v_scope_shape ? 'positionType'
        )
      )
      or (
        v_case.position_type is not null and (
          (select count(*) from jsonb_object_keys(v_scope_shape)) <> 6
          or (v_scope_shape ->> 'positionType')::integer
            is distinct from v_case.position_type
        )
      )
    then raise exception 'SCHEDULER_CAPABILITY_CHECKPOINT_MATRIX_FAILED'; end if;

    if v_case.permit_id is not null then
      v_permit := public.equora_authorize_broker_capture_request_v1(
        v_work_unit_id, 1, 1, v_claim ->> 'checkpointMac',
        v_case.lease_token, v_case.permit_id
      );
      if v_permit ->> 'status' <> 'request_authorized'
        or (v_permit ->> 'authorityBlocked')::boolean is distinct from true
        or (v_permit ->> 'workUnitId')::uuid <> v_work_unit_id
        or (v_permit ->> 'workUnitRowVersion')::bigint <> 1
        or (v_permit ->> 'requestSequence')::integer <> 1
        or v_permit ->> 'capabilityId' <> v_case.capability_id
        or v_permit ->> 'pageScopeDigest' <> v_claim ->> 'pageScopeDigest'
        or v_permit ->> 'sendDeadlineAt' is null
      then raise exception 'SCHEDULER_POSITION_PERMIT_MATRIX_FAILED'; end if;
    end if;

    v_release := public.equora_release_broker_capture_lease_v1(
      v_work_unit_id, 1, v_case.lease_token, v_case.release_request_id,
      'cooperative_shutdown', 'lease-control-v1'
    );
    if v_case.permit_id is null then
      if v_release ->> 'status' <> 'released'
        or v_release ->> 'recoveryState' <> 'none'
      then raise exception 'SCHEDULER_CAPABILITY_RELEASE_MATRIX_FAILED'; end if;
    elsif v_release ->> 'status' <> 'recovery_pending'
      or v_release ->> 'recoveryState' <> 'uncertain_egress'
    then raise exception 'SCHEDULER_CAPABILITY_RELEASE_MATRIX_FAILED'; end if;
  end loop;
end;
$$;
reset role;

do $$
begin
  if (select count(*) from public.broker_capture_schedule_occurrences
      where lane_state_id between
        '28000000-0000-4000-8000-000000000001'::uuid and
        '28000000-0000-4000-8000-000000000004'::uuid) <> 4
    or (select count(*) from public.broker_capture_run_lane_inputs
      where lane_state_id between
        '28000000-0000-4000-8000-000000000001'::uuid and
        '28000000-0000-4000-8000-000000000004'::uuid) <> 4
    or (select count(*) from public.broker_capture_request_authorizations
      where id in (
        'c4100000-0000-4000-8000-000000000003'::uuid,
        'c4100000-0000-4000-8000-000000000004'::uuid
      ) and page_commit_input_digest is null and page_commit_result is null
        and page_committed_at is null) <> 2
    or exists (
      select 1 from public.broker_provider_request_results result
      join public.broker_capture_work_units work_unit
        on work_unit.id = result.work_unit_id
      where work_unit.lane_state_id between
        '28000000-0000-4000-8000-000000000001'::uuid and
        '28000000-0000-4000-8000-000000000004'::uuid
    )
    or exists (
      select 1 from public.broker_capture_attempt_outcomes outcome
      join public.broker_capture_work_units work_unit
        on work_unit.id = outcome.work_unit_id
      where work_unit.lane_state_id between
        '28000000-0000-4000-8000-000000000001'::uuid and
        '28000000-0000-4000-8000-000000000004'::uuid
    )
    or exists (
      select 1 from public.broker_capture_account_leases
      where state <> 'available' or work_unit_id is not null
        or lease_token_digest is not null or lease_expires_at is not null
    )
  then raise exception 'SCHEDULER_CAPABILITY_PERSISTENCE_MATRIX_FAILED'; end if;
end;
$$;

-- Capability/positionType authority is a closed matrix, not merely a positive
-- happy path. Each invalid combination must fail before every scheduler write.
insert into public.broker_sync_lane_requirements (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  provider_code, provider_contract_version, adapter_version, capability_id,
  capability_version, instrument_scope_key, profile_id, profile_version,
  policy_generation, requirement_source
) values
  (
    '29000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, 'mexc',
    'mexc_futures_contract_v1', 'v57_61_0', 'historical_positions_v1', 'v1',
    'mexc_futures_symbol_v1:DOGE_USDT:none', 'mexc_futures_rest', 'v1', 1,
    'activation_plan'
  ),
  (
    '29000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, 'mexc',
    'mexc_futures_contract_v1', 'v57_61_0', 'funding_records_v1', 'v1',
    'mexc_futures_symbol_v1:LTC_USDT:none', 'mexc_futures_rest', 'v1', 1,
    'activation_plan'
  ),
  (
    '29000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, 'mexc',
    'mexc_futures_contract_v1', 'v57_61_0', 'historical_orders_v1', 'v1',
    'mexc_futures_symbol_v1:DOT_USDT:1', 'mexc_futures_rest', 'v1', 1,
    'activation_plan'
  ),
  (
    '29000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    '14c6b264-99b8-4c74-a882-135b88e9d100',
    'b15526c9-c0e7-4ace-a3d1-f8055de216c8', 1, 'mexc',
    'mexc_futures_contract_v1', 'v57_61_0', 'historical_executions_v3', 'v1',
    'mexc_futures_symbol_v1:AVAX_USDT:2', 'mexc_futures_rest', 'v1', 1,
    'activation_plan'
  );

insert into public.broker_sync_lane_states (
  id, user_id, broker_account_id, sync_activation_id, activation_generation,
  lane_requirement_id, provider_code, provider_contract_version,
  adapter_version, capability_id, capability_version, instrument_scope_key,
  lane_id, profile_id, profile_version, policy_generation,
  observation_status, next_due_at, due_generation
)
select lane_state_id,
  '10000000-0000-4000-8000-000000000001'::uuid,
  '14c6b264-99b8-4c74-a882-135b88e9d100'::uuid,
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8'::uuid, 1,
  requirement_id, 'mexc', 'mexc_futures_contract_v1', 'v57_61_0',
  capability_id, 'v1', instrument_scope_key, 'incremental_fast_6h',
  'mexc_futures_rest', 'v1', 1, 'not_observed',
  clock_timestamp() + interval '100 years', 1
from (values
  ('2a000000-0000-4000-8000-000000000001'::uuid,
    '29000000-0000-4000-8000-000000000001'::uuid,
    'historical_positions_v1', 'mexc_futures_symbol_v1:DOGE_USDT:none'),
  ('2a000000-0000-4000-8000-000000000002'::uuid,
    '29000000-0000-4000-8000-000000000002'::uuid,
    'funding_records_v1', 'mexc_futures_symbol_v1:LTC_USDT:none'),
  ('2a000000-0000-4000-8000-000000000003'::uuid,
    '29000000-0000-4000-8000-000000000003'::uuid,
    'historical_orders_v1', 'mexc_futures_symbol_v1:DOT_USDT:1'),
  ('2a000000-0000-4000-8000-000000000004'::uuid,
    '29000000-0000-4000-8000-000000000004'::uuid,
    'historical_executions_v3', 'mexc_futures_symbol_v1:AVAX_USDT:2')
) matrix(lane_state_id, requirement_id, capability_id, instrument_scope_key);

create temporary table scheduler_invalid_position_type_baseline as
select
  (select count(*) from public.broker_capture_materialization_commands)
    as command_count,
  (select count(*) from public.broker_capture_schedule_occurrences)
    as occurrence_count,
  (select count(*) from public.broker_capture_run_lane_inputs)
    as lane_input_count,
  (select count(*) from public.broker_capture_runs) as run_count,
  (select count(*) from public.broker_sync_scopes) as scope_count,
  (select count(*) from public.broker_sync_scope_buckets) as bucket_count,
  (select count(*) from public.broker_capture_work_units) as work_unit_count,
  (select count(*) from public.broker_capture_account_leases) as account_lease_count;

update public.broker_sync_lane_states set next_due_at = clock_timestamp() - interval '100 years'
where id = '2a000000-0000-4000-8000-000000000001';
set role service_role;
do $$ begin
  perform public.equora_materialize_next_due_broker_capture_v1(
    'e1100000-0000-4000-8000-000000000001', 'broker-capture-schedule-v1'
  );
  raise exception 'TEST_POSITION_NONE_WAS_ACCEPTED';
exception when others then
  if sqlerrm not like '%SCHEDULER_AUTHORITY_BLOCKED%' then raise; end if;
end $$;
reset role;
update public.broker_sync_lane_states set next_due_at = clock_timestamp() + interval '100 years'
where id = '2a000000-0000-4000-8000-000000000001';

update public.broker_sync_lane_states set next_due_at = clock_timestamp() - interval '100 years'
where id = '2a000000-0000-4000-8000-000000000002';
set role service_role;
do $$ begin
  perform public.equora_materialize_next_due_broker_capture_v1(
    'e1100000-0000-4000-8000-000000000002', 'broker-capture-schedule-v1'
  );
  raise exception 'TEST_FUNDING_NONE_WAS_ACCEPTED';
exception when others then
  if sqlerrm not like '%SCHEDULER_AUTHORITY_BLOCKED%' then raise; end if;
end $$;
reset role;
update public.broker_sync_lane_states set next_due_at = clock_timestamp() + interval '100 years'
where id = '2a000000-0000-4000-8000-000000000002';

update public.broker_sync_lane_states set next_due_at = clock_timestamp() - interval '100 years'
where id = '2a000000-0000-4000-8000-000000000003';
set role service_role;
do $$ begin
  perform public.equora_materialize_next_due_broker_capture_v1(
    'e1100000-0000-4000-8000-000000000003', 'broker-capture-schedule-v1'
  );
  raise exception 'TEST_ORDER_POSITION_TYPE_WAS_ACCEPTED';
exception when others then
  if sqlerrm not like '%SCHEDULER_AUTHORITY_BLOCKED%' then raise; end if;
end $$;
reset role;
update public.broker_sync_lane_states set next_due_at = clock_timestamp() + interval '100 years'
where id = '2a000000-0000-4000-8000-000000000003';

update public.broker_sync_lane_states set next_due_at = clock_timestamp() - interval '100 years'
where id = '2a000000-0000-4000-8000-000000000004';
set role service_role;
do $$ begin
  perform public.equora_materialize_next_due_broker_capture_v1(
    'e1100000-0000-4000-8000-000000000004', 'broker-capture-schedule-v1'
  );
  raise exception 'TEST_EXECUTION_POSITION_TYPE_WAS_ACCEPTED';
exception when others then
  if sqlerrm not like '%SCHEDULER_AUTHORITY_BLOCKED%' then raise; end if;
end $$;
reset role;
update public.broker_sync_lane_states set next_due_at = clock_timestamp() + interval '100 years'
where id = '2a000000-0000-4000-8000-000000000004';

do $$
declare
  v_baseline record;
begin
  select * into strict v_baseline
  from pg_temp.scheduler_invalid_position_type_baseline;
  if (select count(*) from public.broker_capture_materialization_commands)
      <> v_baseline.command_count
    or (select count(*) from public.broker_capture_schedule_occurrences)
      <> v_baseline.occurrence_count
    or (select count(*) from public.broker_capture_run_lane_inputs)
      <> v_baseline.lane_input_count
    or (select count(*) from public.broker_capture_runs) <> v_baseline.run_count
    or (select count(*) from public.broker_sync_scopes) <> v_baseline.scope_count
    or (select count(*) from public.broker_sync_scope_buckets)
      <> v_baseline.bucket_count
    or (select count(*) from public.broker_capture_work_units)
      <> v_baseline.work_unit_count
    or (select count(*) from public.broker_capture_account_leases)
      <> v_baseline.account_lease_count
  then
    raise exception 'SCHEDULER_INVALID_POSITION_TYPE_PARTIAL_EFFECT';
  end if;
end;
$$;

-- The layer is inert: only explicit RPC calls materialize work.
do $$
declare
  v_has_broker_capture_cron boolean := false;
begin
  if to_regclass('cron.job') is not null then
    execute $cron$
      select exists (
        select 1 from cron.job where command ilike '%broker_capture%'
      )
    $cron$ into v_has_broker_capture_cron;
  end if;
  if exists (
    select 1 from pg_trigger
    where not tgisinternal and tgfoid::regprocedure::text ilike '%broker_capture%'
  )
    or v_has_broker_capture_cron
    or has_table_privilege('authenticated',
      'public.broker_capture_account_leases', 'insert,update,delete')
    or has_table_privilege('service_role',
      'public.broker_capture_account_leases', 'insert,update,delete')
    or has_function_privilege('authenticated',
      'public.equora_materialize_next_due_broker_capture_v1(uuid,text)',
      'execute')
    or not has_function_privilege('service_role',
      'public.equora_materialize_next_due_broker_capture_v1(uuid,text)',
      'execute')
  then raise exception 'SCHEDULER_INERTNESS_OR_ACL_ORACLE_FAILED'; end if;
end;
$$;

select 'broker capture scheduler-control integration passed' as result;
