param(
  [string]$ContainerName = 'equora-v5761-pgtest',
  [string]$TemplateDatabase = 'equora_remediation',
  [string]$TestDatabase = 'equora_capture_failure_concurrency_v5761'
)

$ErrorActionPreference = 'Stop'

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TemplateDatabase -notmatch '^equora_[a-z0-9_]+$') {
  throw 'TemplateDatabase must be an explicitly named Equora test database.'
}
if ($TestDatabase -notmatch '^equora_capture_failure_concurrency_[a-z0-9_]+$') {
  throw 'TestDatabase must use the equora_capture_failure_concurrency_ prefix.'
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
$claimRequestId = '85000000-0000-4000-8000-000000000001'
$leaseToken = '95000000-0000-4000-8000-000000000001'
$outcomeId = '86000000-0000-4000-8000-000000000001'
$capabilityId = 'historical_orders_v1'
$pageScopeDigest = '20312b1ad761af60427439f96991429d4b508fb871815ad850a64e0a9e2f947d'

$worker = {
  param($SqlText, $DockerContainer, $Database)
  $ErrorActionPreference = 'Continue'
  $output = $SqlText | & docker exec -i $DockerContainer psql -U postgres -d $Database 2>&1
  [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = ($output -join [Environment]::NewLine)
  }
}

try {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to remove the prior failure-concurrency database.' }
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "create database $TestDatabase template $TemplateDatabase;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create the isolated failure-concurrency database.' }

  # Test-only access to the fenced v1 implementation verifies its atomic core;
  # production/runtime grants remain revoked and v2 fence tests run separately.
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "grant execute on function public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text), public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text) to service_role;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to grant the test-only v1 claim/failure RPCs.' }

  $setupOutput = $setupSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Failure-concurrency fixture setup failed: $($setupOutput -join [Environment]::NewLine)"
  }

  $claimSql = @"
\set ON_ERROR_STOP on
begin;
set role service_role;
select public.equora_claim_broker_capture_work_unit_v1(
  '$workUnitId',
  0,
  '$claimRequestId',
  '$leaseToken',
  'broker-capture-claim-v1'
);
commit;
"@
  $claimResult = & $worker $claimSql $ContainerName $TestDatabase
  if ($claimResult.ExitCode -ne 0) {
    throw "Failed to establish the failure-race lease: $($claimResult.Output)"
  }
  $checkpointMac = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select checkpoint_mac from public.broker_capture_work_units where id = '$workUnitId';").Trim()
  if ($LASTEXITCODE -ne 0 -or $checkpointMac -notmatch '^[a-f0-9]{64}$') {
    throw "Could not read the claimed checkpoint MAC: $checkpointMac"
  }

  $scopeBlockerSql = @"
\set ON_ERROR_STOP on
begin;
set application_name = 'equora_failure_scope_expiry_blocker';
select id from public.broker_sync_scopes where id = '$scopeId' for update;
select pg_sleep(1.8);
commit;
"@
  $scopeBlockerJob = Start-Job -ScriptBlock $worker -ArgumentList $scopeBlockerSql, $ContainerName, $TestDatabase
  $scopeBlockerReady = $false
  for ($poll = 0; $poll -lt 50 -and -not $scopeBlockerReady; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name = 'equora_failure_scope_expiry_blocker' and query like '%pg_sleep%';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the failure Scope blocker.' }
    $scopeBlockerReady = $activity.Trim() -eq '1'
    if (-not $scopeBlockerReady) { Start-Sleep -Milliseconds 50 }
  }
  if (-not $scopeBlockerReady) { throw 'Failure Scope blocker never acquired the row lock.' }

  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "update public.broker_capture_work_units set lease_expires_at = clock_timestamp() + interval '1 second' where id = '$workUnitId';" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to arm the failure lease-expiry race.' }

  $failureSql = @"
\set ON_ERROR_STOP on
begin;
set application_name = 'equora_failure_scope_expiry_waiter';
set role service_role;
select public.equora_record_broker_capture_failure_v1(
  '$workUnitId',
  1,
  '$outcomeId',
  '$leaseToken',
  1,
  '$checkpointMac',
  '$capabilityId',
  '$pageScopeDigest',
  'rate_limited',
  429,
  128,
  10,
  'broker-capture-failure-policy-v1'
);
commit;
"@
  $failureJob = Start-Job -ScriptBlock $worker -ArgumentList $failureSql, $ContainerName, $TestDatabase
  $waitObservedBeforeExpiry = $false
  for ($poll = 0; $poll -lt 50 -and -not $waitObservedBeforeExpiry; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select count(distinct a.pid) from pg_stat_activity a join pg_locks l on l.pid = a.pid and not l.granted where a.application_name = 'equora_failure_scope_expiry_waiter' and a.wait_event_type = 'Lock' and l.waitstart < (select lease_expires_at from public.broker_capture_work_units where id = '$workUnitId');" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect the failure Scope wait.' }
    $waitObservedBeforeExpiry = $activity.Trim() -eq '1'
    if (-not $waitObservedBeforeExpiry) { Start-Sleep -Milliseconds 50 }
  }

  Wait-Job -Job $scopeBlockerJob, $failureJob | Out-Null
  $scopeBlockerResult = Receive-Job -Job $scopeBlockerJob
  $failureResult = Receive-Job -Job $failureJob
  Remove-Job -Job $scopeBlockerJob, $failureJob -Force
  if ($scopeBlockerResult.ExitCode -ne 0 -or $failureResult.ExitCode -eq 0 -or $failureResult.Output -notmatch 'CONTROL_LEASE_INVALID' -or -not $waitObservedBeforeExpiry) {
    throw "Failure lease-expiry race did not fail closed.`nBlocker: $($scopeBlockerResult.Output)`nFailure: $($failureResult.Output)"
  }

  $stateSql = @"
select
  (select status from public.broker_capture_work_units where id = '$workUnitId'),
  (select row_version from public.broker_capture_work_units where id = '$workUnitId'),
  (select attempt from public.broker_capture_work_units where id = '$workUnitId'),
  (select request_sequence from public.broker_capture_work_units where id = '$workUnitId'),
  (select lease_token_digest is not null from public.broker_capture_work_units where id = '$workUnitId'),
  (select status from public.broker_capture_runs where id = '$runId'),
  (select failed_request_count from public.broker_capture_runs where id = '$runId'),
  (select scope_completeness from public.broker_sync_scopes where id = '$scopeId'),
  (select closed_at is null from public.broker_sync_scopes where id = '$scopeId'),
  (select count(*) from public.broker_capture_attempt_outcomes where work_unit_id = '$workUnitId');
"@
  $state = $stateSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0 -or $state.Trim() -ne 'leased|1|1|0|t|running|0|unverified|t|0') {
    throw "Failure lease-expiry race left partial state: $state"
  }

  Write-Host 'PASS: a failure waiting on the final Scope lock was rolled back after lease expiry; Work Unit, Run, Scope and outcome remained unchanged.'
}
finally {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
}
