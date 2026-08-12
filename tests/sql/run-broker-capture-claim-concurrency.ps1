param(
  [string]$ContainerName = 'equora-v5761-pgtest',
  [string]$TemplateDatabase = 'equora_remediation',
  [string]$TestDatabase = 'equora_capture_claim_concurrency_v5761'
)

$ErrorActionPreference = 'Stop'

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TemplateDatabase -notmatch '^equora_[a-z0-9_]+$') {
  throw 'TemplateDatabase must be an explicitly named Equora test database.'
}
if ($TestDatabase -notmatch '^equora_capture_claim_concurrency_[a-z0-9_]+$') {
  throw 'TestDatabase must use the equora_capture_claim_concurrency_ prefix.'
}

$fixturePath = Join-Path $PSScriptRoot 'broker-capture-persistence.integration.sql'
$fixture = Get-Content -Raw -LiteralPath $fixturePath
$setupMarker = '-- EQUORA_CONCURRENCY_SETUP_END'
$setupEnd = $fixture.IndexOf($setupMarker, [StringComparison]::Ordinal)
if ($setupEnd -lt 0) {
  throw 'The integration fixture no longer exposes the expected setup boundary.'
}
$setupSql = $fixture.Substring(0, $setupEnd) + "`ncommit;`n"

$workUnitId = '870d4b00-c275-48f1-aa02-9712c6ce1190'
$runId = 'bcba2551-2100-480b-a6fc-3ccd14c65be5'
$scopeId = '28000000-0000-4000-8000-000000000001'
$accountId = '14c6b264-99b8-4c74-a882-135b88e9d100'
$integrityKeyId = '13000000-0000-4000-8000-000000000001'
$activationId = 'b15526c9-c0e7-4ace-a3d1-f8055de216c8'
$connectionAccountId = 'b34b98ae-a682-44de-a1bc-21ca75888d45'

function New-ClaimSql {
  param(
    [Parameter(Mandatory = $true)][string]$ApplicationName,
    [Parameter(Mandatory = $true)][string]$ClaimRequestId,
    [Parameter(Mandatory = $true)][string]$LeaseToken,
    [string]$PostClaimHoldSeconds = '0'
  )
  if ($PostClaimHoldSeconds -notmatch '^(?:0|[1-9]\d*)(?:\.\d{1,3})?$') {
    throw 'PostClaimHoldSeconds must be a non-negative invariant decimal.'
  }
  return @"
\set ON_ERROR_STOP on
begin;
set application_name = '$ApplicationName';
set role service_role;
select public.equora_claim_broker_capture_work_unit_v1(
  '$workUnitId',
  0,
  '$ClaimRequestId',
  '$LeaseToken',
  'broker-capture-claim-v1'
);
select pg_sleep($PostClaimHoldSeconds);
commit;
"@
}

$worker = {
  param($SqlText, $DockerContainer, $Database)
  $ErrorActionPreference = 'Continue'
  $output = $SqlText | & docker exec -i $DockerContainer psql -U postgres -d $Database 2>&1
  [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = ($output -join [Environment]::NewLine)
  }
}

$assertUnclaimed = {
  param([string]$Phase)
  $stateSql = @"
select
  (select status from public.broker_capture_work_units where id = '$workUnitId'),
  (select row_version from public.broker_capture_work_units where id = '$workUnitId'),
  (select attempt from public.broker_capture_work_units where id = '$workUnitId'),
  (select claim_count from public.broker_capture_work_units where id = '$workUnitId'),
  (select last_claim_request_id is null from public.broker_capture_work_units where id = '$workUnitId'),
  (select lease_token_digest is null from public.broker_capture_work_units where id = '$workUnitId'),
  (select status from public.broker_capture_runs where id = '$runId'),
  (select started_at is null from public.broker_capture_runs where id = '$runId'),
  (select count(*) from public.broker_capture_attempt_outcomes where work_unit_id = '$workUnitId');
"@
  $state = $stateSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0 -or $state.Trim() -ne 'pending|0|0|0|t|t|pending|t|0') {
    throw "$Phase left partial claim state: $state"
  }
}

try {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to remove the prior claim-concurrency database.' }
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "create database $TestDatabase template $TemplateDatabase;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create the isolated claim-concurrency database.' }

  # Test-only access to the fenced v1 implementation verifies its atomic core;
  # production/runtime grants remain revoked and v2 fence tests run separately.
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "grant execute on function public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text) to service_role;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to grant the test-only v1 claim RPC.' }

  $setupOutput = $setupSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Claim-concurrency fixture setup failed: $($setupOutput -join [Environment]::NewLine)"
  }

  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "update public.broker_sync_activations set activation_cutover_at = clock_timestamp() + interval '1 hour', user_read_only_attested_at = clock_timestamp() + interval '55 minutes' where id = '$activationId';" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to arm the future activation-cutover test.' }
  $futureActivation = & $worker (New-ClaimSql -ApplicationName 'equora_claim_future_activation' -ClaimRequestId '83000000-0000-4000-8000-000000000010' -LeaseToken '93000000-0000-4000-8000-000000000010') $ContainerName $TestDatabase
  if ($futureActivation.ExitCode -eq 0 -or $futureActivation.Output -notmatch 'CONTROL_ACTIVATION_INACTIVE') {
    throw "Future activation cutover was not rejected: $($futureActivation.Output)"
  }
  & $assertUnclaimed 'Future activation cutover'
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "update public.broker_sync_activations set activation_cutover_at = clock_timestamp(), user_read_only_attested_at = clock_timestamp() - interval '1 minute' where id = '$activationId';" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to restore the activation cutover.' }

  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "update public.broker_connection_accounts set valid_from = clock_timestamp() + interval '1 hour' where id = '$connectionAccountId';" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to arm the future connection-account test.' }
  $futureConnection = & $worker (New-ClaimSql -ApplicationName 'equora_claim_future_connection' -ClaimRequestId '83000000-0000-4000-8000-000000000011' -LeaseToken '93000000-0000-4000-8000-000000000011') $ContainerName $TestDatabase
  if ($futureConnection.ExitCode -eq 0 -or $futureConnection.Output -notmatch 'CONTROL_CONNECTION_INACTIVE') {
    throw "Future connection-account validity was not rejected: $($futureConnection.Output)"
  }
  & $assertUnclaimed 'Future connection-account validity'
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "update public.broker_connection_accounts set valid_from = clock_timestamp() - interval '1 hour' where id = '$connectionAccountId';" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to restore the connection-account validity.' }

  $scopeRaceBlockerSql = @"
\set ON_ERROR_STOP on
begin;
set application_name = 'equora_claim_scope_race_blocker';
select id from public.broker_accounts where id = '$accountId' for update;
select pg_sleep(1.2);
commit;
"@
  $scopeRaceClaimSql = New-ClaimSql -ApplicationName 'equora_claim_scope_race_waiter' -ClaimRequestId '83000000-0000-4000-8000-000000000012' -LeaseToken '93000000-0000-4000-8000-000000000012'
  $scopeRaceBlockerJob = Start-Job -ScriptBlock $worker -ArgumentList $scopeRaceBlockerSql, $ContainerName, $TestDatabase
  $scopeRaceBlockerReady = $false
  for ($poll = 0; $poll -lt 50 -and -not $scopeRaceBlockerReady; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name = 'equora_claim_scope_race_blocker' and query like '%pg_sleep%';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the stale-scope blocker.' }
    $scopeRaceBlockerReady = $activity.Trim() -eq '1'
    if (-not $scopeRaceBlockerReady) { Start-Sleep -Milliseconds 50 }
  }
  if (-not $scopeRaceBlockerReady) { throw 'Stale-scope blocker never acquired the account lock.' }
  $scopeRaceClaimJob = Start-Job -ScriptBlock $worker -ArgumentList $scopeRaceClaimSql, $ContainerName, $TestDatabase
  $scopeRaceWaitObserved = $false
  for ($poll = 0; $poll -lt 50 -and -not $scopeRaceWaitObserved; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name = 'equora_claim_scope_race_waiter' and wait_event_type = 'Lock';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the stale-scope wait.' }
    $scopeRaceWaitObserved = $activity.Trim() -eq '1'
    if (-not $scopeRaceWaitObserved) { Start-Sleep -Milliseconds 50 }
  }
  if (-not $scopeRaceWaitObserved) { throw 'Claim never entered the expected account-lock wait.' }
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "update public.broker_sync_scopes set scope_completeness = 'failed', stability_status = 'invalidated', closed_at = clock_timestamp() where id = '$scopeId';" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to close the Scope during the observed claim wait.' }
  Wait-Job -Job $scopeRaceBlockerJob, $scopeRaceClaimJob | Out-Null
  $scopeRaceBlockerResult = Receive-Job -Job $scopeRaceBlockerJob
  $scopeRaceClaimResult = Receive-Job -Job $scopeRaceClaimJob
  Remove-Job -Job $scopeRaceBlockerJob, $scopeRaceClaimJob -Force
  if ($scopeRaceBlockerResult.ExitCode -ne 0 -or $scopeRaceClaimResult.ExitCode -eq 0 -or $scopeRaceClaimResult.Output -notmatch 'CONTROL_SCOPE_INVALID') {
    throw "Stale Scope was not rejected after the observed wait.`nBlocker: $($scopeRaceBlockerResult.Output)`nClaim: $($scopeRaceClaimResult.Output)"
  }
  & $assertUnclaimed 'Stale Scope race'
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "update public.broker_sync_scopes set scope_completeness = 'unverified', stability_status = 'not_observed', closed_at = null where id = '$scopeId';" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to restore the Scope after the stale-snapshot race.' }

  $keyBlockerSql = @"
\set ON_ERROR_STOP on
begin;
set application_name = 'equora_claim_key_expiry_blocker';
select id from public.broker_accounts where id = '$accountId' for update;
select pg_sleep(1.8);
commit;
"@
  $keyClaimSql = New-ClaimSql `
    -ApplicationName 'equora_claim_key_expiry_waiter' `
    -ClaimRequestId '83000000-0000-4000-8000-000000000001' `
    -LeaseToken '93000000-0000-4000-8000-000000000001'

  $keyBlockerJob = Start-Job -ScriptBlock $worker -ArgumentList $keyBlockerSql, $ContainerName, $TestDatabase
  $keyBlockerReady = $false
  for ($poll = 0; $poll -lt 50 -and -not $keyBlockerReady; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name = 'equora_claim_key_expiry_blocker' and query like '%pg_sleep%';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the claim integrity-key blocker.' }
    $keyBlockerReady = $activity.Trim() -eq '1'
    if (-not $keyBlockerReady) { Start-Sleep -Milliseconds 50 }
  }
  if (-not $keyBlockerReady) { throw 'Claim integrity-key blocker never acquired the account lock.' }

  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "update equora_private.broker_capture_integrity_keys set valid_to = clock_timestamp() + interval '1 second' where id = '$integrityKeyId';" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to arm the claim integrity-key expiry race.' }

  $keyClaimJob = Start-Job -ScriptBlock $worker -ArgumentList $keyClaimSql, $ContainerName, $TestDatabase
  $keyWaitObservedBeforeExpiry = $false
  for ($poll = 0; $poll -lt 50 -and -not $keyWaitObservedBeforeExpiry; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(distinct a.pid) from pg_stat_activity a join pg_locks l on l.pid = a.pid and not l.granted where a.application_name = 'equora_claim_key_expiry_waiter' and a.wait_event_type = 'Lock' and l.waitstart < (select valid_to from equora_private.broker_capture_integrity_keys where id = '$integrityKeyId');" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the claim integrity-key expiry wait.' }
    $keyWaitObservedBeforeExpiry = $activity.Trim() -eq '1'
    if (-not $keyWaitObservedBeforeExpiry) { Start-Sleep -Milliseconds 50 }
  }

  Wait-Job -Job $keyBlockerJob, $keyClaimJob | Out-Null
  $keyBlockerResult = Receive-Job -Job $keyBlockerJob
  $keyClaimResult = Receive-Job -Job $keyClaimJob
  Remove-Job -Job $keyBlockerJob, $keyClaimJob -Force
  if ($keyBlockerResult.ExitCode -ne 0 -or $keyClaimResult.ExitCode -eq 0 -or $keyClaimResult.Output -notmatch 'CONTROL_INTEGRITY_KEY_INACTIVE' -or -not $keyWaitObservedBeforeExpiry) {
    throw "Claim integrity-key expiry race did not fail closed.`nBlocker: $($keyBlockerResult.Output)`nClaim: $($keyClaimResult.Output)"
  }
  & $assertUnclaimed 'Claim integrity-key expiry race'

  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "update equora_private.broker_capture_integrity_keys set valid_to = null where id = '$integrityKeyId';" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to restore the claim integrity key.' }

  $timeoutBlockerSql = @"
\set ON_ERROR_STOP on
begin;
set application_name = 'equora_claim_timeout_blocker';
select id from public.broker_capture_work_units where id = '$workUnitId' for update;
select pg_sleep(3);
commit;
"@
  $timeoutClaimSql = New-ClaimSql `
    -ApplicationName 'equora_claim_timeout_waiter' `
    -ClaimRequestId '83000000-0000-4000-8000-000000000002' `
    -LeaseToken '93000000-0000-4000-8000-000000000002'
  $timeoutBlockerJob = Start-Job -ScriptBlock $worker -ArgumentList $timeoutBlockerSql, $ContainerName, $TestDatabase
  $timeoutBlockerReady = $false
  for ($poll = 0; $poll -lt 50 -and -not $timeoutBlockerReady; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name = 'equora_claim_timeout_blocker' and query like '%pg_sleep%';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the claim timeout blocker.' }
    $timeoutBlockerReady = $activity.Trim() -eq '1'
    if (-not $timeoutBlockerReady) { Start-Sleep -Milliseconds 50 }
  }
  if (-not $timeoutBlockerReady) { throw 'Claim timeout blocker never acquired the work-unit lock.' }

  $timeoutClaimJob = Start-Job -ScriptBlock $worker -ArgumentList $timeoutClaimSql, $ContainerName, $TestDatabase
  $timeoutWaitObserved = $false
  for ($poll = 0; $poll -lt 50 -and -not $timeoutWaitObserved; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name = 'equora_claim_timeout_waiter' and wait_event_type = 'Lock';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the claim timeout wait.' }
    $timeoutWaitObserved = $activity.Trim() -eq '1'
    if (-not $timeoutWaitObserved) { Start-Sleep -Milliseconds 50 }
  }

  Wait-Job -Job $timeoutBlockerJob, $timeoutClaimJob | Out-Null
  $timeoutBlockerResult = Receive-Job -Job $timeoutBlockerJob
  $timeoutClaimResult = Receive-Job -Job $timeoutClaimJob
  Remove-Job -Job $timeoutBlockerJob, $timeoutClaimJob -Force
  if ($timeoutBlockerResult.ExitCode -ne 0 -or $timeoutClaimResult.ExitCode -eq 0 -or $timeoutClaimResult.Output -notmatch 'CONTROL_LOCK_TIMEOUT' -or -not $timeoutWaitObserved) {
    throw "Claim lock-timeout path did not fail closed.`nBlocker: $($timeoutBlockerResult.Output)`nClaim: $($timeoutClaimResult.Output)"
  }
  & $assertUnclaimed 'Claim lock-timeout path'

  $claimRequestA = '83000000-0000-4000-8000-000000000003'
  $claimRequestB = '83000000-0000-4000-8000-000000000004'
  $leaseTokenA = '93000000-0000-4000-8000-000000000003'
  $leaseTokenB = '93000000-0000-4000-8000-000000000004'
  $claimA = New-ClaimSql -ApplicationName 'equora_claim_concurrency_A' -ClaimRequestId $claimRequestA -LeaseToken $leaseTokenA -PostClaimHoldSeconds '0.75'
  $claimB = New-ClaimSql -ApplicationName 'equora_claim_concurrency_B' -ClaimRequestId $claimRequestB -LeaseToken $leaseTokenB -PostClaimHoldSeconds '0.75'

  $jobA = Start-Job -ScriptBlock $worker -ArgumentList $claimA, $ContainerName, $TestDatabase
  $jobB = Start-Job -ScriptBlock $worker -ArgumentList $claimB, $ContainerName, $TestDatabase
  $overlapObserved = $false
  for ($poll = 0; $poll -lt 100 -and -not $overlapObserved; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*), count(*) filter (where wait_event_type = 'Lock') from pg_stat_activity where application_name like 'equora_claim_concurrency_%';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect claim concurrency activity.' }
    if ($activity.Trim() -match '^(\d+)\|(\d+)$') {
      $overlapObserved = [int]$Matches[1] -ge 2 -and [int]$Matches[2] -ge 1
    }
    if (-not $overlapObserved) { Start-Sleep -Milliseconds 50 }
  }

  Wait-Job -Job $jobA, $jobB | Out-Null
  $resultA = Receive-Job -Job $jobA
  $resultB = Receive-Job -Job $jobB
  Remove-Job -Job $jobA, $jobB -Force
  $results = @($resultA, $resultB)
  $successes = @($results | Where-Object { $_.ExitCode -eq 0 })
  $casLosers = @($results | Where-Object { $_.ExitCode -ne 0 -and $_.Output -match 'CONTROL_WORK_UNIT_CAS_MISMATCH' })
  if ($successes.Count -ne 1 -or $casLosers.Count -ne 1 -or -not $overlapObserved) {
    throw "Expected one atomic claim and one CAS rejection with an observed lock wait.`nA: $($resultA.Output)`nB: $($resultB.Output)"
  }

  $winnerRequest = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select last_claim_request_id from public.broker_capture_work_units where id = '$workUnitId';").Trim()
  if ($LASTEXITCODE -ne 0 -or $winnerRequest -notin @($claimRequestA, $claimRequestB)) {
    throw "Could not resolve the winning claim request: $winnerRequest"
  }
  $winnerLease = if ($winnerRequest -eq $claimRequestA) { $leaseTokenA } else { $leaseTokenB }
  $replaySql = New-ClaimSql -ApplicationName 'equora_claim_replay' -ClaimRequestId $winnerRequest -LeaseToken $winnerLease
  $replayResult = & $worker $replaySql $ContainerName $TestDatabase
  if ($replayResult.ExitCode -ne 0 -or $replayResult.Output -notmatch '"workUnitRowVersion": 1') {
    throw "Exact claim replay was not idempotent: $($replayResult.Output)"
  }

  $wrongReplaySql = New-ClaimSql -ApplicationName 'equora_claim_replay_mismatch' -ClaimRequestId $winnerRequest -LeaseToken '93000000-0000-4000-8000-000000000099'
  $wrongReplayResult = & $worker $wrongReplaySql $ContainerName $TestDatabase
  if ($wrongReplayResult.ExitCode -eq 0 -or $wrongReplayResult.Output -notmatch 'CONTROL_CLAIM_REPLAY_MISMATCH') {
    throw "Mismatched claim replay was not rejected: $($wrongReplayResult.Output)"
  }

  $finalSql = @"
select
  (select status from public.broker_capture_work_units where id = '$workUnitId'),
  (select row_version from public.broker_capture_work_units where id = '$workUnitId'),
  (select attempt from public.broker_capture_work_units where id = '$workUnitId'),
  (select claim_count from public.broker_capture_work_units where id = '$workUnitId'),
  (select lease_token_digest ~ '^[a-f0-9]{64}$' from public.broker_capture_work_units where id = '$workUnitId'),
  (select status from public.broker_capture_runs where id = '$runId'),
  (select started_at is not null from public.broker_capture_runs where id = '$runId'),
  (select scope_completeness from public.broker_sync_scopes where id = '$scopeId'),
  (select closed_at is null from public.broker_sync_scopes where id = '$scopeId'),
  (select count(*) from public.broker_capture_attempt_outcomes where work_unit_id = '$workUnitId');
"@
  $finalState = $finalSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0 -or $finalState.Trim() -ne 'leased|1|1|1|t|running|t|unverified|t|0') {
    throw "Unexpected final claim-concurrency state: $finalState"
  }

  Write-Host 'PASS: future activation/connection validity and a Scope closed during an observed claim wait were rejected with no partial state.'
  Write-Host 'PASS: an integrity key expiring during an observed late account-lock wait rejected the claim with no partial state.'
  Write-Host 'PASS: the claim RPC lock timeout rejected a blocked work unit with no partial state.'
  Write-Host 'PASS: two overlapping claims produced exactly one lease and one CAS rejection; exact replay was idempotent and token mismatch failed closed.'
}
finally {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
}
