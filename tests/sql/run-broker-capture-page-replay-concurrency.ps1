param(
  [string]$ContainerName = 'equora-v5761-pgtest',
  [string]$TemplateDatabase = 'equora_remediation',
  [string]$TestDatabase = 'equora_capture_page_replay_concurrency_v5761'
)

$ErrorActionPreference = 'Stop'

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TemplateDatabase -notmatch '^equora_[a-z0-9_]+$') {
  throw 'TemplateDatabase must be an explicitly named Equora test database.'
}
if ($TestDatabase -notmatch '^equora_capture_page_replay_concurrency_[a-z0-9_]+$') {
  throw 'TestDatabase must use the equora_capture_page_replay_concurrency_ prefix.'
}

$fixturePath = Join-Path $PSScriptRoot 'broker-capture-persistence.integration.sql'
$schedulerTestPath = Join-Path $PSScriptRoot 'broker-capture-scheduler-control.integration.sql'
$schedulerMigrationPath = Join-Path $PSScriptRoot '..\..\supabase\schema-patch-v57.61.0-g1-scheduler-control.sql'
$fixture = Get-Content -Raw -LiteralPath $fixturePath
$schedulerTestSql = Get-Content -Raw -LiteralPath $schedulerTestPath
$schedulerMigrationSql = Get-Content -Raw -LiteralPath $schedulerMigrationPath

$setupMarker = '-- EQUORA_SCHEDULER_CONTROL_SETUP_END'
$setupEnd = $fixture.IndexOf($setupMarker, [StringComparison]::Ordinal)
if ($setupEnd -lt 0) { throw 'The scheduler setup boundary is missing.' }
$setupSql = $fixture.Substring(0, $setupEnd) + "`ncommit;`n"

$helperStartMarker = 'create or replace function pg_temp.commit_scheduler_continue_page('
$helperEndMarker = "`nset role service_role;"
$helperStart = $schedulerTestSql.IndexOf($helperStartMarker, [StringComparison]::Ordinal)
$helperEnd = $schedulerTestSql.IndexOf($helperEndMarker, $helperStart, [StringComparison]::Ordinal)
if ($helperStart -lt 0 -or $helperEnd -lt 0) {
  throw 'The shared Page-v2 fixture helper could not be extracted.'
}
$pageHelperSql = $schedulerTestSql.Substring($helperStart, $helperEnd - $helperStart)
$pageHelperSql = $pageHelperSql.Replace(
  'pg_temp.commit_scheduler_continue_page',
  'public.equora_test_commit_scheduler_page'
)
$pageHelperSql = $pageHelperSql.Replace(
  'v_response_received_at := greatest(clock_timestamp(), v_request_started_at);',
  'v_response_received_at := v_request_started_at;'
)
$pageHelperSql += @"
revoke all on function public.equora_test_commit_scheduler_page(
  uuid,bigint,uuid,uuid,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.equora_test_commit_scheduler_page(
  uuid,bigint,uuid,uuid,uuid,text
) to service_role;
"@

$workUnitId = $null
$leaseToken = 'd2000000-0000-4000-8000-000000000001'
$authorizationId = 'd4000000-0000-4000-8000-000000000001'
$requestResultId = 'd5000000-0000-4000-8000-000000000001'

$worker = {
  param($SqlText, $DockerContainer, $Database)
  $ErrorActionPreference = 'Continue'
  $output = $SqlText | & docker exec -i $DockerContainer psql -U postgres -d $Database -At 2>&1
  [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = ($output -join [Environment]::NewLine)
  }
}

function Invoke-SqlPipe {
  param([Parameter(Mandatory = $true)][string]$SqlText)
  $ErrorActionPreference = 'Continue'
  $output = $SqlText | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($exitCode -ne 0) {
    throw "Local Page-replay SQL failed: $($output -join [Environment]::NewLine)"
  }
}

function Initialize-Scenario {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to remove the prior Page-replay database.' }
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "create database $TestDatabase template $TemplateDatabase;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create the isolated Page-replay database.' }

  Invoke-SqlPipe -SqlText $schedulerMigrationSql
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "alter table auth.users add column if not exists email text, add column if not exists created_at timestamptz, add column if not exists updated_at timestamptz;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare the disposable auth.users fixture shape.' }
  Invoke-SqlPipe -SqlText $setupSql
  Invoke-SqlPipe -SqlText $pageHelperSql

  $armSql = @"
update public.broker_accounts
set status = 'active', retention_status = 'active'
where id = '14c6b264-99b8-4c74-a882-135b88e9d100';
update public.broker_sync_lane_states
set next_due_at = clock_timestamp() - interval '1 second'
where id = '26000000-0000-4000-8000-000000000012';
set role service_role;
select public.equora_materialize_next_due_broker_capture_v1(
  'd1000000-0000-4000-8000-000000000001',
  'broker-capture-schedule-v1'
);
reset role;
"@
  Invoke-SqlPipe -SqlText $armSql

  $script:workUnitId = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select work_unit_id from public.broker_capture_schedule_occurrences where lane_state_id='26000000-0000-4000-8000-000000000012';").Trim()
  if ($LASTEXITCODE -ne 0 -or $script:workUnitId -notmatch '^[a-f0-9-]{36}$') {
    throw "Could not resolve the Page-replay Work Unit: $script:workUnitId"
  }

  $claimSql = @"
set role service_role;
select public.equora_claim_broker_capture_work_unit_v2(
  '$script:workUnitId', 0,
  'd3000000-0000-4000-8000-000000000001', '$leaseToken',
  'broker-capture-claim-v1'
);
reset role;
"@
  Invoke-SqlPipe -SqlText $claimSql
  $checkpointMac = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select checkpoint_mac from public.broker_capture_work_units where id='$script:workUnitId';").Trim()
  if ($LASTEXITCODE -ne 0 -or $checkpointMac -notmatch '^[a-f0-9]{64}$') {
    throw "Could not resolve the claimed Checkpoint MAC: $checkpointMac"
  }
  $permitSql = @"
set role service_role;
select public.equora_authorize_broker_capture_request_v1(
  '$script:workUnitId', 1, 1, '$checkpointMac',
  '$leaseToken', '$authorizationId'
);
reset role;
"@
  Invoke-SqlPipe -SqlText $permitSql
}

function Wait-WriterHold {
  param([Parameter(Mandatory = $true)][string]$ApplicationName)
  for ($poll = 0; $poll -lt 100; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name='$ApplicationName' and query like '%pg_sleep%';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Failed to inspect writer $ApplicationName." }
    if ($activity.Trim() -eq '1') { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Writer $ApplicationName never reached the lock-holding phase."
}

function Wait-ReplayLock {
  param([Parameter(Mandatory = $true)][string]$ApplicationName)
  for ($poll = 0; $poll -lt 50; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(distinct activity.pid) from pg_stat_activity activity join pg_locks lock_row on lock_row.pid=activity.pid and not lock_row.granted where activity.application_name='$ApplicationName' and activity.wait_event_type='Lock' and lock_row.waitstart is not null;" 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Failed to inspect replay $ApplicationName." }
    if ($activity.Trim() -eq '1') { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Replay $ApplicationName was not observed waiting on the writer lock."
}

function Get-ResultDigest {
  param([Parameter(Mandatory = $true)][string]$Output)
  $jsonLines = @($Output -split "`r?`n" | Where-Object {
    $_.TrimStart().StartsWith('{') -and $_.TrimEnd().EndsWith('}')
  })
  if ($jsonLines.Count -ne 1) { throw "Expected one canonical JSON result, received: $Output" }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString(
      $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($jsonLines[0].Trim()))
    )).Replace('-', '').ToLowerInvariant()
  }
  finally { $sha.Dispose() }
}

function Invoke-ReplayScenario {
  param(
    [Parameter(Mandatory = $true)][ValidateSet('terminal_observed', 'loop_blocked')][string]$Outcome,
    [Parameter(Mandatory = $true)][string]$ExpectedState
  )
  Initialize-Scenario
  $writerName = "equora_page_${Outcome}_writer"
  $replayName = "equora_page_${Outcome}_replay"
  $pageSqlTemplate = @"
\set ON_ERROR_STOP on
begin;
set application_name = '__APPLICATION_NAME__';
set role service_role;
select public.equora_test_commit_scheduler_page(
  '$script:workUnitId', 1, '$leaseToken', '$authorizationId',
  '$requestResultId', '$Outcome'
)::text;
__HOLD__
commit;
"@
  $writerSql = $pageSqlTemplate.Replace('__APPLICATION_NAME__', $writerName).Replace('__HOLD__', 'select pg_sleep(1.2);')
  $replaySql = $pageSqlTemplate.Replace('__APPLICATION_NAME__', $replayName).Replace('__HOLD__', '')

  $writerJob = Start-Job -ScriptBlock $worker -ArgumentList $writerSql, $ContainerName, $TestDatabase
  try {
    Wait-WriterHold -ApplicationName $writerName
  }
  catch {
    Wait-Job -Job $writerJob | Out-Null
    $failedWriter = Receive-Job -Job $writerJob
    Remove-Job -Job $writerJob -Force
    throw "Writer $writerName failed before its hold phase: $($failedWriter.Output)"
  }
  $replayJob = Start-Job -ScriptBlock $worker -ArgumentList $replaySql, $ContainerName, $TestDatabase
  Wait-ReplayLock -ApplicationName $replayName
  Wait-Job -Job $writerJob, $replayJob | Out-Null
  $writer = Receive-Job -Job $writerJob
  $replay = Receive-Job -Job $replayJob
  Remove-Job -Job $writerJob, $replayJob -Force
  if ($writer.ExitCode -ne 0 -or $replay.ExitCode -ne 0) {
    throw "Concurrent $Outcome Page replay failed.`nWriter: $($writer.Output)`nReplay: $($replay.Output)"
  }
  $writerDigest = Get-ResultDigest -Output $writer.Output
  $replayDigest = Get-ResultDigest -Output $replay.Output
  if ($writerDigest -ne $replayDigest) {
    throw "Concurrent $Outcome Page replay returned different results."
  }

  $stateQuery = "select (select count(*) from public.broker_capture_request_authorizations where id='$authorizationId' and page_commit_input_digest is not null and page_commit_result is not null and page_committed_at is not null),(select count(*) from public.broker_provider_request_results where work_unit_id='$script:workUnitId'),(select count(*) from public.broker_raw_responses),(select count(*) from public.broker_capture_raw_events),(select count(*) from public.broker_capture_event_observations where request_result_id='$requestResultId'),(select status from public.broker_capture_work_units where id='$script:workUnitId'),(select row_version from public.broker_capture_work_units where id='$script:workUnitId'),(select scope_completeness from public.broker_sync_scopes where id=(select scope_id from public.broker_capture_work_units where id='$script:workUnitId')),(select closed_at is not null from public.broker_sync_scopes where id=(select scope_id from public.broker_capture_work_units where id='$script:workUnitId')),(select ledger_generation from public.broker_accounts where id='14c6b264-99b8-4c74-a882-135b88e9d100'),(select state from public.broker_capture_account_leases where broker_account_id='14c6b264-99b8-4c74-a882-135b88e9d100'),(select work_unit_id is null and lease_token_digest is null and lease_expires_at is null from public.broker_capture_account_leases where broker_account_id='14c6b264-99b8-4c74-a882-135b88e9d100');"
  $state = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c $stateQuery).Trim()
  if ($LASTEXITCODE -ne 0 -or $state -ne $ExpectedState) {
    throw "$Outcome Page replay left an invalid append-once state: $state"
  }
  $storedDigest = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select encode(public.equora_pgcrypto_digest_v1(convert_to(page_commit_result::text,'UTF8'),'sha256'),'hex') from public.broker_capture_request_authorizations where id='$authorizationId';").Trim()
  if ($LASTEXITCODE -ne 0 -or $storedDigest -ne $writerDigest) {
    throw "$Outcome stored Receipt result differs from both callers."
  }

  $driftSql = @"
\set ON_ERROR_STOP on
set role service_role;
select public.equora_test_commit_scheduler_page(
  '$script:workUnitId', 1, '$leaseToken', '$authorizationId',
  'd5000000-0000-4000-8000-000000000099', '$Outcome'
);
"@
  $ErrorActionPreference = 'Continue'
  $driftOutput = $driftSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase 2>&1
  $driftExitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($driftExitCode -eq 0 -or ($driftOutput -join [Environment]::NewLine) -notmatch 'CAPTURE_PAGE_REPLAY_MISMATCH') {
    throw "$Outcome drift replay was not rejected: $($driftOutput -join [Environment]::NewLine)"
  }
  $stateAfterDrift = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c $stateQuery).Trim()
  if ($LASTEXITCODE -ne 0 -or $stateAfterDrift -ne $state) {
    throw "$Outcome drift replay changed persistent state: $stateAfterDrift"
  }
}

try {
  Invoke-ReplayScenario -Outcome 'terminal_observed' -ExpectedState '1|1|1|1|1|terminal_observed|2|unverified|t|1|available|t'
  Invoke-ReplayScenario -Outcome 'loop_blocked' -ExpectedState '1|1|1|20|20|partial_failed|2|partial|t|1|available|t'
  Write-Output 'Broker capture concurrent terminal Page replay passed.'
  Write-Output 'PASS: terminal_observed and loop_blocked exact replays returned the immutable Receipt after an observed pg_locks.waitstart wait.'
  Write-Output 'PASS: each race persisted one Page effect and input drift failed closed with no partial state.'
}
finally {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
}
