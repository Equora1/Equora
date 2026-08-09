param(
  [string]$ContainerName = 'equora-v5761-pgtest',
  [string]$TemplateDatabase = 'equora_remediation',
  [string]$TestDatabase = 'equora_capture_concurrency_v5761'
)

$ErrorActionPreference = 'Stop'

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TemplateDatabase -notmatch '^equora_[a-z0-9_]+$') {
  throw 'TemplateDatabase must be an explicitly named Equora test database.'
}
if ($TestDatabase -notmatch '^equora_capture_concurrency_[a-z0-9_]+$') {
  throw 'TestDatabase must use the equora_capture_concurrency_ prefix.'
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

$rawBodyBase64 = 'eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjowLCJkYXRhIjpbeyJvcmRlcklkIjoiMTIzIiwicG9zaXRpb25JZCI6IjQ1NiIsInN5bWJvbCI6IkJUQ19VU0RUIiwic2lkZSI6MSwicG9zaXRpb25Nb2RlIjoxLCJzdGF0ZSI6MywiY2F0ZWdvcnkiOjEsIm9yZGVyVHlwZSI6MSwidm9sIjoiMi41MDAwIiwiZGVhbFZvbCI6IjIuNTAwMCIsInByaWNlIjoiMTAwLjEyNTAiLCJkZWFsQXZnUHJpY2UiOiIxMDAuMTI1MCIsInRha2VyRmVlIjoiLTAuMDEwMCIsIm1ha2VyRmVlIjoiMCIsInByb2ZpdCI6IjEuNTAwMCIsImZlZUN1cnJlbmN5IjoiVVNEVCIsImNyZWF0ZVRpbWUiOjE3NTk5MjQ4MDAwMDAsInVwZGF0ZVRpbWUiOjE3NTk5MjQ4MDEwMDB9XX0='
$rawBodyDigest = '43367294cb9a3d74eb124a54927121cc07627bafa07133776df1d6633b546d3a'
$pageDigest = 'a847bcc039d4c98f7adea81e6d2f771c681ea316ec957d0d5f21843c3830ea59'

function New-SessionSql {
  param(
    [Parameter(Mandatory = $true)][string]$ApplicationName,
    [Parameter(Mandatory = $true)][string]$WorkUnitId,
    [Parameter(Mandatory = $true)][string]$RequestResultId,
    [Parameter(Mandatory = $true)][string]$ObservationDigest,
    [string]$Occurrence = 'first_observation',
    [string]$FirstObservedAtUs = '1759968000000000',
    [long]$ExpectedLedgerGeneration = 0,
    [string]$ResponseReceivedAt = '2025-10-09T00:00:00.000000Z',
    [string]$PostCommitHoldSeconds = '0.75'
  )

  if ($PostCommitHoldSeconds -notmatch '^(?:0|[1-9]\d*)(?:\.\d{1,3})?$') {
    throw 'PostCommitHoldSeconds must be a non-negative invariant decimal.'
  }

  return @"
\set ON_ERROR_STOP on
begin;
set application_name = '$ApplicationName';
set role service_role;
select public.commit_fixture_page(
  '$WorkUnitId',
  '$RequestResultId',
  'acba2551-2100-480b-a6fc-3ccd14c65be5',
  $ExpectedLedgerGeneration,
  '$ResponseReceivedAt',
  '$Occurrence',
  '$FirstObservedAtUs',
  '$ObservationDigest',
  '$rawBodyBase64',
  '$rawBodyDigest',
  '$pageDigest'
);
select pg_sleep($PostCommitHoldSeconds);
commit;
"@
}

$sessionA = New-SessionSql `
  -ApplicationName 'equora_concurrency_A' `
  -WorkUnitId '670d4b00-c275-48f1-aa02-9712c6ce1190' `
  -RequestResultId '307e7468-8c64-4a94-ac00-897dbae4bb17' `
  -ObservationDigest 'afa896aa7449842f8c23b8d41d458b364dcca0c113077d7133da4689a397ba10'
$sessionB = New-SessionSql `
  -ApplicationName 'equora_concurrency_B' `
  -WorkUnitId '770d4b00-c275-48f1-aa02-9712c6ce1190' `
  -RequestResultId '407e7468-8c64-4a94-ac00-897dbae4bb17' `
  -ObservationDigest 'd9db64dd71b8961d5235268c82a0f130d617c5b157bb1abb0ea90fc58c710dfd'

try {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to remove the prior concurrency test database.' }
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "create database $TestDatabase template $TemplateDatabase;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create the isolated concurrency test database.' }

  # Test-only access to the fenced v1 implementation verifies its atomic core;
  # production/runtime grants remain revoked and v2 fence tests run separately.
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "grant execute on function public.equora_commit_broker_capture_page_v1(uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb) to service_role;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to grant the test-only v1 page RPC.' }

  $setupOutput = $setupSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Concurrency fixture setup failed: $($setupOutput -join [Environment]::NewLine)" }

  $worker = {
    param($SqlText, $DockerContainer, $Database)
    $output = $SqlText | & docker exec -i $DockerContainer psql -U postgres -d $Database 2>&1
    [pscustomobject]@{
      ExitCode = $LASTEXITCODE
      Output = ($output -join [Environment]::NewLine)
    }
  }

  $assertZeroCaptureWrites = {
    param([string]$Phase)
    $stateSql = @"
select
  (select ledger_generation from public.broker_accounts where id = '14c6b264-99b8-4c74-a882-135b88e9d100'),
  (select count(*) from public.broker_provider_request_results),
  (select count(*) from public.broker_raw_responses),
  (select count(*) from public.broker_capture_raw_events),
  (select count(*) from public.broker_capture_event_observations),
  (select count(*) from public.broker_capture_work_units where row_version = 7),
  (select scope_completeness from public.broker_sync_scopes where id = '18000000-0000-4000-8000-000000000001'),
  (select stability_status from public.broker_sync_scopes where id = '18000000-0000-4000-8000-000000000001'),
  (select closed_at is null from public.broker_sync_scopes where id = '18000000-0000-4000-8000-000000000001'),
  (select status from public.broker_capture_runs where id = 'acba2551-2100-480b-a6fc-3ccd14c65be5'),
  (select started_at is null from public.broker_capture_runs where id = 'acba2551-2100-480b-a6fc-3ccd14c65be5'),
  (select observed_event_count from public.broker_capture_runs where id = 'acba2551-2100-480b-a6fc-3ccd14c65be5'),
  (select inserted_raw_event_count from public.broker_capture_runs where id = 'acba2551-2100-480b-a6fc-3ccd14c65be5'),
  (select repeated_observation_count from public.broker_capture_runs where id = 'acba2551-2100-480b-a6fc-3ccd14c65be5');
"@
    $state = $stateSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0 -or $state.Trim() -ne '0|0|0|0|0|2|unverified|not_observed|t|running|t|0|0|0') {
      throw "$Phase left partial capture state: $state"
    }
  }

  $leaseBlockerSql = @"
\set ON_ERROR_STOP on
begin;
set application_name = 'equora_lease_expiry_blocker';
select id from public.broker_sync_scopes
where id = '18000000-0000-4000-8000-000000000001'
for update;
select pg_sleep(1.9);
commit;
"@
  $leaseObservationDigestSql = "select public.equora_raw_event_observation_digest_v1('$pageDigest','d5086fb6f6a9e8e9ab86e0e853ce92ae1d47ea3a6b3cafb33e4c966ddf8b0c40','acba2551-2100-480b-a6fc-3ccd14c65be5','117e7468-8c64-4a94-ac00-897dbae4bb17',0,'first_observation');"
  $leaseObservationDigest = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c $leaseObservationDigestSql).Trim()
  if ($LASTEXITCODE -ne 0 -or $leaseObservationDigest -notmatch '^[a-f0-9]{64}$') {
    throw "Could not derive the lease-expiry observation digest: $leaseObservationDigest"
  }
  $leaseCommitSql = New-SessionSql `
    -ApplicationName 'equora_lease_expiry_commit' `
    -WorkUnitId '670d4b00-c275-48f1-aa02-9712c6ce1190' `
    -RequestResultId '117e7468-8c64-4a94-ac00-897dbae4bb17' `
    -ObservationDigest $leaseObservationDigest `
    -PostCommitHoldSeconds '0'

  $leaseBlockerJob = Start-Job -ScriptBlock $worker -ArgumentList $leaseBlockerSql, $ContainerName, $TestDatabase
  $leaseBlockerReady = $false
  for ($poll = 0; $poll -lt 50 -and -not $leaseBlockerReady; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name = 'equora_lease_expiry_blocker' and query like '%pg_sleep%';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the lease-expiry blocker.' }
    $leaseBlockerReady = $activity.Trim() -eq '1'
    if (-not $leaseBlockerReady) { Start-Sleep -Milliseconds 50 }
  }
  if (-not $leaseBlockerReady) { throw 'Lease-expiry blocker never acquired the late scope-write lock.' }

  $leaseExpiryUpdate = "update public.broker_capture_work_units set lease_expires_at = clock_timestamp() + interval '1 second' where id = '670d4b00-c275-48f1-aa02-9712c6ce1190';"
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c $leaseExpiryUpdate | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to arm the lease immediately before the expiry-race commit.' }

  $leaseCommitJob = Start-Job -ScriptBlock $worker -ArgumentList $leaseCommitSql, $ContainerName, $TestDatabase
  $leaseWaitObservedBeforeExpiry = $false
  for ($poll = 0; $poll -lt 50 -and -not $leaseWaitObservedBeforeExpiry; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(distinct a.pid) from pg_stat_activity a join pg_locks l on l.pid = a.pid and not l.granted where a.application_name = 'equora_lease_expiry_commit' and a.wait_event_type = 'Lock' and l.waitstart < (select lease_expires_at from public.broker_capture_work_units where id = '670d4b00-c275-48f1-aa02-9712c6ce1190');" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the lease-expiry wait.' }
    $leaseWaitObservedBeforeExpiry = $activity.Trim() -eq '1'
    if (-not $leaseWaitObservedBeforeExpiry) { Start-Sleep -Milliseconds 50 }
  }

  Wait-Job -Job $leaseBlockerJob, $leaseCommitJob | Out-Null
  $leaseBlockerResult = Receive-Job -Job $leaseBlockerJob
  $leaseCommitResult = Receive-Job -Job $leaseCommitJob
  Remove-Job -Job $leaseBlockerJob, $leaseCommitJob -Force
  if ($leaseBlockerResult.ExitCode -ne 0 -or $leaseCommitResult.ExitCode -eq 0 -or $leaseCommitResult.Output -notmatch 'CAPTURE_LEASE_INVALID' -or -not $leaseWaitObservedBeforeExpiry) {
    throw "Lease-expiry race was not rejected after a pre-expiry lock wait.`nBlocker: $($leaseBlockerResult.Output)`nCommit: $($leaseCommitResult.Output)"
  }
  & $assertZeroCaptureWrites 'Lease-expiry race'

  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "update public.broker_capture_work_units set lease_expires_at = clock_timestamp() + interval '1 hour' where id = '670d4b00-c275-48f1-aa02-9712c6ce1190';" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to restore the valid lease after the expiry race.' }

  $keyBlockerSql = @"
\set ON_ERROR_STOP on
begin;
set application_name = 'equora_key_expiry_blocker';
select id from public.broker_sync_scopes
where id = '18000000-0000-4000-8000-000000000001'
for update;
select pg_sleep(1.9);
commit;
"@
  $keyObservationDigestSql = "select public.equora_raw_event_observation_digest_v1('$pageDigest','d5086fb6f6a9e8e9ab86e0e853ce92ae1d47ea3a6b3cafb33e4c966ddf8b0c40','acba2551-2100-480b-a6fc-3ccd14c65be5','127e7468-8c64-4a94-ac00-897dbae4bb17',0,'first_observation');"
  $keyObservationDigest = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c $keyObservationDigestSql).Trim()
  if ($LASTEXITCODE -ne 0 -or $keyObservationDigest -notmatch '^[a-f0-9]{64}$') {
    throw "Could not derive the integrity-key-expiry observation digest: $keyObservationDigest"
  }
  $keyCommitSql = New-SessionSql `
    -ApplicationName 'equora_key_expiry_commit' `
    -WorkUnitId '670d4b00-c275-48f1-aa02-9712c6ce1190' `
    -RequestResultId '127e7468-8c64-4a94-ac00-897dbae4bb17' `
    -ObservationDigest $keyObservationDigest `
    -PostCommitHoldSeconds '0'

  $keyBlockerJob = Start-Job -ScriptBlock $worker -ArgumentList $keyBlockerSql, $ContainerName, $TestDatabase
  $keyBlockerReady = $false
  for ($poll = 0; $poll -lt 50 -and -not $keyBlockerReady; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name = 'equora_key_expiry_blocker' and query like '%pg_sleep%';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the integrity-key expiry blocker.' }
    $keyBlockerReady = $activity.Trim() -eq '1'
    if (-not $keyBlockerReady) { Start-Sleep -Milliseconds 50 }
  }
  if (-not $keyBlockerReady) { throw 'Integrity-key expiry blocker never acquired the late scope-write lock.' }

  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "update equora_private.broker_capture_integrity_keys set valid_to = clock_timestamp() + interval '1 second' where id = '13000000-0000-4000-8000-000000000001';" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to arm the integrity key immediately before the expiry-race commit.' }

  $keyCommitJob = Start-Job -ScriptBlock $worker -ArgumentList $keyCommitSql, $ContainerName, $TestDatabase
  $keyWaitObservedBeforeExpiry = $false
  for ($poll = 0; $poll -lt 50 -and -not $keyWaitObservedBeforeExpiry; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(distinct a.pid) from pg_stat_activity a join pg_locks l on l.pid = a.pid and not l.granted where a.application_name = 'equora_key_expiry_commit' and a.wait_event_type = 'Lock' and l.waitstart < (select valid_to from equora_private.broker_capture_integrity_keys where id = '13000000-0000-4000-8000-000000000001');" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the integrity-key expiry wait.' }
    $keyWaitObservedBeforeExpiry = $activity.Trim() -eq '1'
    if (-not $keyWaitObservedBeforeExpiry) { Start-Sleep -Milliseconds 50 }
  }

  Wait-Job -Job $keyBlockerJob, $keyCommitJob | Out-Null
  $keyBlockerResult = Receive-Job -Job $keyBlockerJob
  $keyCommitResult = Receive-Job -Job $keyCommitJob
  Remove-Job -Job $keyBlockerJob, $keyCommitJob -Force
  if ($keyBlockerResult.ExitCode -ne 0 -or $keyCommitResult.ExitCode -eq 0 -or $keyCommitResult.Output -notmatch 'CAPTURE_INTEGRITY_KEY_INVALID' -or -not $keyWaitObservedBeforeExpiry) {
    throw "Integrity-key expiry race was not rejected after a pre-expiry lock wait.`nBlocker: $($keyBlockerResult.Output)`nCommit: $($keyCommitResult.Output)"
  }
  & $assertZeroCaptureWrites 'Integrity-key expiry race'

  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "update equora_private.broker_capture_integrity_keys set valid_to = null where id = '13000000-0000-4000-8000-000000000001';" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to restore the active integrity key after the expiry race.' }

  $lockTimeoutBlockerSql = @"
\set ON_ERROR_STOP on
begin;
set application_name = 'equora_lock_timeout_blocker';
select id from public.broker_capture_work_units
where id = '670d4b00-c275-48f1-aa02-9712c6ce1190'
for update;
select pg_sleep(3);
commit;
"@
  $lockTimeoutCommitSql = New-SessionSql `
    -ApplicationName 'equora_lock_timeout_commit' `
    -WorkUnitId '670d4b00-c275-48f1-aa02-9712c6ce1190' `
    -RequestResultId '137e7468-8c64-4a94-ac00-897dbae4bb17' `
    -ObservationDigest ('c' * 64) `
    -PostCommitHoldSeconds '0'

  $lockTimeoutBlockerJob = Start-Job -ScriptBlock $worker -ArgumentList $lockTimeoutBlockerSql, $ContainerName, $TestDatabase
  $lockTimeoutBlockerReady = $false
  for ($poll = 0; $poll -lt 50 -and -not $lockTimeoutBlockerReady; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name = 'equora_lock_timeout_blocker' and query like '%pg_sleep%';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the lock-timeout blocker.' }
    $lockTimeoutBlockerReady = $activity.Trim() -eq '1'
    if (-not $lockTimeoutBlockerReady) { Start-Sleep -Milliseconds 50 }
  }
  if (-not $lockTimeoutBlockerReady) { throw 'Lock-timeout blocker never acquired the work-unit lock.' }

  $lockTimeoutCommitJob = Start-Job -ScriptBlock $worker -ArgumentList $lockTimeoutCommitSql, $ContainerName, $TestDatabase
  $lockTimeoutWaitObserved = $false
  for ($poll = 0; $poll -lt 50 -and -not $lockTimeoutWaitObserved; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name = 'equora_lock_timeout_commit' and wait_event_type = 'Lock';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the lock-timeout wait.' }
    $lockTimeoutWaitObserved = $activity.Trim() -eq '1'
    if (-not $lockTimeoutWaitObserved) { Start-Sleep -Milliseconds 50 }
  }

  Wait-Job -Job $lockTimeoutBlockerJob, $lockTimeoutCommitJob | Out-Null
  $lockTimeoutBlockerResult = Receive-Job -Job $lockTimeoutBlockerJob
  $lockTimeoutCommitResult = Receive-Job -Job $lockTimeoutCommitJob
  Remove-Job -Job $lockTimeoutBlockerJob, $lockTimeoutCommitJob -Force
  if ($lockTimeoutBlockerResult.ExitCode -ne 0 -or $lockTimeoutCommitResult.ExitCode -eq 0 -or $lockTimeoutCommitResult.Output -notmatch 'CAPTURE_LOCK_TIMEOUT' -or -not $lockTimeoutWaitObserved) {
    throw "Lock-timeout path did not fail closed.`nBlocker: $($lockTimeoutBlockerResult.Output)`nCommit: $($lockTimeoutCommitResult.Output)"
  }
  & $assertZeroCaptureWrites 'Lock-timeout path'

  $jobA = Start-Job -ScriptBlock $worker -ArgumentList $sessionA, $ContainerName, $TestDatabase
  $jobB = Start-Job -ScriptBlock $worker -ArgumentList $sessionB, $ContainerName, $TestDatabase

  $overlapObserved = $false
  for ($poll = 0; $poll -lt 100 -and -not $overlapObserved; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*), count(*) filter (where wait_event_type = 'Lock') from pg_stat_activity where application_name like 'equora_concurrency_%';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect concurrency activity.' }
    if ($activity.Trim() -match '^(\d+)\|(\d+)$') {
      $activeSessions = [int]$Matches[1]
      $lockWaiters = [int]$Matches[2]
      $overlapObserved = $activeSessions -ge 2 -and $lockWaiters -ge 1
    }
    if (-not $overlapObserved) { Start-Sleep -Milliseconds 100 }
  }

  Wait-Job -Job $jobA, $jobB | Out-Null
  $resultA = Receive-Job -Job $jobA
  $resultB = Receive-Job -Job $jobB
  Remove-Job -Job $jobA, $jobB -Force

  $results = @($resultA, $resultB)
  $successes = @($results | Where-Object { $_.ExitCode -eq 0 })
  $casLosers = @($results | Where-Object {
    $_.ExitCode -ne 0 -and $_.Output -match 'CAPTURE_LEDGER_CAS_MISMATCH'
  })
  if ($successes.Count -ne 1 -or $casLosers.Count -ne 1) {
    throw "Expected one commit and one ledger-CAS rejection.`nA: $($resultA.Output)`nB: $($resultB.Output)"
  }
  if (-not $overlapObserved) {
    throw 'The two commit sessions did not produce an observed overlapping lock wait.'
  }

  $countsSql = @"
select
  (select ledger_generation from public.broker_accounts where id = '14c6b264-99b8-4c74-a882-135b88e9d100'),
  (select count(*) from public.broker_provider_request_results),
  (select count(*) from public.broker_raw_responses),
  (select count(*) from public.broker_capture_raw_events),
  (select count(*) from public.broker_capture_event_observations),
  (select count(*) from public.broker_capture_work_units where row_version = 8),
  (select count(*) from public.broker_capture_work_units where row_version = 7);
"@
  $counts = $countsSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0 -or $counts.Trim() -ne '1|1|1|1|1|1|1') {
    throw "Unexpected post-concurrency state: $counts"
  }

  $remainingWorkUnit = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select id from public.broker_capture_work_units where row_version = 7;").Trim()
  if ($LASTEXITCODE -ne 0 -or $remainingWorkUnit -notmatch '^[a-f0-9-]{36}$') {
    throw "Could not resolve the remaining work unit: $remainingWorkUnit"
  }

  $activationRequestResultId = '607e7468-8c64-4a94-ac00-897dbae4bb17'
  $repeatDigestSql = "select public.equora_raw_event_observation_digest_v1('$pageDigest','d5086fb6f6a9e8e9ab86e0e853ce92ae1d47ea3a6b3cafb33e4c966ddf8b0c40','acba2551-2100-480b-a6fc-3ccd14c65be5','$activationRequestResultId',0,'repeated_observation');"
  $repeatDigest = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c $repeatDigestSql).Trim()
  if ($LASTEXITCODE -ne 0 -or $repeatDigest -notmatch '^[a-f0-9]{64}$') {
    throw "Could not derive the activation-race observation digest: $repeatDigest"
  }

  $activationCommitSql = New-SessionSql `
    -ApplicationName 'equora_activation_commit' `
    -WorkUnitId $remainingWorkUnit `
    -RequestResultId $activationRequestResultId `
    -ObservationDigest $repeatDigest `
    -Occurrence 'repeated_observation' `
    -ExpectedLedgerGeneration 1 `
    -ResponseReceivedAt '2025-10-09T00:00:01.000000Z' `
    -PostCommitHoldSeconds '3'
  $activationPauseSql = @"
\set ON_ERROR_STOP on
begin;
set application_name = 'equora_activation_pause';
update public.broker_sync_activations
set activation_state = 'paused', lifecycle_updated_at = statement_timestamp()
where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8';
commit;
"@

  $activationCommitJob = Start-Job -ScriptBlock $worker -ArgumentList $activationCommitSql, $ContainerName, $TestDatabase
  $commitHoldingLocks = $false
  for ($poll = 0; $poll -lt 100 -and -not $commitHoldingLocks; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name = 'equora_activation_commit' and query like '%pg_sleep%';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the activation commit session.' }
    $commitHoldingLocks = $activity.Trim() -eq '1'
    if (-not $commitHoldingLocks) { Start-Sleep -Milliseconds 100 }
  }
  if (-not $commitHoldingLocks) {
    Wait-Job -Job $activationCommitJob | Out-Null
    $failedCommit = Receive-Job -Job $activationCommitJob
    Remove-Job -Job $activationCommitJob -Force
    throw "Activation commit never reached its lock-holding phase: $($failedCommit.Output)"
  }

  $activationPauseJob = Start-Job -ScriptBlock $worker -ArgumentList $activationPauseSql, $ContainerName, $TestDatabase
  $pauseWaitObserved = $false
  for ($poll = 0; $poll -lt 40 -and -not $pauseWaitObserved; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name = 'equora_activation_pause' and wait_event_type = 'Lock';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the activation pause session.' }
    $pauseWaitObserved = $activity.Trim() -eq '1'
    if (-not $pauseWaitObserved) { Start-Sleep -Milliseconds 100 }
  }

  Wait-Job -Job $activationCommitJob, $activationPauseJob | Out-Null
  $activationCommitResult = Receive-Job -Job $activationCommitJob
  $activationPauseResult = Receive-Job -Job $activationPauseJob
  Remove-Job -Job $activationCommitJob, $activationPauseJob -Force
  if ($activationCommitResult.ExitCode -ne 0 -or $activationPauseResult.ExitCode -ne 0 -or -not $pauseWaitObserved) {
    throw "Activation race did not serialize safely.`nCommit: $($activationCommitResult.Output)`nPause: $($activationPauseResult.Output)"
  }

  $activationStateSql = @"
select
  (select activation_state from public.broker_sync_activations where id = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'),
  (select ledger_generation from public.broker_accounts where id = '14c6b264-99b8-4c74-a882-135b88e9d100'),
  (select count(*) from public.broker_provider_request_results),
  (select count(*) from public.broker_capture_raw_events),
  (select count(*) from public.broker_capture_event_observations),
  (select count(*) from public.broker_capture_work_units where row_version = 8);
"@
  $activationState = $activationStateSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0 -or $activationState.Trim() -ne 'paused|2|2|1|2|2') {
    throw "Unexpected post-activation-race state: $activationState"
  }

  Write-Host 'PASS: lease and integrity-key expiry during observed late scope-write waits both rolled back all partial rows.'
  Write-Host 'PASS: the explicit 2-second lock timeout produced CAPTURE_LOCK_TIMEOUT with no partial rows.'
  Write-Host 'PASS: overlapping sessions were observed; exactly one page committed and one lost on ledger CAS with no partial rows.'
  Write-Host 'PASS: activation pause waited on the in-flight commit lock, then applied only after the atomic commit completed.'
}
finally {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
}
