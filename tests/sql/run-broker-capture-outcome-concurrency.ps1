param(
  [string]$ContainerName = 'equora-v5761-pgtest',
  [string]$TemplateDatabase = 'equora_remediation',
  [string]$TestDatabase = 'equora_capture_outcome_concurrency_v5761'
)

$ErrorActionPreference = 'Stop'

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TemplateDatabase -notmatch '^equora_[a-z0-9_]+$') {
  throw 'TemplateDatabase must be an explicitly named Equora test database.'
}
if ($TestDatabase -notmatch '^equora_capture_outcome_concurrency_[a-z0-9_]+$') {
  throw 'TestDatabase must use the equora_capture_outcome_concurrency_ prefix.'
}

$fixturePath = Join-Path $PSScriptRoot 'broker-capture-persistence.integration.sql'
$fixture = Get-Content -Raw -LiteralPath $fixturePath
$setupMarker = '-- EQUORA_CONCURRENCY_SETUP_END'
$setupEnd = $fixture.IndexOf($setupMarker, [StringComparison]::Ordinal)
if ($setupEnd -lt 0) {
  throw 'The integration fixture no longer exposes the expected setup boundary.'
}

$setupSql = $fixture.Substring(0, $setupEnd)
$setupSql = $setupSql.Replace('create temporary table fixture_checkpoint', 'create table public.fixture_checkpoint')
$setupSql = $setupSql.Replace('pg_temp.fixture_checkpoint', 'public.fixture_checkpoint')
$setupSql = $setupSql.Replace('pg_temp.commit_fixture_page', 'public.commit_fixture_page')
$setupSql += "`ncommit;`n"

$workUnitId = '670d4b00-c275-48f1-aa02-9712c6ce1190'
$requestResultId = '307e7468-8c64-4a94-ac00-897dbae4bb17'
$outcomeId = '907e7468-8c64-4a94-ac00-897dbae4bb17'
$leaseToken = '2c80af13-0e7c-4958-aa8e-40b306691fd9'
$checkpointMac = '160125df2a0a32533e0847d0f3586d24ffca6f139f2767e3fe712f1f16ae04c0'
$capabilityId = 'historical_orders_v1'
$pageScopeDigest = '20312b1ad761af60427439f96991429d4b508fb871815ad850a64e0a9e2f947d'
$rawBodyBase64 = 'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0='
$rawBodyDigest = '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a'
$pageDigest = 'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59'
$observationDigest = 'afa896aa7449842f8c23b8d41d458b364dcca0c113077d7133da4689a397ba10'

$worker = {
  param($SqlText, $DockerContainer, $Database)
  $ErrorActionPreference = 'Continue'
  $output = $SqlText | & docker exec -i $DockerContainer psql -U postgres -d $Database 2>&1
  [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = ($output -join [Environment]::NewLine)
  }
}

function Initialize-TestDatabase {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to remove the prior outcome-concurrency database.' }
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "create database $TestDatabase template $TemplateDatabase;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create the isolated outcome-concurrency database.' }

  # Test-only access to the fenced v1 implementation verifies its atomic core;
  # production/runtime grants remain revoked and v2 fence tests run separately.
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "grant execute on function public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text), public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text) to service_role;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to grant the test-only v1 claim/failure RPCs.' }

  $setupOutput = $setupSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Outcome-concurrency fixture setup failed: $($setupOutput -join [Environment]::NewLine)"
  }
}

function New-PageSql {
  param([Parameter(Mandatory = $true)][string]$ApplicationName)
  return @"
\set ON_ERROR_STOP on
begin;
set application_name = '$ApplicationName';
set role service_role;
select public.commit_fixture_page(
  '$workUnitId',
  '$requestResultId',
  'acba2551-2100-480b-a6fc-3ccd14c65be5',
  0,
  '2025-10-09T00:00:00.000000Z',
  'first_observation',
  '1759968000000000',
  '$observationDigest',
  '$rawBodyBase64',
  '$rawBodyDigest',
  '$pageDigest'
);
select pg_sleep(1.5);
commit;
"@
}

function New-FailureSql {
  param([Parameter(Mandatory = $true)][string]$ApplicationName)
  return @"
\set ON_ERROR_STOP on
begin;
set application_name = '$ApplicationName';
set role service_role;
select public.equora_record_broker_capture_failure_v1(
  '$workUnitId', 7, '$outcomeId', '$leaseToken', 1,
  '$checkpointMac', '$capabilityId', '$pageScopeDigest',
  'invalid_credential', 401, 16, 5,
  'broker-capture-failure-policy-v1'
);
select pg_sleep(1.5);
commit;
"@
}

function Wait-WinnerHold {
  param([Parameter(Mandatory = $true)][string]$ApplicationName)
  for ($poll = 0; $poll -lt 100; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name = '$ApplicationName' and query like '%pg_sleep%';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Failed to inspect winner session $ApplicationName." }
    if ($activity.Trim() -eq '1') { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Winner session $ApplicationName never reached its lock-holding phase."
}

function Wait-LoserLock {
  param([Parameter(Mandatory = $true)][string]$ApplicationName)
  for ($poll = 0; $poll -lt 40; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(distinct activity.pid) from pg_stat_activity activity join pg_locks lock_row on lock_row.pid = activity.pid and not lock_row.granted where activity.application_name = '$ApplicationName' and activity.wait_event_type = 'Lock' and lock_row.waitstart is not null;" 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Failed to inspect loser session $ApplicationName." }
    if ($activity.Trim() -eq '1') { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Loser session $ApplicationName was not observed waiting on the winner lock."
}

function Receive-WorkerPair {
  param(
    [Parameter(Mandatory = $true)]$WinnerJob,
    [Parameter(Mandatory = $true)]$LoserJob
  )
  Wait-Job -Job $WinnerJob, $LoserJob | Out-Null
  $winnerResult = Receive-Job -Job $WinnerJob
  $loserResult = Receive-Job -Job $LoserJob
  Remove-Job -Job $WinnerJob, $LoserJob -Force
  return @($winnerResult, $loserResult)
}

try {
  Initialize-TestDatabase

  $pageWinnerJob = Start-Job -ScriptBlock $worker -ArgumentList (New-PageSql -ApplicationName 'equora_outcome_page_winner'), $ContainerName, $TestDatabase
  Wait-WinnerHold -ApplicationName 'equora_outcome_page_winner'
  $failureLoserJob = Start-Job -ScriptBlock $worker -ArgumentList (New-FailureSql -ApplicationName 'equora_outcome_failure_loser'), $ContainerName, $TestDatabase
  Wait-LoserLock -ApplicationName 'equora_outcome_failure_loser'
  $pageFirstResults = Receive-WorkerPair -WinnerJob $pageWinnerJob -LoserJob $failureLoserJob
  if ($pageFirstResults[0].ExitCode -ne 0 -or $pageFirstResults[1].ExitCode -eq 0 -or $pageFirstResults[1].Output -notmatch 'CONTROL_WORK_UNIT_CAS_MISMATCH') {
    throw "Page-winner outcome race was not fail-closed.`nWinner: $($pageFirstResults[0].Output)`nLoser: $($pageFirstResults[1].Output)"
  }

  $pageFirstState = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select (select count(*) from public.broker_provider_request_results where work_unit_id = '$workUnitId' and request_sequence = 1), (select count(*) from public.broker_capture_attempt_outcomes where work_unit_id = '$workUnitId' and request_sequence = 1), (select status from public.broker_capture_work_units where id = '$workUnitId'), (select row_version from public.broker_capture_work_units where id = '$workUnitId'), (select request_sequence from public.broker_capture_work_units where id = '$workUnitId'), (select status from public.broker_capture_runs where id = 'acba2551-2100-480b-a6fc-3ccd14c65be5'), (select failed_request_count from public.broker_capture_runs where id = 'acba2551-2100-480b-a6fc-3ccd14c65be5'), (select scope_completeness from public.broker_sync_scopes where id = '18000000-0000-4000-8000-000000000001'), (select closed_at is not null from public.broker_sync_scopes where id = '18000000-0000-4000-8000-000000000001'), (select ledger_generation from public.broker_accounts where id = '14c6b264-99b8-4c74-a882-135b88e9d100');"
  if ($LASTEXITCODE -ne 0 -or $pageFirstState.Trim() -ne '1|0|terminal_observed|8|1|running|0|unverified|t|1') {
    throw "Page-winner outcome race left an invalid persistent state: $pageFirstState"
  }

  Initialize-TestDatabase

  $failureWinnerJob = Start-Job -ScriptBlock $worker -ArgumentList (New-FailureSql -ApplicationName 'equora_outcome_failure_winner'), $ContainerName, $TestDatabase
  try {
    Wait-WinnerHold -ApplicationName 'equora_outcome_failure_winner'
  }
  catch {
    Wait-Job -Job $failureWinnerJob | Out-Null
    $failedWinner = Receive-Job -Job $failureWinnerJob
    Remove-Job -Job $failureWinnerJob -Force
    throw "Failure winner did not reach its hold phase: $($failedWinner.Output)"
  }
  $pageLoserJob = Start-Job -ScriptBlock $worker -ArgumentList (New-PageSql -ApplicationName 'equora_outcome_page_loser'), $ContainerName, $TestDatabase
  Wait-LoserLock -ApplicationName 'equora_outcome_page_loser'
  $failureFirstResults = Receive-WorkerPair -WinnerJob $failureWinnerJob -LoserJob $pageLoserJob
  if ($failureFirstResults[0].ExitCode -ne 0 -or $failureFirstResults[1].ExitCode -eq 0 -or $failureFirstResults[1].Output -notmatch 'CAPTURE_LEASE_INVALID') {
    throw "Failure-winner outcome race was not fail-closed.`nWinner: $($failureFirstResults[0].Output)`nLoser: $($failureFirstResults[1].Output)"
  }

  $failureFirstState = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select (select count(*) from public.broker_provider_request_results where work_unit_id = '$workUnitId' and request_sequence = 1), (select count(*) from public.broker_capture_attempt_outcomes where work_unit_id = '$workUnitId' and request_sequence = 1), (select status from public.broker_capture_work_units where id = '$workUnitId'), (select row_version from public.broker_capture_work_units where id = '$workUnitId'), (select request_sequence from public.broker_capture_work_units where id = '$workUnitId'), (select status from public.broker_capture_runs where id = 'acba2551-2100-480b-a6fc-3ccd14c65be5'), (select failed_request_count from public.broker_capture_runs where id = 'acba2551-2100-480b-a6fc-3ccd14c65be5'), (select scope_completeness from public.broker_sync_scopes where id = '18000000-0000-4000-8000-000000000001'), (select closed_at is not null from public.broker_sync_scopes where id = '18000000-0000-4000-8000-000000000001'), (select ledger_generation from public.broker_accounts where id = '14c6b264-99b8-4c74-a882-135b88e9d100');"
  if ($LASTEXITCODE -ne 0 -or $failureFirstState.Trim() -ne '0|1|partial_failed|8|1|partial|1|failed|t|0') {
    throw "Failure-winner outcome race left an invalid persistent state: $failureFirstState"
  }

  Write-Host 'PASS: Page-success and Failure were raced in both winner orders for the same Work Unit and request sequence.'
  Write-Host 'PASS: exactly one immutable outcome committed per race; each loser failed closed after an observed row-lock wait with no partial state.'
}
finally {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
}
