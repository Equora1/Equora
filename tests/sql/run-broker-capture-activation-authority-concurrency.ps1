param(
  [string]$ContainerName = 'equora-v5761-pgtest',
  [string]$TemplateDatabase = 'equora_remediation',
  [string]$TestDatabase = 'equora_capture_activation_authority_concurrency_v5761'
)

$ErrorActionPreference = 'Stop'

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TemplateDatabase -notmatch '^equora_[a-z0-9_]+$') {
  throw 'TemplateDatabase must be an explicitly named Equora test database.'
}
if ($TestDatabase -notmatch '^equora_capture_activation_authority_concurrency_[a-z0-9_]+$') {
  throw 'TestDatabase must use the equora_capture_activation_authority_concurrency_ prefix.'
}

$fixturePath = Join-Path $PSScriptRoot 'broker-capture-persistence.integration.sql'
$fixture = Get-Content -Raw -LiteralPath $fixturePath
$setupMarker = '-- EQUORA_CONCURRENCY_SETUP_END'
$setupEnd = $fixture.IndexOf($setupMarker, [StringComparison]::Ordinal)
if ($setupEnd -lt 0) {
  throw 'The integration fixture no longer exposes the expected setup boundary.'
}
$setupSql = $fixture.Substring(0, $setupEnd) + "`ncommit;`n"

$worker = {
  param($SqlText, $DockerContainer, $Database)
  $ErrorActionPreference = 'Continue'
  $output = $SqlText | & docker exec -i $DockerContainer psql -U postgres -d $Database 2>&1
  [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = ($output -join [Environment]::NewLine)
  }
}

function Invoke-Sql {
  param([Parameter(Mandatory = $true)][string]$SqlText)
  $output = $SqlText | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Activation-authority concurrency SQL failed: $($output -join [Environment]::NewLine)"
  }
  return ($output -join [Environment]::NewLine)
}

function Wait-Hold {
  param([Parameter(Mandatory = $true)][string]$ApplicationName)
  for ($poll = 0; $poll -lt 100; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name = '$ApplicationName' and query like '%pg_sleep%';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Failed to inspect holder $ApplicationName." }
    if ($activity.Trim() -eq '1') { return }
    Start-Sleep -Milliseconds 50
  }
  throw "Holder $ApplicationName never reached its transaction hold."
}

function Wait-Lock {
  param([Parameter(Mandatory = $true)][string]$ApplicationName)
  for ($poll = 0; $poll -lt 100; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(distinct activity.pid) from pg_stat_activity activity join pg_locks lock_row on lock_row.pid = activity.pid and not lock_row.granted where activity.application_name = '$ApplicationName' and activity.wait_event_type = 'Lock' and lock_row.waitstart is not null;" 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Failed to inspect waiter $ApplicationName." }
    if ($activity.Trim() -eq '1') { return }
    Start-Sleep -Milliseconds 50
  }
  throw "Waiter $ApplicationName was not observed on the expected lock."
}

function Receive-Pair {
  param(
    [Parameter(Mandatory = $true)]$FirstJob,
    [Parameter(Mandatory = $true)]$SecondJob
  )
  Wait-Job -Job $FirstJob, $SecondJob | Out-Null
  $first = Receive-Job -Job $FirstJob
  $second = Receive-Job -Job $SecondJob
  Remove-Job -Job $FirstJob, $SecondJob -Force
  return @($first, $second)
}

function Get-BaseAuthorityVersions {
  $state = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select series_row_version, (select activation_row_version from public.broker_sync_activations where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8') from public.broker_sync_activation_series where id = '16000000-0000-4000-8000-000000000001';"
  if ($LASTEXITCODE -ne 0 -or $state.Trim() -notmatch '^\d+\|\d+$') {
    throw "Failed to read fixture authority versions: $state"
  }
  return @($state.Trim().Split('|'))
}

function New-ApplyCommandSql {
  param(
    [Parameter(Mandatory = $true)][string]$ApplicationName,
    [Parameter(Mandatory = $true)][string]$CommandId,
    [string]$HoldSeconds = '1.2'
  )
  return @"
\set ON_ERROR_STOP on
begin;
set application_name = '$ApplicationName';
set role service_role;
select public.equora_apply_broker_sync_activation_command_v1('$CommandId');
select pg_sleep($HoldSeconds);
commit;
"@
}

function New-RequirementSql {
  param(
    [Parameter(Mandatory = $true)][string]$ApplicationName,
    [Parameter(Mandatory = $true)][string]$RequestId,
    [Parameter(Mandatory = $true)][string]$ExpectedSeriesVersion,
    [Parameter(Mandatory = $true)][string]$ExpectedActivationVersion,
    [string]$HoldSeconds = '1.2'
  )
  return @"
\set ON_ERROR_STOP on
begin;
set application_name = '$ApplicationName';
set role service_role;
select public.equora_upsert_broker_sync_lane_requirement_v1(
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
  $ExpectedSeriesVersion,
  $ExpectedActivationVersion,
  'historical_orders_v1',
  'mexc_futures_symbol_v1:ETH_USDT:none',
  'instrument_discovery',
  '$RequestId'
);
select pg_sleep($HoldSeconds);
commit;
"@
}

function New-AuthorizeSql {
  param(
    [Parameter(Mandatory = $true)][string]$ApplicationName,
    [Parameter(Mandatory = $true)][string]$WorkUnitId,
    [Parameter(Mandatory = $true)][string]$AuthorizationId,
    [string]$HoldSeconds = '0'
  )
  return @"
\set ON_ERROR_STOP on
begin;
set application_name = '$ApplicationName';
set role service_role;
select public.equora_authorize_broker_capture_request_v1(
  '$WorkUnitId', 7, 1,
  '160125df2a0a32533e0847d0f3586d24ffca6f139f2767e3fe712f1f16ae04c0',
  '2c80af13-0e7c-4958-aa8e-40b306691fd9',
  '$AuthorizationId'
);
select pg_sleep($HoldSeconds);
commit;
"@
}

$createFixtureSql = @'
begin;
insert into public.broker_credentials (
  id, user_id, provider, encrypted_payload, key_version
) values (
  'e1000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'mexc', 'synthetic-concurrency-ciphertext', 'test_v1'
);
insert into public.broker_connections (
  id, user_id, provider, account_label, environment, status,
  permissions, sync_mode, credential_reference
) values (
  'e2000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'mexc', 'Concurrency fixture', 'live', 'ready',
  array['read_only_user_attested'], 'manual',
  'e1000000-0000-4000-8000-000000000001'
);
insert into public.broker_accounts (
  id, user_id, provider_code, environment, display_label, identity_status,
  capability_profile_id, provider_contract_version, status
) values (
  'e4000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'mexc', 'live', 'Concurrency fixture', 'connection_scoped',
  'mexc_futures_rest', 'mexc_futures_contract_v1', 'active'
);
insert into equora_private.broker_capture_integrity_keys (
  id, user_id, broker_account_id, key_version, key_material,
  status, valid_from
) values (
  'e3000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'test_v1', convert_to('abcdef0123456789abcdef0123456789', 'UTF8'),
  'active', clock_timestamp() - interval '1 day'
);
insert into public.broker_connection_accounts (
  id, user_id, connection_id, broker_account_id, provider_code,
  environment, assignment_source, valid_from, status
) values (
  'eb4b0000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001',
  'mexc', 'live', 'connection_scoped',
  clock_timestamp() - interval '1 day', 'active'
);
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001', true
);
select public.equora_request_broker_sync_activation_v1(
  'eb4b0000-0000-4000-8000-000000000001', 'activate', 0, null,
  'e6000000-0000-4000-8000-000000000001'
);
select public.equora_request_broker_sync_activation_v1(
  'eb4b0000-0000-4000-8000-000000000001', 'activate', 0, null,
  'e6000000-0000-4000-8000-000000000002'
);
reset role;
commit;
'@

try {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to remove the prior activation-authority concurrency database.' }
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "create database $TestDatabase template $TemplateDatabase;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create the activation-authority concurrency database.' }

  Invoke-Sql -SqlText $setupSql | Out-Null
  Invoke-Sql -SqlText $createFixtureSql | Out-Null

  # Parallel activation create/create: the first holds the Connection-Account /
  # Series transaction; the second must persist one deterministic CAS rejection.
  $createWinner = Start-Job -ScriptBlock $worker -ArgumentList (
    New-ApplyCommandSql -ApplicationName 'equora_activation_create_winner' `
      -CommandId 'e6000000-0000-4000-8000-000000000001'
  ), $ContainerName, $TestDatabase
  Wait-Hold -ApplicationName 'equora_activation_create_winner'
  $createLoser = Start-Job -ScriptBlock $worker -ArgumentList (
    New-ApplyCommandSql -ApplicationName 'equora_activation_create_loser' `
      -CommandId 'e6000000-0000-4000-8000-000000000002' -HoldSeconds '0'
  ), $ContainerName, $TestDatabase
  Wait-Lock -ApplicationName 'equora_activation_create_loser'
  $createResults = Receive-Pair -FirstJob $createWinner -SecondJob $createLoser
  if ($createResults[0].ExitCode -ne 0 -or
    $createResults[0].Output -notmatch '"status": "activated"' -or
    $createResults[1].ExitCode -ne 0 -or
    $createResults[1].Output -notmatch 'ACTIVATION_APPLY_SERIES_CAS_MISMATCH') {
    throw "Create/create race was not deterministic.`nWinner: $($createResults[0].Output)`nLoser: $($createResults[1].Output)"
  }
  $createState = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select (select count(*) from public.broker_sync_activation_commands where id in ('e6000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000002') and command_status = 'applied'), (select count(*) from public.broker_sync_activation_commands where id in ('e6000000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000002') and command_status = 'rejected'), (select count(*) from public.broker_sync_activations where broker_account_id = 'e4000000-0000-4000-8000-000000000001'), (select count(*) from public.broker_sync_lane_requirements where broker_account_id = 'e4000000-0000-4000-8000-000000000001'), (select count(*) from public.broker_sync_lane_states where broker_account_id = 'e4000000-0000-4000-8000-000000000001');"
  if ($LASTEXITCODE -ne 0 -or $createState.Trim() -ne '1|1|1|4|12') {
    throw "Create/create race left partial foundation state: $createState"
  }
  $createReplay = Invoke-Sql -SqlText @'
set role service_role;
select public.equora_apply_broker_sync_activation_command_v1(
  'e6000000-0000-4000-8000-000000000001'
);
select public.equora_apply_broker_sync_activation_command_v1(
  'e6000000-0000-4000-8000-000000000002'
);
reset role;
'@
  if ($createReplay -notmatch '"status": "activated"' -or
    $createReplay -notmatch 'ACTIVATION_APPLY_SERIES_CAS_MISMATCH') {
    throw "Create/create replay changed a durable result: $createReplay"
  }

  # Seed policy generation 1, then race two generation-2 supersessions from
  # the same CAS snapshot. Exactly one receipt and one 3-lane revision may win.
  $seedVersions = @(Get-BaseAuthorityVersions)
  $seedRequirementSql = @"
set role service_role;
select public.equora_upsert_broker_sync_lane_requirement_v1(
  'b15526c9-c0e7-4ace-a3d1-f8055de216c8',
  $($seedVersions[0]),
  $($seedVersions[1]),
  'historical_orders_v1',
  'mexc_futures_symbol_v1:ETH_USDT:none',
  'instrument_discovery',
  'f1000000-0000-4000-8000-000000000001'
);
reset role;
"@
  Invoke-Sql -SqlText $seedRequirementSql | Out-Null
  $policyVersions = @(Get-BaseAuthorityVersions)
  $policyWinner = Start-Job -ScriptBlock $worker -ArgumentList (
    New-RequirementSql -ApplicationName 'equora_policy_supersede_winner' `
      -RequestId 'f1000000-0000-4000-8000-000000000002' `
      -ExpectedSeriesVersion $policyVersions[0] `
      -ExpectedActivationVersion $policyVersions[1]
  ), $ContainerName, $TestDatabase
  Wait-Hold -ApplicationName 'equora_policy_supersede_winner'
  $policyLoser = Start-Job -ScriptBlock $worker -ArgumentList (
    New-RequirementSql -ApplicationName 'equora_policy_supersede_loser' `
      -RequestId 'f1000000-0000-4000-8000-000000000003' `
      -ExpectedSeriesVersion $policyVersions[0] `
      -ExpectedActivationVersion $policyVersions[1] -HoldSeconds '0'
  ), $ContainerName, $TestDatabase
  Wait-Lock -ApplicationName 'equora_policy_supersede_loser'
  $policyResults = Receive-Pair -FirstJob $policyWinner -SecondJob $policyLoser
  if ($policyResults[0].ExitCode -ne 0 -or
    $policyResults[0].Output -notmatch 'requirement_superseded' -or
    $policyResults[1].ExitCode -eq 0 -or
    $policyResults[1].Output -notmatch 'AUTHORITY_SERIES_CAS_MISMATCH') {
    throw "Supersede/supersede race was not fail-closed.`nWinner: $($policyResults[0].Output)`nLoser: $($policyResults[1].Output)"
  }
  $policyState = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select (select count(*) from public.broker_sync_lane_requirements where sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8' and instrument_scope_key = 'mexc_futures_symbol_v1:ETH_USDT:none' and policy_generation = 1 and superseded_at is not null), (select count(*) from public.broker_sync_lane_requirements where sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8' and instrument_scope_key = 'mexc_futures_symbol_v1:ETH_USDT:none' and policy_generation = 2 and superseded_at is null), (select count(*) from public.broker_sync_lane_states where sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8' and instrument_scope_key = 'mexc_futures_symbol_v1:ETH_USDT:none' and policy_generation = 2 and superseded_at is null and observation_status = 'not_observed'), (select count(*) from public.broker_sync_authority_mutation_receipts where request_id in ('f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003'));"
  if ($LASTEXITCODE -ne 0 -or $policyState.Trim() -ne '1|1|3|1') {
    throw "Supersede/supersede race left an invalid policy state: $policyState"
  }

  # Permit wins before pause: the request is the documented in-flight winner,
  # while every later commit is fenced by the paused lifecycle/version.
  $pauseVersions = @(Get-BaseAuthorityVersions)
  $pauseIntentSql = @"
begin;
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001', true
);
select public.equora_request_broker_sync_activation_v1(
  'b34b98ae-a682-44de-a1bc-21ca75888d45', 'pause',
  $($pauseVersions[0]),
  $($pauseVersions[1]),
  'f6000000-0000-4000-8000-000000000001'
);
reset role;
commit;
"@
  Invoke-Sql -SqlText $pauseIntentSql | Out-Null
  $permitWinner = Start-Job -ScriptBlock $worker -ArgumentList (
    New-AuthorizeSql -ApplicationName 'equora_request_permit_winner' `
      -WorkUnitId '770d4b00-c275-48f1-aa02-9712c6ce1190' `
      -AuthorizationId 'f7000000-0000-4000-8000-000000000001' `
      -HoldSeconds '1.2'
  ), $ContainerName, $TestDatabase
  Wait-Hold -ApplicationName 'equora_request_permit_winner'
  $pauseLoser = Start-Job -ScriptBlock $worker -ArgumentList (
    New-ApplyCommandSql -ApplicationName 'equora_pause_after_permit' `
      -CommandId 'f6000000-0000-4000-8000-000000000001' -HoldSeconds '0'
  ), $ContainerName, $TestDatabase
  Wait-Lock -ApplicationName 'equora_pause_after_permit'
  $permitFirst = Receive-Pair -FirstJob $permitWinner -SecondJob $pauseLoser
  if ($permitFirst[0].ExitCode -ne 0 -or
    $permitFirst[0].Output -notmatch 'request_authorized' -or
    $permitFirst[1].ExitCode -ne 0 -or
    $permitFirst[1].Output -notmatch 'paused') {
    throw "Permit-before-pause race was invalid.`nPermit: $($permitFirst[0].Output)`nPause: $($permitFirst[1].Output)"
  }
  $permitFirstState = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select (select count(*) from public.broker_capture_request_authorizations where id = 'f7000000-0000-4000-8000-000000000001'), (select activation_state from public.broker_sync_activations where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'), (select count(*) from public.broker_provider_request_results), (select count(*) from public.broker_capture_attempt_outcomes);"
  if ($LASTEXITCODE -ne 0 -or $permitFirstState.Trim() -ne '1|paused|0|0') {
    throw "Permit-before-pause race left partial request state: $permitFirstState"
  }

  # Resume, then let pause win before a second Work Unit asks for authority.
  # The waiter must fail after the lock with no permit or request side effect.
  $resumeVersions = @(Get-BaseAuthorityVersions)
  $resumeSql = @"
begin;
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001', true
);
select public.equora_request_broker_sync_activation_v1(
  'b34b98ae-a682-44de-a1bc-21ca75888d45', 'resume',
  $($resumeVersions[0]),
  $($resumeVersions[1]),
  'f6000000-0000-4000-8000-000000000002'
);
reset role;
set role service_role;
select public.equora_apply_broker_sync_activation_command_v1(
  'f6000000-0000-4000-8000-000000000002'
);
reset role;
commit;
"@
  Invoke-Sql -SqlText $resumeSql | Out-Null
  $secondPauseVersions = @(Get-BaseAuthorityVersions)
  $secondPauseIntentSql = @"
begin;
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001', true
);
select public.equora_request_broker_sync_activation_v1(
  'b34b98ae-a682-44de-a1bc-21ca75888d45', 'pause',
  $($secondPauseVersions[0]),
  $($secondPauseVersions[1]),
  'f6000000-0000-4000-8000-000000000003'
);
reset role;
commit;
"@
  Invoke-Sql -SqlText $secondPauseIntentSql | Out-Null
  $pauseWinner = Start-Job -ScriptBlock $worker -ArgumentList (
    New-ApplyCommandSql -ApplicationName 'equora_pause_before_permit' `
      -CommandId 'f6000000-0000-4000-8000-000000000003'
  ), $ContainerName, $TestDatabase
  Wait-Hold -ApplicationName 'equora_pause_before_permit'
  $permitLoser = Start-Job -ScriptBlock $worker -ArgumentList (
    New-AuthorizeSql -ApplicationName 'equora_request_permit_loser' `
      -WorkUnitId '670d4b00-c275-48f1-aa02-9712c6ce1190' `
      -AuthorizationId 'f7000000-0000-4000-8000-000000000002'
  ), $ContainerName, $TestDatabase
  Wait-Lock -ApplicationName 'equora_request_permit_loser'
  $pauseFirst = Receive-Pair -FirstJob $pauseWinner -SecondJob $permitLoser
  if ($pauseFirst[0].ExitCode -ne 0 -or
    $pauseFirst[0].Output -notmatch 'paused' -or
    $pauseFirst[1].ExitCode -eq 0 -or
    $pauseFirst[1].Output -notmatch 'REQUEST_AUTH_ACTIVATION_NOT_CURRENT') {
    throw "Pause-before-permit race was not fail-closed.`nPause: $($pauseFirst[0].Output)`nPermit: $($pauseFirst[1].Output)"
  }
  $pauseFirstState = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select (select count(*) from public.broker_capture_request_authorizations where id = 'f7000000-0000-4000-8000-000000000002'), (select activation_state from public.broker_sync_activations where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'), (select count(*) from public.broker_provider_request_results), (select count(*) from public.broker_capture_attempt_outcomes);"
  if ($LASTEXITCODE -ne 0 -or $pauseFirstState.Trim() -ne '0|paused|0|0') {
    throw "Pause-before-permit race left partial request state: $pauseFirstState"
  }

  # Resume, make the full current lane matrix healthy, then hold Series while
  # one lane crosses next_due_at. The permit waiter must derive health with a
  # fresh timestamp after the lock wait and fail without an authorization.
  $healthResumeVersions = @(Get-BaseAuthorityVersions)
  $healthResumeSql = @"
begin;
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001', true
);
select public.equora_request_broker_sync_activation_v1(
  'b34b98ae-a682-44de-a1bc-21ca75888d45', 'resume',
  $($healthResumeVersions[0]),
  $($healthResumeVersions[1]),
  'f6000000-0000-4000-8000-000000000004'
);
reset role;
set role service_role;
select public.equora_apply_broker_sync_activation_command_v1(
  'f6000000-0000-4000-8000-000000000004'
);
reset role;
commit;
"@
  Invoke-Sql -SqlText $healthResumeSql | Out-Null

  $prepareHealthyMatrixSql = @'
begin;
update public.broker_sync_activations
set capability_versions = '{"historical_orders_v1":"v1"}'::jsonb
where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';

create temporary table health_race_scopes (
  lane_state_id uuid primary key,
  scope_id uuid not null,
  scope_digest text not null,
  closed_at timestamptz not null
) on commit drop;
insert into health_race_scopes
select lane.id, gen_random_uuid(),
  encode(public.equora_pgcrypto_digest_v1(
    convert_to('health-race|' || lane.id::text, 'UTF8'), 'sha256'
  ), 'hex'),
  clock_timestamp()
from public.broker_sync_lane_states lane
join public.broker_sync_lane_requirements requirement
  on requirement.id = lane.lane_requirement_id
 and requirement.superseded_at is null
where lane.sync_activation_id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
  and lane.superseded_at is null;

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
select mapping.scope_id, lane.user_id, lane.broker_account_id,
  lane.sync_activation_id, lane.activation_generation, lane.provider_code,
  source.account_identity_digest, source.account_identity_key_version,
  'provider_api_observation', lane.profile_id, lane.profile_version,
  lane.provider_contract_version, lane.adapter_version, lane.capability_id,
  lane.capability_id, lane.instrument_scope_key, 'BTC_USDT', null,
  lane.lane_id, 1000, 2000, 1000, 2000,
  source.boundary_policy_version, source.boundary_semantics,
  source.overlap_policy, 1, 1, 'provider_observed',
  'provider_observed_best_effort', 'complete_for_profile', 'observed_once',
  'sha256', 'equora-tcj-v1', 'equora-tcj-v1', mapping.scope_digest,
  mapping.scope_digest, mapping.closed_at, lane.lane_requirement_id, lane.id,
  lane.policy_generation, 'broker-capture-authority-v1',
  public.equora_capture_authority_digest_v1(
    lane.sync_activation_id, lane.activation_generation,
    lane.broker_account_id, lane.lane_requirement_id, lane.id,
    lane.policy_generation, lane.capability_id, lane.instrument_scope_key,
    lane.lane_id, lane.profile_id, lane.profile_version, mapping.scope_digest
  )
from health_race_scopes mapping
join public.broker_sync_lane_states lane on lane.id = mapping.lane_state_id
cross join public.broker_sync_scopes source
where source.id = '18000000-0000-4000-8000-000000000001';

update public.broker_sync_lane_states lane
set observation_status = 'observed', health = 'healthy',
    last_complete_at = mapping.closed_at,
    next_due_at = clock_timestamp() + interval '1 hour',
    last_complete_scope_id = mapping.scope_id,
    last_complete_scope_digest = mapping.scope_digest,
    high_watermark_time_ms = 1000,
    high_watermark_tie_breaker = '1',
    watermark_contract_version = 'broker-lane-watermark-v1',
    watermark_digest = public.equora_lane_watermark_digest_v1(
      lane.sync_activation_id, lane.activation_generation,
      lane.broker_account_id, lane.capability_id, lane.instrument_scope_key,
      lane.lane_id, lane.profile_id, lane.profile_version,
      lane.policy_generation, mapping.scope_digest, 1000, '1',
      'broker-lane-watermark-v1'
    ),
    last_error_code = null, last_error_at = null,
    updated_at = clock_timestamp()
from health_race_scopes mapping
where lane.id = mapping.lane_state_id;

do $matrix$
begin
  if public.equora_derive_capture_health_at_v1(
      'b15526c9-c0e7-4ace-a3d1-f8055de216c8', clock_timestamp()
    ) ->> 'health' <> 'healthy'
  then raise exception 'TEST_HEALTH_RACE_PRECONDITION_NOT_HEALTHY'; end if;
end;
$matrix$;
commit;
'@
  Invoke-Sql -SqlText $prepareHealthyMatrixSql | Out-Null

  $healthHolderSql = @'
\set ON_ERROR_STOP on
begin;
set application_name = 'equora_health_due_holder';
select id from public.broker_sync_activation_series
where id = '16000000-0000-4000-8000-000000000001'
for update;
update public.broker_sync_lane_states
set next_due_at = clock_timestamp() + interval '800 milliseconds'
where id = '26000000-0000-4000-8000-000000000011';
select pg_sleep(1.2);
commit;
'@
  $healthHolder = Start-Job -ScriptBlock $worker -ArgumentList (
    $healthHolderSql
  ), $ContainerName, $TestDatabase
  Wait-Hold -ApplicationName 'equora_health_due_holder'
  $healthWaiter = Start-Job -ScriptBlock $worker -ArgumentList (
    New-AuthorizeSql -ApplicationName 'equora_health_due_waiter' `
      -WorkUnitId '670d4b00-c275-48f1-aa02-9712c6ce1190' `
      -AuthorizationId 'f7000000-0000-4000-8000-000000000003'
  ), $ContainerName, $TestDatabase
  Wait-Lock -ApplicationName 'equora_health_due_waiter'
  $healthRace = Receive-Pair -FirstJob $healthHolder -SecondJob $healthWaiter
  if ($healthRace[0].ExitCode -ne 0 -or
    $healthRace[1].ExitCode -eq 0 -or
    $healthRace[1].Output -notmatch 'REQUEST_AUTH_HEALTH_BLOCKED') {
    throw "Health-due permit race used stale time.`nHolder: $($healthRace[0].Output)`nWaiter: $($healthRace[1].Output)"
  }
  $healthRaceState = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select (select count(*) from public.broker_capture_request_authorizations where id = 'f7000000-0000-4000-8000-000000000003'), (public.equora_derive_capture_health_at_v1('b15526c9-c0e7-4ace-a3d1-f8055de216c8', clock_timestamp()) ->> 'health'), (select count(*) from public.broker_provider_request_results), (select count(*) from public.broker_capture_attempt_outcomes);"
  if ($LASTEXITCODE -ne 0 -or $healthRaceState.Trim() -ne '0|degraded|0|0') {
    throw "Health-due permit race left partial request state: $healthRaceState"
  }

  Write-Output 'Broker capture activation-authority concurrency integration passed.'
}
finally {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
}
