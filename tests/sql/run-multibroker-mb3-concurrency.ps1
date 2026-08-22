param(
  [string]$ContainerName = 'equora-v5761-mb3-pinned',
  [string]$TestDatabase = 'equora_mb3_concurrency',
  [switch]$KeepDatabase
)
. (Join-Path $PSScriptRoot 'multibroker-mb3-test-lib.ps1')
Initialize-Mb3TestContext $ContainerName $TestDatabase
$worker = {
  param($Container, $Database, $Sql)
  $output = $Sql | & docker exec -i $Container psql -U postgres -d $Database -v ON_ERROR_STOP=1 2>&1
  [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($output -join "`n") }
}
try {
  New-Mb3BaseDatabase
  Install-Mb3Migration
  $setup = @'
insert into auth.users(id) values ('a3100000-0000-4000-8000-000000000001');
insert into auth.users(id) values ('a3110000-0000-4000-8000-000000000001');
insert into public.broker_accounts(id,user_id,provider_code,environment,capability_profile_id,provider_contract_version,status,retention_status)
values ('a3100000-0000-4000-8000-000000000002','a3100000-0000-4000-8000-000000000001','mexc','live','mexc_futures_rest','mexc_futures_contract_v1','active','active');
insert into public.broker_accounts(id,user_id,provider_code,environment,capability_profile_id,provider_contract_version,status,retention_status)
values
  ('a3110000-0000-4000-8000-000000000002','a3110000-0000-4000-8000-000000000001','mexc','live','mexc_futures_rest','mexc_futures_contract_v1','active','active'),
  ('a3110000-0000-4000-8000-000000000003','a3110000-0000-4000-8000-000000000001','mexc','live','mexc_futures_rest','mexc_futures_contract_v1','active','active');
grant equora_broker_operator_control_v2 to postgres;
set role equora_broker_operator_control_v2;
select public.equora_apply_broker_operator_command_v2(
  'a3100000-0000-4000-8000-000000000003','a3100000-0000-4000-8000-000000000004','enroll',
  'a3100000-0000-4000-8000-000000000001','a3100000-0000-4000-8000-000000000002',
  'mexc','mexc_futures_contract_v1','historical_orders_v1','mexc_historical_orders_capability_v1',0,
  'equora_provider_operator_command_v2',public.equora_provider_operator_command_digest_v2(
    'a3100000-0000-4000-8000-000000000003','a3100000-0000-4000-8000-000000000004','enroll',
    'a3100000-0000-4000-8000-000000000001','a3100000-0000-4000-8000-000000000002',
    'mexc','mexc_futures_contract_v1','historical_orders_v1','mexc_historical_orders_capability_v1',0,
    'equora_provider_operator_command_v2'));
reset role;
'@
  Invoke-Mb3SqlText $setup 'Concurrency setup' | Out-Null
  function New-QuotaEnrollSql([string]$CommandId, [string]$EnrollmentId, [string]$AccountId, [int]$HoldSeconds) {
    return @"
begin;
set local role equora_broker_operator_control_v2;
select public.equora_apply_broker_operator_command_v2(
  '$CommandId','$EnrollmentId','enroll',
  'a3110000-0000-4000-8000-000000000001','$AccountId',
  'mexc','mexc_futures_contract_v1','historical_orders_v1','mexc_historical_orders_capability_v1',0,
  'equora_provider_operator_command_v2',public.equora_provider_operator_command_digest_v2(
    '$CommandId','$EnrollmentId','enroll',
    'a3110000-0000-4000-8000-000000000001','$AccountId',
    'mexc','mexc_futures_contract_v1','historical_orders_v1','mexc_historical_orders_capability_v1',0,
    'equora_provider_operator_command_v2'));
select pg_sleep($HoldSeconds);
commit;
"@
  }
  $quotaWinner = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-QuotaEnrollSql 'a3110000-0000-4000-8000-000000000004' 'a3110000-0000-4000-8000-000000000006' 'a3110000-0000-4000-8000-000000000002' 1)
  Start-Sleep -Milliseconds 200
  $quotaLoser = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-QuotaEnrollSql 'a3110000-0000-4000-8000-000000000005' 'a3110000-0000-4000-8000-000000000007' 'a3110000-0000-4000-8000-000000000003' 0)
  $quotaFirst = Receive-Job -Job $quotaWinner -Wait
  $quotaSecond = Receive-Job -Job $quotaLoser -Wait
  Remove-Job $quotaWinner,$quotaLoser -Force
  if ($quotaFirst.ExitCode -ne 0 -or $quotaFirst.Output -notmatch 'operator_command_applied' -or $quotaSecond.ExitCode -eq 0 -or $quotaSecond.Output -notmatch 'MB3_OPERATOR_ENROLLMENT_CAP_REACHED') {
    throw "Enrollment-cap concurrency outcome invalid.`nWinner: $($quotaFirst.Output)`nLoser: $($quotaSecond.Output)"
  }
  $quotaState = Get-Mb3Scalar "select count(distinct broker_account_id),count(*) from public.broker_runtime_enrollments_v2 where user_id='a3110000-0000-4000-8000-000000000001' and runtime_state<>'revoked';"
  if ($quotaState -ne '1|1') { throw "Enrollment-cap concurrency state invalid: $quotaState" }

  function New-ResumeSql([string]$CommandId, [int]$HoldSeconds) {
    return @"
begin;
set local role equora_broker_operator_control_v2;
select public.equora_apply_broker_operator_command_v2(
  '$CommandId','a3100000-0000-4000-8000-000000000004','resume',
  'a3100000-0000-4000-8000-000000000001','a3100000-0000-4000-8000-000000000002',
  'mexc','mexc_futures_contract_v1','historical_orders_v1','mexc_historical_orders_capability_v1',1,
  'equora_provider_operator_command_v2',public.equora_provider_operator_command_digest_v2(
    '$CommandId','a3100000-0000-4000-8000-000000000004','resume',
    'a3100000-0000-4000-8000-000000000001','a3100000-0000-4000-8000-000000000002',
    'mexc','mexc_futures_contract_v1','historical_orders_v1','mexc_historical_orders_capability_v1',1,
    'equora_provider_operator_command_v2'));
select pg_sleep($HoldSeconds);
commit;
"@
  }
  $winner = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-ResumeSql 'a3100000-0000-4000-8000-000000000005' 1)
  Start-Sleep -Milliseconds 200
  $loser = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-ResumeSql 'a3100000-0000-4000-8000-000000000006' 0)
  $first = Receive-Job -Job $winner -Wait
  $second = Receive-Job -Job $loser -Wait
  Remove-Job $winner,$loser -Force
  if ($first.ExitCode -ne 0 -or $first.Output -notmatch 'operator_command_applied' -or $second.ExitCode -eq 0 -or $second.Output -notmatch 'MB3_OPERATOR_(GENERATION_MISMATCH|STATE_TRANSITION_INVALID)') {
    throw "Concurrency outcome invalid.`nWinner: $($first.Output)`nLoser: $($second.Output)"
  }
  $state = Get-Mb3Scalar "select runtime_state,generation,authority_epoch,(select count(*) from public.broker_operator_control_receipts_v2 where action='resume') from public.broker_runtime_enrollments_v2 where id='a3100000-0000-4000-8000-000000000004';"
  if ($state -ne 'active|2|2|1') { throw "Concurrency state invalid: $state" }

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $fixtureOutput = (Read-Mb3Utf8File $script:Mb3IntegrationPath) | & docker exec -i $ContainerName `
    psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -v MB3_CONCURRENCY_SETUP=1 2>&1
  $fixtureExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($fixtureExitCode -ne 0 -or ($fixtureOutput -join "`n") -notmatch 'concurrency setup committed') {
    throw "Page concurrency setup failed: $($fixtureOutput -join [Environment]::NewLine)"
  }

  function New-PageCommitSql(
    [string]$PageCommitId,
    [double]$HoldSeconds,
    [string]$AuthorizationId = 'a3000000-0000-4000-8000-000000000009',
    [string]$ApplicationName = 'mb3_page_commit_worker',
    [ValidateSet('commit','rollback')][string]$TransactionEnd = 'commit'
  ) {
    return @"
begin;
set application_name='$ApplicationName';
select work_unit.row_version as mb3_work_unit_row_version,
  work_unit.id as mb3_work_unit_id,
  checkpoint.checkpoint_mac as mb3_checkpoint_mac,
  checkpoint.contract_snapshot_digest as mb3_contract_snapshot_digest,
  auth_row.request_plan_digest as mb3_request_plan_digest,
  to_char(auth_row.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as mb3_observed_at,
  public.equora_provider_checkpoint_mac_v2(
    checkpoint.provider_code,checkpoint.provider_contract_version,
    checkpoint.capability_id,checkpoint.capability_contract_version,
    checkpoint.checkpoint_contract_version,checkpoint.contract_snapshot_digest,
    checkpoint.work_unit_id,1,
    '{"pageSequence":1,"cursor":null}'::jsonb,key_row.key_material
  ) as mb3_next_checkpoint_mac,
  public.equora_tcj_digest_v1('provider_raw_envelope_v2',public.equora_tcj_from_jsonb_v1(jsonb_build_object(
    'capabilityContractVersion','mexc_historical_orders_capability_v1',
    'capabilityId','historical_orders_v1','cursorContractVersion','mexc_page_number_cursor_v1',
    'normalizationContractVersion','blocked_pending_versioned_normalization',
    'observedAtUtc',to_char(auth_row.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'pageSequence',0,
    'providerCode','mexc','providerContractVersion','mexc_futures_contract_v1',
    'queryContractVersion','mexc_historical_orders_query_v1','rawBodyDigest',repeat('d',64),
    'rawEnvelopeContractVersion','equora_provider_raw_envelope_v2',
    'requestPlanDigest',auth_row.request_plan_digest,'requestSequence',1,
    'responseContractVersion','mexc_historical_orders_response_v1','responseDigest',repeat('e',64)
  ))) as mb3_raw_envelope_digest
from public.broker_capture_request_authorizations_v2 auth_row
join public.broker_capture_work_units work_unit on work_unit.id=auth_row.work_unit_id
join public.broker_capture_checkpoints_v2 checkpoint on checkpoint.work_unit_id=work_unit.id
join public.broker_sync_activations activation on activation.id=checkpoint.sync_activation_id
join equora_private.broker_capture_integrity_keys key_row
  on key_row.id=activation.capture_integrity_key_id
where auth_row.id='$AuthorizationId'
\gset
set local role service_role;
select public.equora_commit_provider_capture_page_v2(
  '$PageCommitId','$AuthorizationId',:'mb3_work_unit_id'::uuid,2,
  :mb3_work_unit_row_version,0,0,:'mb3_checkpoint_mac',
  1,:'mb3_request_plan_digest',
  jsonb_build_object(
    'capabilityContractVersion','mexc_historical_orders_capability_v1',
    'capabilityId','historical_orders_v1','cursorContractVersion','mexc_page_number_cursor_v1',
    'normalizationContractVersion','blocked_pending_versioned_normalization',
    'observedAtUtc',:'mb3_observed_at','pageSequence',0,
    'providerCode','mexc','providerContractVersion','mexc_futures_contract_v1',
    'queryContractVersion','mexc_historical_orders_query_v1','rawBodyDigest',repeat('d',64),
    'rawEnvelopeContractVersion','equora_provider_raw_envelope_v2',
    'requestPlanDigest',:'mb3_request_plan_digest','requestSequence',1,
    'responseContractVersion','mexc_historical_orders_response_v1','responseDigest',repeat('e',64)
  ),
  :'mb3_raw_envelope_digest',
  repeat('e',64),'{"pageSequence":1,"cursor":null}'::jsonb,:'mb3_next_checkpoint_mac',
  'continue','unverified','equora_provider_page_commit_v2'
);
select pg_sleep($HoldSeconds);
$TransactionEnd;
"@
  }

  function New-StaleAuthorizationSql(
    [string]$AuthorizationId,
    [string]$DeadlineInterval = '30 seconds'
  ) {
    return @"
begin;
select work_unit.row_version as mb3_work_unit_row_version,
  work_unit.id as mb3_work_unit_id,
  checkpoint.row_version as mb3_checkpoint_row_version,
  checkpoint.checkpoint_generation as mb3_checkpoint_generation,
  checkpoint.checkpoint_mac as mb3_checkpoint_mac,
  auth_row.page_scope_digest as mb3_page_scope_digest,
  auth_row.query_digest as mb3_query_digest
from public.broker_capture_request_authorizations_v2 auth_row
join public.broker_capture_work_units work_unit on work_unit.id=auth_row.work_unit_id
join public.broker_capture_checkpoints_v2 checkpoint on checkpoint.work_unit_id=work_unit.id
where auth_row.id='a3000000-0000-4000-8000-000000000009'
\gset
set local role service_role;
select public.equora_authorize_provider_capture_request_v2(
  '$AuthorizationId','a3000000-0000-4000-8000-000000000007',2,
  :'mb3_work_unit_id'::uuid,:mb3_work_unit_row_version,1,
  :mb3_checkpoint_row_version,:mb3_checkpoint_generation,
  :'mb3_checkpoint_mac',:'mb3_page_scope_digest',:'mb3_query_digest',
  repeat('f',64),clock_timestamp()+interval '$DeadlineInterval',
  'equora_provider_request_authority_v2'
);
commit;
"@
  }

  function New-ReplayAuthorizationSql(
    [string]$AuthorizationId,
    [string]$DeadlineUtc
  ) {
    return @"
begin;
select work_unit.row_version as mb3_work_unit_row_version,
  work_unit.id as mb3_work_unit_id,
  checkpoint.row_version as mb3_checkpoint_row_version,
  checkpoint.checkpoint_generation as mb3_checkpoint_generation,
  checkpoint.checkpoint_mac as mb3_checkpoint_mac,
  auth_row.page_scope_digest as mb3_page_scope_digest,
  auth_row.query_digest as mb3_query_digest
from public.broker_capture_request_authorizations_v2 auth_row
join public.broker_capture_work_units work_unit on work_unit.id=auth_row.work_unit_id
join public.broker_capture_checkpoints_v2 checkpoint on checkpoint.work_unit_id=work_unit.id
where auth_row.id='a3000000-0000-4000-8000-000000000009'
\gset
set local role service_role;
select public.equora_authorize_provider_capture_request_v2(
  '$AuthorizationId','a3000000-0000-4000-8000-000000000007',2,
  :'mb3_work_unit_id'::uuid,:mb3_work_unit_row_version,1,
  :mb3_checkpoint_row_version,:mb3_checkpoint_generation,
  :'mb3_checkpoint_mac',:'mb3_page_scope_digest',:'mb3_query_digest',
  repeat('f',64),'$DeadlineUtc'::timestamptz,
  'equora_provider_request_authority_v2'
);
commit;
"@
  }

  function New-WorkUnitDeadlineLockerSql(
    [string]$ApplicationName,
    [double]$HoldSeconds
  ) {
    return @"
begin;
set application_name='$ApplicationName';
select 1 from public.broker_capture_work_units
where id=(
  select work_unit_id from public.broker_capture_request_authorizations_v2
  where id='a3000000-0000-4000-8000-000000000009'
)
for update;
select pg_sleep($HoldSeconds);
commit;
"@
  }

  function New-AuthorizationDeadlineLockerSql(
    [string]$ApplicationName,
    [string]$AuthorizationId,
    [double]$HoldSeconds
  ) {
    return @"
begin;
set application_name='$ApplicationName';
select 1 from public.broker_capture_request_authorizations_v2
where id='$AuthorizationId'
for update;
select pg_sleep($HoldSeconds);
commit;
"@
  }

  function New-WorkUnitAuthorizationSql(
    [string]$AuthorizationId,
    [string]$WorkUnitId,
    [string]$DeadlineInterval,
    [double]$HoldSeconds = 0,
    [string]$ApplicationName = 'mb3_request_authorization_worker',
    [ValidateSet('commit','rollback')][string]$TransactionEnd = 'commit'
  ) {
    return @"
begin;
set application_name='$ApplicationName';
select work_unit.row_version as mb3_work_unit_row_version,
  checkpoint.row_version as mb3_checkpoint_row_version,
  checkpoint.checkpoint_generation as mb3_checkpoint_generation,
  checkpoint.checkpoint_mac as mb3_checkpoint_mac,
  checkpoint.page_scope_digest as mb3_page_scope_digest,
  checkpoint.query_digest as mb3_query_digest
from public.broker_capture_work_units work_unit
join public.broker_capture_checkpoints_v2 checkpoint
  on checkpoint.work_unit_id=work_unit.id
where work_unit.id='$WorkUnitId'
\gset
set local role service_role;
select public.equora_authorize_provider_capture_request_v2(
  '$AuthorizationId','a3000000-0000-4000-8000-000000000007',2,
  '$WorkUnitId',:mb3_work_unit_row_version,1,
  :mb3_checkpoint_row_version,:mb3_checkpoint_generation,
  :'mb3_checkpoint_mac',:'mb3_page_scope_digest',:'mb3_query_digest',
  repeat('f',64),clock_timestamp()+interval '$DeadlineInterval',
  'equora_provider_request_authority_v2'
);
select pg_sleep($HoldSeconds);
$TransactionEnd;
"@
  }

  function New-SecondaryWorkUnitFixtureSql(
    [string]$SourceWorkUnitId,
    [string]$SecondaryWorkUnitId,
    [string]$SecondaryScopeId
  ) {
    return @"
begin;
insert into public.broker_sync_scopes
select (
  jsonb_populate_record(
    null::public.broker_sync_scopes,
    to_jsonb(source_scope) || jsonb_build_object(
      'id','$SecondaryScopeId',
      'scope_digest',repeat('8',64),
      'created_at',clock_timestamp()
    )
  )
).*
from public.broker_sync_scopes source_scope
where source_scope.id=(
  select scope_id from public.broker_capture_work_units
  where id='$SourceWorkUnitId'
);

insert into public.broker_capture_work_units
select (
  jsonb_populate_record(
    null::public.broker_capture_work_units,
    to_jsonb(source_work_unit) || jsonb_build_object(
      'id','$SecondaryWorkUnitId',
      'scope_id','$SecondaryScopeId',
      'row_version',0,
      'request_sequence',0,
      'claim_count',0,
      'claim_policy_version',null,
      'last_claim_request_id',null,
      'claimed_at',null,
      'successful_page_count',0,
      'observed_event_count',0,
      'response_bytes',0,
      'created_at',clock_timestamp(),
      'updated_at',clock_timestamp()
    )
  )
).*
from public.broker_capture_work_units source_work_unit
where source_work_unit.id='$SourceWorkUnitId';

insert into public.broker_capture_checkpoints_v2 (
  work_unit_id,user_id,broker_account_id,sync_activation_id,
  activation_generation,provider_code,provider_contract_version,
  capability_id,capability_contract_version,page_scope_contract_version,
  query_contract_version,cursor_contract_version,response_contract_version,
  raw_envelope_contract_version,normalization_contract_version,
  checkpoint_contract_version,checkpoint_mac_version,contract_snapshot_digest,
  page_scope_digest,query_digest,checkpoint_generation,row_version,
  checkpoint_payload,checkpoint_mac,checkpoint_status
)
select '$SecondaryWorkUnitId',checkpoint.user_id,checkpoint.broker_account_id,
  checkpoint.sync_activation_id,checkpoint.activation_generation,
  checkpoint.provider_code,checkpoint.provider_contract_version,
  checkpoint.capability_id,checkpoint.capability_contract_version,
  checkpoint.page_scope_contract_version,checkpoint.query_contract_version,
  checkpoint.cursor_contract_version,checkpoint.response_contract_version,
  checkpoint.raw_envelope_contract_version,
  checkpoint.normalization_contract_version,
  checkpoint.checkpoint_contract_version,checkpoint.checkpoint_mac_version,
  checkpoint.contract_snapshot_digest,checkpoint.page_scope_digest,
  checkpoint.query_digest,0,0,checkpoint.checkpoint_payload,
  public.equora_provider_checkpoint_mac_v2(
    checkpoint.provider_code,checkpoint.provider_contract_version,
    checkpoint.capability_id,checkpoint.capability_contract_version,
    checkpoint.checkpoint_contract_version,
    checkpoint.contract_snapshot_digest,'$SecondaryWorkUnitId',0,
    checkpoint.checkpoint_payload,key_row.key_material
  ),'ready'
from public.broker_capture_checkpoints_v2 checkpoint
join public.broker_sync_activations activation
  on activation.id=checkpoint.sync_activation_id
join equora_private.broker_capture_integrity_keys key_row
  on key_row.id=activation.capture_integrity_key_id
where checkpoint.work_unit_id='$SourceWorkUnitId';
commit;
"@
  }

  function Wait-Mb3DeadlineLocker(
    [string]$ApplicationName,
    [System.Management.Automation.Job]$LockerJob = $null
  ) {
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
      $ready = Get-Mb3Scalar "select count(*) from pg_stat_activity where application_name='$ApplicationName' and wait_event='PgSleep';"
      if ($ready -eq '1') { return }
      if ($null -ne $LockerJob -and $LockerJob.State -in @('Completed','Failed','Stopped')) {
        $lockerResult = Receive-Job -Job $LockerJob -Keep
        throw "Deadline locker ended before PgSleep: $ApplicationName; state=$($LockerJob.State); exit=$($lockerResult.ExitCode); output=$($lockerResult.Output)"
      }
      Start-Sleep -Milliseconds 50
    }
    throw "Deadline locker did not reach PgSleep: $ApplicationName"
  }

  function New-UserFkWaitLockerSql(
    [string]$ApplicationName,
    [double]$HoldSeconds = 1.5
  ) {
    return @"
begin;
set application_name='$ApplicationName';
select id from auth.users
where id='a3000000-0000-4000-8000-000000000001'
for update;
select pg_sleep($HoldSeconds);
rollback;
"@
  }

  $runtimeStateSql = "select (select count(*) from public.broker_capture_request_authorizations_v2),(select count(*) from public.broker_runtime_authority_receipts_v2),(select count(*) from public.broker_capture_page_commits_v2),checkpoint.checkpoint_generation,checkpoint.row_version,work_unit.row_version,work_unit.request_sequence from public.broker_capture_work_units work_unit join public.broker_capture_checkpoints_v2 checkpoint on checkpoint.work_unit_id=work_unit.id where work_unit.id=(select work_unit_id from public.broker_capture_request_authorizations_v2 where id='a3000000-0000-4000-8000-000000000009');"

  # Cross-work-unit and cross-action ID guards must be acquired before replay
  # reads and row-authority locks. Each blocker reaches the effect path, holds
  # the shared guard, and rolls back only after the contender deadline.
  $primaryWorkUnitId = Get-Mb3Scalar "select work_unit_id::text from public.broker_capture_request_authorizations_v2 where id='a3000000-0000-4000-8000-000000000009';"
  $secondaryWorkUnitId = 'a3230000-0000-4000-8000-000000000001'
  $secondaryScopeId = 'a3230000-0000-4000-8000-000000000002'
  $secondaryAuthorizationId = 'a3230000-0000-4000-8000-000000000003'
  Invoke-Mb3SqlText `
    (New-SecondaryWorkUnitFixtureSql $primaryWorkUnitId $secondaryWorkUnitId `
      $secondaryScopeId) `
    'Create second work unit for global-ID collision races' | Out-Null
  $globalIdStateSql = "select (select count(*) from public.broker_capture_request_authorizations_v2),(select count(*) from public.broker_runtime_authority_receipts_v2),(select count(*) from public.broker_capture_page_commits_v2),(select row_version||'/'||request_sequence from public.broker_capture_work_units where id='$primaryWorkUnitId'),(select checkpoint_generation||'/'||row_version from public.broker_capture_checkpoints_v2 where work_unit_id='$primaryWorkUnitId'),(select row_version||'/'||request_sequence from public.broker_capture_work_units where id='$secondaryWorkUnitId'),(select checkpoint_generation||'/'||row_version from public.broker_capture_checkpoints_v2 where work_unit_id='$secondaryWorkUnitId');"

  $sharedRequestId = 'a3240000-0000-4000-8000-000000000001'
  $requestIdStateBefore = Get-Mb3Scalar $globalIdStateSql
  $requestIdBlockerName = 'mb3_request_id_guard_blocker'
  $requestIdBlocker = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(
    New-WorkUnitAuthorizationSql $sharedRequestId $secondaryWorkUnitId `
      '30 seconds' 1.5 $requestIdBlockerName 'rollback'
  )
  Wait-Mb3DeadlineLocker $requestIdBlockerName $requestIdBlocker
  $requestIdContender = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(
    New-WorkUnitAuthorizationSql $sharedRequestId $primaryWorkUnitId `
      '100 milliseconds' 0 'mb3_request_id_guard_contender' 'commit'
  )
  $requestIdBlockerResult = Receive-Job -Job $requestIdBlocker -Wait
  $requestIdContenderResult = Receive-Job -Job $requestIdContender -Wait
  Remove-Job $requestIdBlocker,$requestIdContender -Force
  if ($requestIdBlockerResult.ExitCode -ne 0 `
    -or $requestIdBlockerResult.Output -notmatch 'request_authorized' `
    -or $requestIdContenderResult.ExitCode -eq 0 `
    -or $requestIdContenderResult.Output -notmatch 'MB3_REQUEST_AUTH_DEADLINE_EXPIRED') {
    throw "Cross-work-unit request-ID guard outcome invalid.`nBlocker: $($requestIdBlockerResult.Output)`nContender: $($requestIdContenderResult.Output)"
  }
  $requestIdStateAfter = Get-Mb3Scalar $globalIdStateSql
  if ($requestIdStateAfter -ne $requestIdStateBefore) {
    throw "Cross-work-unit request-ID guard produced durable effects. Before=$requestIdStateBefore After=$requestIdStateAfter"
  }

  Invoke-Mb3SqlText `
    (New-WorkUnitAuthorizationSql $secondaryAuthorizationId $secondaryWorkUnitId `
      '45 seconds' 0 'mb3_secondary_authorization' 'commit') `
    'Create second-work-unit authorization for Page-ID races' | Out-Null

  $sharedPageId = 'a3240000-0000-4000-8000-000000000002'
  $pageIdBlockerName = 'mb3_page_id_guard_blocker'
  $pageIdBlocker = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(
    New-PageCommitSql $sharedPageId 1.5 $secondaryAuthorizationId `
      $pageIdBlockerName 'rollback'
  )
  Wait-Mb3DeadlineLocker $pageIdBlockerName $pageIdBlocker
  Invoke-Mb3SqlText "update public.broker_capture_request_authorizations_v2 set send_deadline_at=clock_timestamp()+interval '700 milliseconds' where id='a3000000-0000-4000-8000-000000000009';" 'Prepare cross-work-unit Page-ID deadline' | Out-Null
  $pageIdStateBefore = Get-Mb3Scalar $globalIdStateSql
  $pageIdContender = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(
    New-PageCommitSql $sharedPageId 0 'a3000000-0000-4000-8000-000000000009' `
      'mb3_page_id_guard_contender' 'commit'
  )
  $pageIdBlockerResult = Receive-Job -Job $pageIdBlocker -Wait
  $pageIdContenderResult = Receive-Job -Job $pageIdContender -Wait
  Remove-Job $pageIdBlocker,$pageIdContender -Force
  if ($pageIdBlockerResult.ExitCode -ne 0 `
    -or $pageIdBlockerResult.Output -notmatch 'page_committed' `
    -or $pageIdContenderResult.ExitCode -eq 0 `
    -or $pageIdContenderResult.Output -notmatch 'MB3_PAGE_COMMIT_AUTHORIZATION_INVALID') {
    throw "Cross-work-unit Page-ID guard outcome invalid.`nBlocker: $($pageIdBlockerResult.Output)`nContender: $($pageIdContenderResult.Output)"
  }
  $pageIdStateAfter = Get-Mb3Scalar $globalIdStateSql
  if ($pageIdStateAfter -ne $pageIdStateBefore) {
    throw "Cross-work-unit Page-ID guard produced durable effects. Before=$pageIdStateBefore After=$pageIdStateAfter"
  }
  Invoke-Mb3SqlText "update public.broker_capture_request_authorizations_v2 set send_deadline_at=clock_timestamp()+interval '30 seconds' where id='a3000000-0000-4000-8000-000000000009';" 'Restore base Authorization after Page-ID race' | Out-Null

  $crossActionId = 'a3240000-0000-4000-8000-000000000003'
  $crossActionBlockerName = 'mb3_cross_action_id_guard_blocker'
  $crossActionBlocker = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(
    New-PageCommitSql $crossActionId 1.5 $secondaryAuthorizationId `
      $crossActionBlockerName 'rollback'
  )
  Wait-Mb3DeadlineLocker $crossActionBlockerName $crossActionBlocker
  Invoke-Mb3SqlText "update public.broker_capture_request_authorizations_v2 set authorization_status='revoked',revoked_at=clock_timestamp(),revocation_reason='cross_action_id_guard_test' where id='a3000000-0000-4000-8000-000000000009';" 'Prepare cross-action Request contender' | Out-Null
  $crossActionStateBefore = Get-Mb3Scalar $globalIdStateSql
  $crossActionContender = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(
    New-WorkUnitAuthorizationSql $crossActionId $primaryWorkUnitId `
      '100 milliseconds' 0 'mb3_cross_action_id_guard_contender' 'commit'
  )
  $crossActionBlockerResult = Receive-Job -Job $crossActionBlocker -Wait
  $crossActionContenderResult = Receive-Job -Job $crossActionContender -Wait
  Remove-Job $crossActionBlocker,$crossActionContender -Force
  if ($crossActionBlockerResult.ExitCode -ne 0 `
    -or $crossActionBlockerResult.Output -notmatch 'page_committed' `
    -or $crossActionContenderResult.ExitCode -eq 0 `
    -or $crossActionContenderResult.Output -notmatch 'MB3_REQUEST_AUTH_DEADLINE_EXPIRED') {
    throw "Cross-action Receipt-ID guard outcome invalid.`nBlocker: $($crossActionBlockerResult.Output)`nContender: $($crossActionContenderResult.Output)"
  }
  $crossActionStateAfter = Get-Mb3Scalar $globalIdStateSql
  if ($crossActionStateAfter -ne $crossActionStateBefore) {
    throw "Cross-action Receipt-ID guard produced durable effects. Before=$crossActionStateBefore After=$crossActionStateAfter"
  }
  Invoke-Mb3SqlText "update public.broker_capture_request_authorizations_v2 set authorization_status='issued',revoked_at=null,revocation_reason=null,send_deadline_at=clock_timestamp()+interval '30 seconds' where id='a3000000-0000-4000-8000-000000000009';" 'Restore base Authorization after cross-action race' | Out-Null

  # The first Request/Page inserts have direct auth.users FKs. A privileged
  # parent-row lock may therefore wait after the pre-insert deadline sample.
  # The post-insert sample must reject and roll the whole transaction back.
  Invoke-Mb3SqlText "update public.broker_capture_request_authorizations_v2 set authorization_status='revoked',revoked_at=clock_timestamp(),revocation_reason='request_user_fk_wait_test' where id='a3000000-0000-4000-8000-000000000009';" 'Prepare request auth.users FK wait race' | Out-Null
  $requestUserFkStateBefore = Get-Mb3Scalar $globalIdStateSql
  $requestUserFkBlockerName = 'mb3_request_user_fk_wait_blocker'
  $requestUserFkBlocker = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-UserFkWaitLockerSql $requestUserFkBlockerName)
  Wait-Mb3DeadlineLocker $requestUserFkBlockerName $requestUserFkBlocker
  $requestUserFkContender = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-WorkUnitAuthorizationSql 'a3250000-0000-4000-8000-000000000001' $primaryWorkUnitId '100 milliseconds' 0 'mb3_request_user_fk_wait_contender' 'commit')
  $requestUserFkBlockerResult = Receive-Job -Job $requestUserFkBlocker -Wait
  $requestUserFkContenderResult = Receive-Job -Job $requestUserFkContender -Wait
  Remove-Job $requestUserFkBlocker,$requestUserFkContender -Force
  if ($requestUserFkBlockerResult.ExitCode -ne 0 -or $requestUserFkContenderResult.ExitCode -eq 0 -or $requestUserFkContenderResult.Output -notmatch 'MB3_REQUEST_AUTH_DEADLINE_EXPIRED') {
    throw "Request auth.users FK wait outcome invalid. Blocker=$($requestUserFkBlockerResult.Output) Contender=$($requestUserFkContenderResult.Output)"
  }
  $requestUserFkStateAfter = Get-Mb3Scalar $globalIdStateSql
  if ($requestUserFkStateAfter -ne $requestUserFkStateBefore) {
    throw "Request auth.users FK wait produced durable effects. Before=$requestUserFkStateBefore After=$requestUserFkStateAfter"
  }
  Invoke-Mb3SqlText "update public.broker_capture_request_authorizations_v2 set authorization_status='issued',revoked_at=null,revocation_reason=null,send_deadline_at=clock_timestamp()+interval '30 seconds' where id='a3000000-0000-4000-8000-000000000009';" 'Restore base Authorization after request auth.users FK wait race' | Out-Null

  $pageUserFkBlockerName = 'mb3_page_user_fk_wait_blocker'
  $pageUserFkBlocker = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-UserFkWaitLockerSql $pageUserFkBlockerName)
  Wait-Mb3DeadlineLocker $pageUserFkBlockerName $pageUserFkBlocker
  Invoke-Mb3SqlText "update public.broker_capture_request_authorizations_v2 set send_deadline_at=clock_timestamp()+interval '100 milliseconds' where id='a3000000-0000-4000-8000-000000000009';" 'Prepare page auth.users FK wait deadline' | Out-Null
  $pageUserFkStateBefore = Get-Mb3Scalar $globalIdStateSql
  $pageUserFkContender = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-PageCommitSql 'a3250000-0000-4000-8000-000000000002' 0 'a3000000-0000-4000-8000-000000000009' 'mb3_page_user_fk_wait_contender' 'commit')
  $pageUserFkBlockerResult = Receive-Job -Job $pageUserFkBlocker -Wait
  $pageUserFkContenderResult = Receive-Job -Job $pageUserFkContender -Wait
  Remove-Job $pageUserFkBlocker,$pageUserFkContender -Force
  if ($pageUserFkBlockerResult.ExitCode -ne 0 -or $pageUserFkContenderResult.ExitCode -eq 0 -or $pageUserFkContenderResult.Output -notmatch 'MB3_PAGE_COMMIT_AUTHORIZATION_INVALID') {
    throw "Page auth.users FK wait outcome invalid. Blocker=$($pageUserFkBlockerResult.Output) Contender=$($pageUserFkContenderResult.Output)"
  }
  $pageUserFkStateAfter = Get-Mb3Scalar $globalIdStateSql
  if ($pageUserFkStateAfter -ne $pageUserFkStateBefore) {
    throw "Page auth.users FK wait produced durable effects. Before=$pageUserFkStateBefore After=$pageUserFkStateAfter"
  }
  Invoke-Mb3SqlText "update public.broker_capture_request_authorizations_v2 set send_deadline_at=clock_timestamp()+interval '30 seconds' where id='a3000000-0000-4000-8000-000000000009';" 'Restore base Authorization after page auth.users FK wait race' | Out-Null

  Invoke-Mb3SqlText "update public.broker_capture_request_authorizations_v2 set authorization_status='revoked',revoked_at=clock_timestamp(),revocation_reason='deadline_lock_test' where id='a3000000-0000-4000-8000-000000000009';" 'Prepare request deadline race' | Out-Null
  $requestDeadlineStateBefore = Get-Mb3Scalar $runtimeStateSql
  $requestDeadlineLockerName = 'mb3_request_deadline_locker'
  $requestDeadlineLocker = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-WorkUnitDeadlineLockerSql $requestDeadlineLockerName 1.5)
  Wait-Mb3DeadlineLocker $requestDeadlineLockerName
  $expiredAuthorization = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-StaleAuthorizationSql 'a3220000-0000-4000-8000-000000000001' '100 milliseconds')
  $requestDeadlineLockerResult = Receive-Job -Job $requestDeadlineLocker -Wait
  $expiredAuthorizationResult = Receive-Job -Job $expiredAuthorization -Wait
  Remove-Job $requestDeadlineLocker,$expiredAuthorization -Force
  if ($requestDeadlineLockerResult.ExitCode -ne 0 -or $expiredAuthorizationResult.ExitCode -eq 0 -or $expiredAuthorizationResult.Output -notmatch 'MB3_REQUEST_AUTH_DEADLINE_EXPIRED') {
    throw "Request deadline-after-lock outcome invalid. Locker=$($requestDeadlineLockerResult.Output) Authorization=$($expiredAuthorizationResult.Output)"
  }
  $requestDeadlineStateAfter = Get-Mb3Scalar $runtimeStateSql
  if ($requestDeadlineStateAfter -ne $requestDeadlineStateBefore) {
    throw "Request deadline-after-lock produced durable effects. Before=$requestDeadlineStateBefore After=$requestDeadlineStateAfter"
  }
  Invoke-Mb3SqlText "update public.broker_capture_request_authorizations_v2 set authorization_status='issued',revoked_at=null,revocation_reason=null,send_deadline_at=clock_timestamp()+interval '30 seconds' where id='a3000000-0000-4000-8000-000000000009';" 'Restore request authorization after deadline race' | Out-Null

  Invoke-Mb3SqlText "update public.broker_capture_request_authorizations_v2 set send_deadline_at=clock_timestamp()+interval '100 milliseconds' where id='a3000000-0000-4000-8000-000000000009';" 'Prepare page deadline race' | Out-Null
  $pageDeadlineStateBefore = Get-Mb3Scalar $runtimeStateSql
  $pageDeadlineLockerName = 'mb3_page_deadline_locker'
  $pageDeadlineLocker = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-WorkUnitDeadlineLockerSql $pageDeadlineLockerName 1.5)
  Wait-Mb3DeadlineLocker $pageDeadlineLockerName
  $expiredPage = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-PageCommitSql 'a3220000-0000-4000-8000-000000000002' 0)
  $pageDeadlineLockerResult = Receive-Job -Job $pageDeadlineLocker -Wait
  $expiredPageResult = Receive-Job -Job $expiredPage -Wait
  Remove-Job $pageDeadlineLocker,$expiredPage -Force
  if ($pageDeadlineLockerResult.ExitCode -ne 0 -or $expiredPageResult.ExitCode -eq 0 -or $expiredPageResult.Output -notmatch 'MB3_PAGE_COMMIT_AUTHORIZATION_INVALID') {
    throw "Page deadline-after-lock outcome invalid. Locker=$($pageDeadlineLockerResult.Output) Page=$($expiredPageResult.Output)"
  }
  $pageDeadlineStateAfter = Get-Mb3Scalar $runtimeStateSql
  if ($pageDeadlineStateAfter -ne $pageDeadlineStateBefore) {
    throw "Page deadline-after-lock produced durable effects. Before=$pageDeadlineStateBefore After=$pageDeadlineStateAfter"
  }
  Invoke-Mb3SqlText "update public.broker_capture_request_authorizations_v2 set send_deadline_at=clock_timestamp()+interval '30 seconds' where id='a3000000-0000-4000-8000-000000000009';" 'Restore page authorization after deadline race' | Out-Null

  $replayAuthorizationId = 'a3220000-0000-4000-8000-000000000003'
  $replayDeadlineUtc = Get-Mb3Scalar "select (clock_timestamp()+interval '3 seconds')::text;"
  Invoke-Mb3SqlText "update public.broker_capture_request_authorizations_v2 set authorization_status='revoked',revoked_at=clock_timestamp(),revocation_reason='replay_deadline_lock_test' where id='a3000000-0000-4000-8000-000000000009';" 'Prepare replay deadline race' | Out-Null
  Invoke-Mb3SqlText (New-ReplayAuthorizationSql $replayAuthorizationId $replayDeadlineUtc) 'Create replay deadline authorization' | Out-Null
  $replayDeadlineStateSql = "select (select count(*) from public.broker_capture_request_authorizations_v2),(select count(*) from public.broker_runtime_authority_receipts_v2),(select authorization_status from public.broker_capture_request_authorizations_v2 where id='$replayAuthorizationId'),checkpoint.checkpoint_generation,checkpoint.row_version,work_unit.row_version,work_unit.request_sequence from public.broker_capture_work_units work_unit join public.broker_capture_checkpoints_v2 checkpoint on checkpoint.work_unit_id=work_unit.id where work_unit.id=(select work_unit_id from public.broker_capture_request_authorizations_v2 where id='$replayAuthorizationId');"
  $replayDeadlineStateBefore = Get-Mb3Scalar $replayDeadlineStateSql
  $replayDeadlineLockerName = 'mb3_replay_authorization_deadline_locker'
  Start-Sleep -Milliseconds 1500
  $replayDeadlineLocker = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-AuthorizationDeadlineLockerSql $replayDeadlineLockerName $replayAuthorizationId 1.5)
  Wait-Mb3DeadlineLocker $replayDeadlineLockerName
  $expiredReplayOutput = Invoke-Mb3SqlTextExpectFailure `
    (New-ReplayAuthorizationSql $replayAuthorizationId $replayDeadlineUtc) `
    'MB3_REQUEST_AUTH_REPLAY_TERMINAL' `
    'Replay deadline after Authorization lock'
  $replayDeadlineLockerResult = Receive-Job -Job $replayDeadlineLocker -Wait
  Remove-Job $replayDeadlineLocker -Force
  if ($replayDeadlineLockerResult.ExitCode -ne 0 -or $expiredReplayOutput -notmatch 'MB3_REQUEST_AUTH_REPLAY_TERMINAL') {
    throw "Replay deadline-after-authorization-lock outcome invalid. Locker=$($replayDeadlineLockerResult.Output) Replay=$expiredReplayOutput"
  }
  $replayDeadlineStateAfter = Get-Mb3Scalar $replayDeadlineStateSql
  if ($replayDeadlineStateAfter -ne $replayDeadlineStateBefore) {
    throw "Replay deadline-after-authorization-lock produced durable effects. Before=$replayDeadlineStateBefore After=$replayDeadlineStateAfter"
  }
  Invoke-Mb3SqlText "delete from public.broker_runtime_authority_receipts_v2 where id='$replayAuthorizationId'; delete from public.broker_capture_request_authorizations_v2 where id='$replayAuthorizationId'; update public.broker_capture_request_authorizations_v2 set authorization_status='issued',revoked_at=null,revocation_reason=null,send_deadline_at=clock_timestamp()+interval '30 seconds' where id='a3000000-0000-4000-8000-000000000009';" 'Restore replay deadline fixture' | Out-Null

  $registryStateBefore = Get-Mb3Scalar $runtimeStateSql
  $registryWriterSql = @"
begin;
set local role equora_broker_operator_control_v2;
update public.broker_provider_capability_contracts_v2
set registry_status='suspended',registry_generation=registry_generation+1,
  updated_at=clock_timestamp()
where provider_code='mexc'
  and provider_contract_version='mexc_futures_contract_v1'
  and capability_id='historical_orders_v1'
  and capability_contract_version='mexc_historical_orders_capability_v1';
select pg_sleep(1);
commit;
"@
  $registryWriter = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,$registryWriterSql
  Start-Sleep -Milliseconds 200
  $staleAuthorization = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-StaleAuthorizationSql 'a3210000-0000-4000-8000-000000000001')
  $stalePage = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-PageCommitSql 'a3210000-0000-4000-8000-000000000002' 0)
  $registryWriteResult = Receive-Job -Job $registryWriter -Wait
  $staleAuthorizationResult = Receive-Job -Job $staleAuthorization -Wait
  $stalePageResult = Receive-Job -Job $stalePage -Wait
  Remove-Job $registryWriter,$staleAuthorization,$stalePage -Force
  if ($registryWriteResult.ExitCode -ne 0 `
    -or $staleAuthorizationResult.ExitCode -eq 0 `
    -or $staleAuthorizationResult.Output -notmatch 'MB3_REQUEST_AUTH_CAPABILITY_INVALID' `
    -or $stalePageResult.ExitCode -eq 0 `
    -or $stalePageResult.Output -notmatch 'MB3_PAGE_COMMIT_CAPABILITY_INVALID') {
    throw "Registry authority drift outcome invalid.`nWriter: $($registryWriteResult.Output)`nAuthorization: $($staleAuthorizationResult.Output)`nPage: $($stalePageResult.Output)"
  }
  $registryStateAfter = Get-Mb3Scalar $runtimeStateSql
  if ($registryStateAfter -ne $registryStateBefore) {
    throw "Registry authority drift produced durable runtime effects. Before=$registryStateBefore After=$registryStateAfter"
  }
  Invoke-Mb3SqlText "set role equora_broker_operator_control_v2; update public.broker_provider_capability_contracts_v2 set registry_status='verified',registry_generation=1,updated_at=clock_timestamp() where provider_code='mexc' and provider_contract_version='mexc_futures_contract_v1' and capability_id='historical_orders_v1' and capability_contract_version='mexc_historical_orders_capability_v1'; reset role;" 'Registry authority restoration' | Out-Null

  $pageWinner = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-PageCommitSql 'a3200000-0000-4000-8000-000000000001' 1)
  Start-Sleep -Milliseconds 200
  $pageLoser = Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,(New-PageCommitSql 'a3200000-0000-4000-8000-000000000002' 0)
  $pageFirst = Receive-Job -Job $pageWinner -Wait
  $pageSecond = Receive-Job -Job $pageLoser -Wait
  Remove-Job $pageWinner,$pageLoser -Force
  if ($pageFirst.ExitCode -ne 0 -or $pageFirst.Output -notmatch 'page_committed' -or $pageSecond.ExitCode -eq 0 -or $pageSecond.Output -notmatch 'MB3_PAGE_COMMIT_(WORK_UNIT_CAS_MISMATCH|CHECKPOINT_CAS_MISMATCH|AUTHORIZATION_INVALID)') {
    throw "Page concurrency outcome invalid.`nWinner: $($pageFirst.Output)`nLoser: $($pageSecond.Output)"
  }
  $pageState = Get-Mb3Scalar "select (select count(*) from public.broker_capture_page_commits_v2),(select authorization_status from public.broker_capture_request_authorizations_v2 where id='a3000000-0000-4000-8000-000000000009'),(select checkpoint_generation from public.broker_capture_checkpoints_v2 where work_unit_id=(select work_unit_id from public.broker_capture_request_authorizations_v2 where id='a3000000-0000-4000-8000-000000000009')),(select request_sequence from public.broker_capture_work_units where id=(select work_unit_id from public.broker_capture_request_authorizations_v2 where id='a3000000-0000-4000-8000-000000000009'));"
  if ($pageState -ne '1|consumed|1|1') { throw "Page concurrency state invalid: $pageState" }
  Write-Output 'MB3 concurrency gate PASS (single enrollment-quota, operator-generation and page-commit winners; request/page/replay deadlines, global Request/Page/Receipt ID guards and auth.users FK waits are refreshed after their final waits; cross-work-unit, cross-action, registry-authority and stale competitors fail closed without effects).'
}
finally {
  if (-not $KeepDatabase) { Remove-Mb3Database }
}
