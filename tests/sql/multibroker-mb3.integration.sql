\set ON_ERROR_STOP on

begin;

insert into auth.users (id) values ('a3000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

grant equora_broker_capture_owner to postgres;
set local role equora_broker_capture_owner;
insert into equora_private.broker_capture_runtime_enrollment (
  singleton_key, user_id, provider_code, max_accounts, max_symbols,
  enabled, enrolled_at, updated_at
) values (
  true, 'a3000000-0000-4000-8000-000000000001', 'mexc', 1, 5,
  true, clock_timestamp(), clock_timestamp()
);
reset role;
revoke equora_broker_capture_owner from postgres;
grant equora_broker_operator_control_v2, equora_broker_runtime_v2 to postgres;
set local role equora_broker_runtime_v2;
do $$
begin
  if not public.equora_validate_provider_cursor_v1(
      'mexc_page_number_cursor_v1','null'::jsonb
    )
    or public.equora_validate_provider_cursor_v1(
      'mexc_page_number_cursor_v1','"not-null"'::jsonb
    )
    or not public.equora_validate_provider_cursor_v1(
      'equora_opaque_scalar_cursor_v1','"synthetic-next-page-token"'::jsonb
    )
    or not public.equora_validate_provider_cursor_v1(
      'equora_opaque_scalar_cursor_v1','9007199254740991'::jsonb
    )
    or public.equora_validate_provider_cursor_v1(
      'equora_opaque_scalar_cursor_v1','9007199254740992'::jsonb
    )
    or public.equora_validate_provider_cursor_v1(
      'unregistered_cursor_v1','null'::jsonb
    )
  then raise exception 'MB3_CURSOR_CONTRACT_DISPATCH_INVALID'; end if;
end;
$$;
reset role;
select set_config(
  'request.jwt.claim.sub',
  'a3000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;
select public.equora_request_mexc_connection_setup_v1(
  'a3000000-0000-4000-8000-000000000002',
  'MB3 local test only',
  '["BTC_USDT"]'::jsonb,
  true
);
reset role;

set local role service_role;
select public.equora_apply_mexc_connection_setup_v1(
  'a3000000-0000-4000-8000-000000000002',
  '{"v":"k2026","iv":"AAAAAAAAAAAAAAAA","tag":"AAAAAAAAAAAAAAAAAAAAAA==","data":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}',
  'k2026',
  repeat('a', 64),
  'idv1',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
);
reset role;

select result ->> 'syncActivationId' as mb3_activation_id,
  result ->> 'brokerAccountId' as mb3_account_id
from public.broker_connection_setup_commands
where id = 'a3000000-0000-4000-8000-000000000002'
\gset

update public.broker_sync_lane_states
set next_due_at = clock_timestamp() + interval '100 years'
where sync_activation_id = :'mb3_activation_id'::uuid;
update public.broker_sync_lane_states
set next_due_at = clock_timestamp() - interval '1 second'
where id = (
  select id from public.broker_sync_lane_states
  where sync_activation_id = :'mb3_activation_id'::uuid
    and capability_id = 'historical_orders_v1'
    and lane_id = 'incremental_fast_6h'
    and superseded_at is null
  order by id limit 1
);

set local role service_role;
select public.equora_materialize_next_due_broker_capture_v1(
  'a3000000-0000-4000-8000-000000000003',
  'broker-capture-schedule-v1'
);
reset role;

select result ->> 'workUnitId' as mb3_work_unit_id
from public.broker_capture_materialization_commands
where request_id = 'a3000000-0000-4000-8000-000000000003'
\gset

set local role service_role;
select public.equora_claim_broker_capture_work_unit_v2(
  :'mb3_work_unit_id'::uuid,
  0,
  'a3000000-0000-4000-8000-000000000004',
  'a3000000-0000-4000-8000-000000000005',
  'broker-capture-claim-v1'
);
reset role;

set local role equora_broker_operator_control_v2;
select public.equora_provider_operator_command_digest_v2(
  'a3000000-0000-4000-8000-000000000006',
  'a3000000-0000-4000-8000-000000000007',
  'enroll',
  'a3000000-0000-4000-8000-000000000001',
  :'mb3_account_id'::uuid,
  'mexc','mexc_futures_contract_v1',
  'historical_orders_v1','mexc_historical_orders_capability_v1',
  0,'equora_provider_operator_command_v2'
) as mb3_enroll_digest
\gset

select public.equora_apply_broker_operator_command_v2(
  'a3000000-0000-4000-8000-000000000006',
  'a3000000-0000-4000-8000-000000000007',
  'enroll',
  'a3000000-0000-4000-8000-000000000001',
  :'mb3_account_id'::uuid,
  'mexc','mexc_futures_contract_v1',
  'historical_orders_v1','mexc_historical_orders_capability_v1',
  0,'equora_provider_operator_command_v2',:'mb3_enroll_digest'
);

do $$
declare
  candidate record;
  command_digest text;
  account_id uuid;
begin
  select id into strict account_id from public.broker_accounts
  where user_id='a3000000-0000-4000-8000-000000000001'
    and provider_code='mexc';
  for candidate in select * from (values
    ('a3000000-0000-4000-8000-000000000011'::uuid,'a3000000-0000-4000-8000-000000000021'::uuid,'historical_executions_v3','mexc_historical_executions_capability_v1'),
    ('a3000000-0000-4000-8000-000000000012'::uuid,'a3000000-0000-4000-8000-000000000022'::uuid,'historical_positions_v1','mexc_historical_positions_capability_v1'),
    ('a3000000-0000-4000-8000-000000000013'::uuid,'a3000000-0000-4000-8000-000000000023'::uuid,'funding_records_v1','mexc_funding_records_capability_v1')
  ) as candidates(command_id,enrollment_id,capability_id,capability_contract_version)
  loop
    command_digest := public.equora_provider_operator_command_digest_v2(
      candidate.command_id,candidate.enrollment_id,'enroll',
      'a3000000-0000-4000-8000-000000000001',account_id,
      'mexc','mexc_futures_contract_v1',candidate.capability_id,
      candidate.capability_contract_version,0,'equora_provider_operator_command_v2'
    );
    perform public.equora_apply_broker_operator_command_v2(
      candidate.command_id,candidate.enrollment_id,'enroll',
      'a3000000-0000-4000-8000-000000000001',account_id,
      'mexc','mexc_futures_contract_v1',candidate.capability_id,
      candidate.capability_contract_version,0,'equora_provider_operator_command_v2',command_digest
    );
  end loop;

  command_digest := public.equora_provider_operator_command_digest_v2(
    'a3000000-0000-4000-8000-000000000014','a3000000-0000-4000-8000-000000000023','revoke',
    'a3000000-0000-4000-8000-000000000001',account_id,
    'mexc','mexc_futures_contract_v1','funding_records_v1','mexc_funding_records_capability_v1',
    1,'equora_provider_operator_command_v2'
  );
  perform public.equora_apply_broker_operator_command_v2(
    'a3000000-0000-4000-8000-000000000014','a3000000-0000-4000-8000-000000000023','revoke',
    'a3000000-0000-4000-8000-000000000001',account_id,
    'mexc','mexc_futures_contract_v1','funding_records_v1','mexc_funding_records_capability_v1',
    1,'equora_provider_operator_command_v2',command_digest
  );
  command_digest := public.equora_provider_operator_command_digest_v2(
    'a3000000-0000-4000-8000-000000000015','a3000000-0000-4000-8000-000000000024','enroll',
    'a3000000-0000-4000-8000-000000000001',account_id,
    'mexc','mexc_futures_contract_v1','funding_records_v1','mexc_funding_records_capability_v1',
    0,'equora_provider_operator_command_v2'
  );
  perform public.equora_apply_broker_operator_command_v2(
    'a3000000-0000-4000-8000-000000000015','a3000000-0000-4000-8000-000000000024','enroll',
    'a3000000-0000-4000-8000-000000000001',account_id,
    'mexc','mexc_futures_contract_v1','funding_records_v1','mexc_funding_records_capability_v1',
    0,'equora_provider_operator_command_v2',command_digest
  );
end;
$$;

select public.equora_provider_operator_command_digest_v2(
  'a3000000-0000-4000-8000-000000000008',
  'a3000000-0000-4000-8000-000000000007',
  'resume',
  'a3000000-0000-4000-8000-000000000001',
  :'mb3_account_id'::uuid,
  'mexc','mexc_futures_contract_v1',
  'historical_orders_v1','mexc_historical_orders_capability_v1',
  1,'equora_provider_operator_command_v2'
) as mb3_resume_digest
\gset

select public.equora_apply_broker_operator_command_v2(
  'a3000000-0000-4000-8000-000000000008',
  'a3000000-0000-4000-8000-000000000007',
  'resume',
  'a3000000-0000-4000-8000-000000000001',
  :'mb3_account_id'::uuid,
  'mexc','mexc_futures_contract_v1',
  'historical_orders_v1','mexc_historical_orders_capability_v1',
  1,'equora_provider_operator_command_v2',:'mb3_resume_digest'
);
reset role;

set local role equora_broker_runtime_v2;
select public.equora_provider_page_scope_digest_v2(jsonb_build_object(
  'capabilityContractVersion','mexc_historical_orders_capability_v1',
  'capabilityId','historical_orders_v1',
  'checkpointContractVersion','equora_provider_checkpoint_v2',
  'providerCode','mexc',
  'providerContractVersion','mexc_futures_contract_v1',
  'queryContractVersion','mexc_historical_orders_query_v1',
  'queryDigest',repeat('b',64)
)) as mb3_page_scope_digest
\gset

select public.equora_provider_contract_snapshot_digest_v2(
  'mexc','mexc_futures_contract_v1',
  'historical_orders_v1','mexc_historical_orders_capability_v1',
  'equora_provider_page_scope_v2','mexc_historical_orders_query_v1',
  'mexc_page_number_cursor_v1','mexc_historical_orders_response_v1',
  'equora_provider_raw_envelope_v2','blocked_pending_versioned_normalization',
  'equora_provider_checkpoint_v2','equora_provider_checkpoint_hmac_sha256_v2'
) as mb3_contract_snapshot_digest
\gset

select public.equora_provider_checkpoint_mac_v2(
  'mexc','mexc_futures_contract_v1',
  'historical_orders_v1','mexc_historical_orders_capability_v1',
  'equora_provider_checkpoint_v2',:'mb3_contract_snapshot_digest',
  :'mb3_work_unit_id'::uuid,0,
  '{"pageSequence":0,"cursor":null}'::jsonb,
  key_material
) as mb3_checkpoint_mac
from equora_private.broker_capture_integrity_keys
where broker_account_id = :'mb3_account_id'::uuid and status = 'active'
\gset

insert into public.broker_capture_checkpoints_v2 (
  work_unit_id,user_id,broker_account_id,sync_activation_id,
  activation_generation,provider_code,provider_contract_version,
  capability_id,capability_contract_version,page_scope_contract_version,
  query_contract_version,cursor_contract_version,response_contract_version,
  raw_envelope_contract_version,normalization_contract_version,
  checkpoint_contract_version,checkpoint_mac_version,contract_snapshot_digest,page_scope_digest,
  query_digest,checkpoint_generation,row_version,checkpoint_payload,
  checkpoint_mac,checkpoint_status
)
select work_unit.id,work_unit.user_id,work_unit.broker_account_id,
  work_unit.sync_activation_id,work_unit.activation_generation,
  'mexc','mexc_futures_contract_v1','historical_orders_v1',
  'mexc_historical_orders_capability_v1','equora_provider_page_scope_v2',
  'mexc_historical_orders_query_v1','mexc_page_number_cursor_v1',
  'mexc_historical_orders_response_v1','equora_provider_raw_envelope_v2',
  'blocked_pending_versioned_normalization','equora_provider_checkpoint_v2',
  'equora_provider_checkpoint_hmac_sha256_v2',:'mb3_contract_snapshot_digest',:'mb3_page_scope_digest',
  repeat('b',64),0,0,'{"pageSequence":0,"cursor":null}'::jsonb,
  :'mb3_checkpoint_mac','ready'
from public.broker_capture_work_units work_unit
where work_unit.id = :'mb3_work_unit_id'::uuid;

select row_version as mb3_work_unit_row_version
from public.broker_capture_work_units
where id=:'mb3_work_unit_id'::uuid
\gset
reset role;

set local role service_role;
select public.equora_authorize_provider_capture_request_v2(
  'a3000000-0000-4000-8000-000000000009',
  'a3000000-0000-4000-8000-000000000007',2,
  :'mb3_work_unit_id'::uuid,
  :mb3_work_unit_row_version,
  1,0,0,:'mb3_checkpoint_mac',:'mb3_page_scope_digest',repeat('b',64),
  repeat('c',64),clock_timestamp()+interval '30 seconds',
  'equora_provider_request_authority_v2'
);
reset role;

set local role equora_broker_runtime_v2;
select to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as mb3_observed_at
from public.broker_capture_request_authorizations_v2
where id='a3000000-0000-4000-8000-000000000009'
\gset

select jsonb_build_object(
  'capabilityContractVersion','mexc_historical_orders_capability_v1',
  'capabilityId','historical_orders_v1',
  'cursorContractVersion','mexc_page_number_cursor_v1',
  'normalizationContractVersion','blocked_pending_versioned_normalization',
  'observedAtUtc',:'mb3_observed_at',
  'providerCode','mexc',
  'providerContractVersion','mexc_futures_contract_v1',
  'queryContractVersion','mexc_historical_orders_query_v1',
  'rawBodyDigest',repeat('d',64),
  'rawEnvelopeContractVersion','equora_provider_raw_envelope_v2',
  'requestPlanDigest',repeat('c',64),
  'requestSequence',1,
  'pageSequence',0,
  'responseContractVersion','mexc_historical_orders_response_v1',
  'responseDigest',repeat('e',64)
) as mb3_raw_envelope
\gset

select public.equora_tcj_digest_v1(
  'provider_raw_envelope_v2',
  public.equora_tcj_from_jsonb_v1(:'mb3_raw_envelope'::jsonb)
) as mb3_raw_envelope_digest
\gset

select public.equora_provider_checkpoint_mac_v2(
  'mexc','mexc_futures_contract_v1',
  'historical_orders_v1','mexc_historical_orders_capability_v1',
  'equora_provider_checkpoint_v2',:'mb3_contract_snapshot_digest',
  :'mb3_work_unit_id'::uuid,1,
  '{"pageSequence":1,"cursor":null}'::jsonb,
  key_material
) as mb3_next_checkpoint_mac
from equora_private.broker_capture_integrity_keys
where broker_account_id = :'mb3_account_id'::uuid and status = 'active'
\gset
reset role;

-- Exercise the direct SQL trust boundary as the runtime function owner. The
-- service role intentionally has EXECUTE-only access and cannot inspect the
-- private rows needed to construct adversarial fixtures.
set local role equora_broker_runtime_v2;
do $$
declare
  candidate jsonb;
  candidate_digest text;
  base_envelope jsonb;
  next_payload jsonb := '{"pageSequence":1,"cursor":null}'::jsonb;
  auth_row public.broker_capture_request_authorizations_v2%rowtype;
  checkpoint_row public.broker_capture_checkpoints_v2%rowtype;
  work_unit_row public.broker_capture_work_units%rowtype;
  next_mac text;
begin
  select * into strict auth_row from public.broker_capture_request_authorizations_v2
  where id='a3000000-0000-4000-8000-000000000009';
  select * into strict checkpoint_row from public.broker_capture_checkpoints_v2
  where work_unit_id=auth_row.work_unit_id;
  select * into strict work_unit_row from public.broker_capture_work_units
  where id=auth_row.work_unit_id;
  select public.equora_provider_checkpoint_mac_v2(
    checkpoint_row.provider_code,checkpoint_row.provider_contract_version,
    checkpoint_row.capability_id,checkpoint_row.capability_contract_version,
    checkpoint_row.checkpoint_contract_version,checkpoint_row.contract_snapshot_digest,
    checkpoint_row.work_unit_id,checkpoint_row.checkpoint_generation+1,
    next_payload,key_row.key_material
  ) into strict next_mac
  from public.broker_sync_activations activation
  join equora_private.broker_capture_integrity_keys key_row
    on key_row.id=activation.capture_integrity_key_id
  where activation.id=checkpoint_row.sync_activation_id;
  base_envelope := jsonb_build_object(
    'capabilityContractVersion',checkpoint_row.capability_contract_version,
    'capabilityId',checkpoint_row.capability_id,
    'cursorContractVersion',checkpoint_row.cursor_contract_version,
    'normalizationContractVersion',checkpoint_row.normalization_contract_version,
    'observedAtUtc',to_char(auth_row.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'pageSequence',0,'providerCode',checkpoint_row.provider_code,
    'providerContractVersion',checkpoint_row.provider_contract_version,
    'queryContractVersion',checkpoint_row.query_contract_version,
    'rawBodyDigest',repeat('d',64),
    'rawEnvelopeContractVersion',checkpoint_row.raw_envelope_contract_version,
    'requestPlanDigest',repeat('c',64),'requestSequence',1,
    'responseContractVersion',checkpoint_row.response_contract_version,
    'responseDigest',repeat('e',64)
  );

  candidate := base_envelope || jsonb_build_object('providerCode',null);
  candidate_digest := public.equora_tcj_digest_v1(
    'provider_raw_envelope_v2',public.equora_tcj_from_jsonb_v1(candidate));
  begin
    perform public.equora_commit_provider_capture_page_v2(
      'a3000000-0000-4000-8000-000000000030',
      auth_row.id,auth_row.work_unit_id,2,
      work_unit_row.row_version,checkpoint_row.row_version,
      checkpoint_row.checkpoint_generation,checkpoint_row.checkpoint_mac,1,repeat('c',64),
      candidate,candidate_digest,repeat('e',64),
      next_payload,next_mac,
      'continue','unverified','equora_provider_page_commit_v2');
    raise exception 'MB3_NULL_RAW_FIELD_DID_NOT_FAIL';
  exception when others then
    if sqlerrm not like '%MB3_PAGE_COMMIT_INPUT_INVALID%' then raise; end if;
  end;

  foreach candidate in array array[
    (base_envelope || jsonb_build_object('observedAtUtc','2026-02-31T12:00:00.000000Z')),
    (base_envelope || jsonb_build_object('observedAtUtc','2000-01-01T00:00:00.000000Z')),
    (base_envelope || jsonb_build_object('observedAtUtc','2099-01-01T00:00:00.000000Z'))
  ] loop
    candidate_digest := public.equora_tcj_digest_v1(
      'provider_raw_envelope_v2',public.equora_tcj_from_jsonb_v1(candidate));
    begin
      perform public.equora_commit_provider_capture_page_v2(
        'a3000000-0000-4000-8000-000000000031',
        auth_row.id,auth_row.work_unit_id,2,
        work_unit_row.row_version,checkpoint_row.row_version,
        checkpoint_row.checkpoint_generation,checkpoint_row.checkpoint_mac,1,repeat('c',64),
        candidate,candidate_digest,repeat('e',64),
        next_payload,next_mac,
        'continue','unverified','equora_provider_page_commit_v2');
      raise exception 'MB3_OBSERVED_AT_NEGATIVE_DID_NOT_FAIL';
    exception when others then
      if sqlerrm not like '%MB3_RAW_ENVELOPE_OBSERVED_AT_INVALID%'
        and sqlerrm not like '%MB3_PAGE_COMMIT_INPUT_INVALID%'
      then raise; end if;
    end;
  end loop;

  candidate := base_envelope
    || jsonb_build_object('queryContractVersion','mexc_unregistered_query_v9');
  candidate_digest := public.equora_tcj_digest_v1(
    'provider_raw_envelope_v2',public.equora_tcj_from_jsonb_v1(candidate));
  begin
    perform public.equora_commit_provider_capture_page_v2(
      'a3000000-0000-4000-8000-000000000032',
      auth_row.id,auth_row.work_unit_id,2,
      work_unit_row.row_version,checkpoint_row.row_version,
      checkpoint_row.checkpoint_generation,checkpoint_row.checkpoint_mac,1,repeat('c',64),
      candidate,candidate_digest,repeat('e',64),
      next_payload,next_mac,
      'continue','unverified','equora_provider_page_commit_v2');
    raise exception 'MB3_VERSION_DRIFT_DID_NOT_FAIL';
  exception when others then
    if sqlerrm not like '%MB3_RAW_ENVELOPE_BINDING_MISMATCH%' then raise; end if;
  end;

  begin
    perform public.equora_commit_provider_capture_page_v2(
      'a3000000-0000-4000-8000-000000000033',
      auth_row.id,auth_row.work_unit_id,2,
      work_unit_row.row_version,checkpoint_row.row_version,
      checkpoint_row.checkpoint_generation,checkpoint_row.checkpoint_mac,1,repeat('c',64),
      base_envelope,public.equora_tcj_digest_v1(
        'provider_raw_envelope_v2',public.equora_tcj_from_jsonb_v1(base_envelope)),repeat('e',64),
      next_payload,next_mac,
      'continue','partial','equora_provider_page_commit_v2');
    raise exception 'MB3_COMPLETENESS_MATRIX_DID_NOT_FAIL';
  exception when others then
    if sqlerrm not like '%MB3_PAGE_COMMIT_INPUT_INVALID%' then raise; end if;
  end;

  if (select count(*) from public.broker_capture_page_commits_v2) <> 0
  then raise exception 'MB3_NEGATIVE_CASE_PARTIAL_EFFECT'; end if;
end;
$$;
reset role;

\if :{?MB3_CONCURRENCY_SETUP}
commit;
\echo 'MB3 concurrency setup committed before page-commit race.'
\quit
\endif

set local role service_role;
select public.equora_commit_provider_capture_page_v2(
  'a3000000-0000-4000-8000-000000000010',
  'a3000000-0000-4000-8000-000000000009',:'mb3_work_unit_id'::uuid,2,
  :mb3_work_unit_row_version,
  0,0,:'mb3_checkpoint_mac',1,repeat('c',64),
  :'mb3_raw_envelope'::jsonb,:'mb3_raw_envelope_digest',repeat('e',64),
  '{"pageSequence":1,"cursor":null}'::jsonb,:'mb3_next_checkpoint_mac',
  'continue','unverified','equora_provider_page_commit_v2'
);
reset role;

select work_unit.row_version as mb3_retry_work_unit_row_version,
  checkpoint.row_version as mb3_retry_checkpoint_row_version,
  checkpoint.checkpoint_generation as mb3_retry_checkpoint_generation,
  checkpoint.checkpoint_mac as mb3_retry_checkpoint_mac
from public.broker_capture_work_units work_unit
join public.broker_capture_checkpoints_v2 checkpoint
  on checkpoint.work_unit_id=work_unit.id
where work_unit.id=:'mb3_work_unit_id'::uuid
\gset

set local role service_role;
select public.equora_authorize_provider_capture_request_v2(
  'a3000000-0000-4000-8000-000000000016',
  'a3000000-0000-4000-8000-000000000007',2,
  :'mb3_work_unit_id'::uuid,:mb3_retry_work_unit_row_version,
  2,:mb3_retry_checkpoint_row_version,:mb3_retry_checkpoint_generation,
  :'mb3_retry_checkpoint_mac',:'mb3_page_scope_digest',repeat('b',64),
  repeat('f',64),clock_timestamp()+interval '250 milliseconds',
  'equora_provider_request_authority_v2'
);
select pg_sleep(0.35);
select public.equora_authorize_provider_capture_request_v2(
  'a3000000-0000-4000-8000-000000000017',
  'a3000000-0000-4000-8000-000000000007',2,
  :'mb3_work_unit_id'::uuid,:mb3_retry_work_unit_row_version,
  2,:mb3_retry_checkpoint_row_version,:mb3_retry_checkpoint_generation,
  :'mb3_retry_checkpoint_mac',:'mb3_page_scope_digest',repeat('b',64),
  repeat('f',64),clock_timestamp()+interval '30 seconds',
  'equora_provider_request_authority_v2'
);
reset role;

do $$
begin
  if (select authorization_status from public.broker_capture_request_authorizations_v2
      where id='a3000000-0000-4000-8000-000000000016') <> 'revoked'
    or (select revocation_reason from public.broker_capture_request_authorizations_v2
      where id='a3000000-0000-4000-8000-000000000016') <> 'send_deadline_expired'
    or (select authorization_status from public.broker_capture_request_authorizations_v2
      where id='a3000000-0000-4000-8000-000000000017') <> 'issued'
    or (select authorization_attempt from public.broker_capture_request_authorizations_v2
      where id='a3000000-0000-4000-8000-000000000017') <> 2
  then raise exception 'MB3_REQUEST_AUTH_RETRY_INVALID'; end if;
end;
$$;

-- Force all deferred historical-receipt foreign keys before the outer
-- transaction is rolled back. This prevents ROLLBACK from masking an invalid
-- immutable receipt after the mutable enrollment generation advances.
set constraints all immediate;

set local role equora_broker_operator_control_v2;
do $$
begin
  if (select runtime_state from public.broker_runtime_enrollments_v2
      where id='a3000000-0000-4000-8000-000000000007') <> 'active'
    or (select generation from public.broker_runtime_enrollments_v2
      where id='a3000000-0000-4000-8000-000000000007') <> 2
    or (select count(*) from public.broker_operator_control_receipts_v2) <> 7
    or (select count(*) from public.broker_runtime_enrollments_v2
        where runtime_state <> 'revoked') <> 4
    or (select count(distinct broker_account_id) from public.broker_runtime_enrollments_v2
        where runtime_state <> 'revoked') <> 1
  then raise exception 'MB3_OPERATOR_STATE_INVALID'; end if;
end;
$$;
reset role;

set local role equora_broker_runtime_v2;
do $$
begin
  if (select authorization_status
        from public.broker_capture_request_authorizations_v2
        where id='a3000000-0000-4000-8000-000000000009') <> 'consumed'
    or (select count(*) from public.broker_capture_page_commits_v2
        where id='a3000000-0000-4000-8000-000000000010') <> 1
    or (select checkpoint_generation from public.broker_capture_checkpoints_v2
        where work_unit_id=(select work_unit_id
          from public.broker_capture_page_commits_v2
          where id='a3000000-0000-4000-8000-000000000010')) <> 1
    or (select request_sequence from public.broker_capture_work_units
        where id=(select work_unit_id
          from public.broker_capture_page_commits_v2
          where id='a3000000-0000-4000-8000-000000000010')) <> 1
  then raise exception 'MB3_RUNTIME_STATE_INVALID'; end if;

  if has_table_privilege('service_role','public.broker_runtime_enrollments_v2','insert')
    or has_table_privilege('service_role','public.broker_capture_page_commits_v2','insert')
    or has_function_privilege('service_role',
      'public.equora_apply_broker_operator_command_v2(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text,text)',
      'execute')
  then raise exception 'MB3_DIRECT_AUTHORITY_LEAK'; end if;
end;
$$;
reset role;

do $$
begin
  if (select count(*) from public.trades) <> 0
    or (select count(*) from public.trade_import_batches) <> 0
  then raise exception 'MB3_IMPORT_SIDE_EFFECT'; end if;
end;
$$;

rollback;

select equora_private.equora_verify_multibroker_mb3_v1();

\echo 'MB3 integration PASS: provider-neutral enrollment/request/page-commit remained local, transactional and non-importing.'
