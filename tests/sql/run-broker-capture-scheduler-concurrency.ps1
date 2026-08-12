param(
  [string]$ContainerName = 'equora-v5761-pgtest',
  [string]$TemplateDatabase = 'equora_remediation',
  [string]$TestDatabase = 'equora_capture_scheduler_concurrency_v5761'
)

$ErrorActionPreference = 'Stop'

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TemplateDatabase -notmatch '^equora_[a-z0-9_]+$') {
  throw 'TemplateDatabase must be an explicitly named Equora test database.'
}
if ($TestDatabase -notmatch '^equora_capture_scheduler_concurrency_[a-z0-9_]+$') {
  throw 'TestDatabase must use the equora_capture_scheduler_concurrency_ prefix.'
}

$fixturePath = Join-Path $PSScriptRoot 'broker-capture-persistence.integration.sql'
$schedulerMigrationPath = Join-Path $PSScriptRoot '..\..\supabase\schema-patch-v57.61.0-g1-scheduler-control.sql'
$fixture = Get-Content -Raw -LiteralPath $fixturePath
$schedulerMigrationSql = Get-Content -Raw -LiteralPath $schedulerMigrationPath
$setupMarker = '-- EQUORA_SCHEDULER_CONTROL_SETUP_END'
$setupEnd = $fixture.IndexOf($setupMarker, [StringComparison]::Ordinal)
if ($setupEnd -lt 0) {
  throw 'The integration fixture no longer exposes the scheduler setup boundary.'
}
$setupSql = $fixture.Substring(0, $setupEnd) + "`ncommit;`n"

$worker = {
  param($SqlText, $DockerContainer, $Database)
  $ErrorActionPreference = 'Continue'
  $output = $SqlText | & docker exec -i $DockerContainer psql -U postgres -d $Database -v ON_ERROR_STOP=1 2>&1
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
    throw "Local scheduler-concurrency SQL failed: $($output -join [Environment]::NewLine)"
  }
}

function Reset-FixtureOwnerMembership {
  $sql = @'
do $$
begin
  if exists (
    select 1 from pg_auth_members membership
    where membership.roleid = to_regrole('equora_broker_capture_owner')
      and membership.member = to_regrole('postgres')
  ) then
    execute 'revoke equora_broker_capture_owner from postgres';
  end if;
end;
$$;
'@
  $ErrorActionPreference = 'Continue'
  $output = & docker exec $ContainerName psql -U postgres -d postgres `
    -v ON_ERROR_STOP=1 -c $sql 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($exitCode -ne 0) {
    throw "Failed to clear test-only owner membership: $($output -join [Environment]::NewLine)"
  }
}

try {
  Reset-FixtureOwnerMembership
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to remove the prior scheduler-concurrency database.' }
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "create database $TestDatabase template $TemplateDatabase;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create the isolated scheduler-concurrency database.' }

  Invoke-SqlPipe -SqlText $schedulerMigrationSql
  # A legacy scheduler-only template may not contain the downstream Runtime
  # enrollment table; a current full-stack template already does. Supply the
  # exact scheduler-visible shape only when absent so the race oracle works for
  # both disposable template types without weakening a deployed definition.
  Invoke-SqlPipe -SqlText @'
grant equora_broker_capture_owner to postgres with inherit false, set true;
grant usage, create on schema equora_private to equora_broker_capture_owner;
set role equora_broker_capture_owner;
create table if not exists equora_private.broker_capture_runtime_enrollment (
  singleton_key boolean primary key,
  user_id uuid not null,
  provider_code text not null,
  broker_account_id uuid,
  max_accounts integer not null,
  max_symbols integer not null,
  enabled boolean not null,
  enrolled_at timestamptz not null,
  updated_at timestamptz not null
);
grant select, update on table equora_private.broker_capture_runtime_enrollment
  to equora_broker_capture_owner;
grant select, update on table equora_private.broker_capture_runtime_enrollment
  to postgres;
reset role;
revoke create on schema equora_private from equora_broker_capture_owner;
'@
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "alter table auth.users add column if not exists email text, add column if not exists created_at timestamptz, add column if not exists updated_at timestamptz;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare the disposable auth.users fixture shape.' }
  Invoke-SqlPipe -SqlText $setupSql

  Invoke-SqlPipe -SqlText @'
set role equora_broker_capture_owner;
insert into equora_private.broker_capture_runtime_enrollment (
  singleton_key, user_id, provider_code, broker_account_id, max_accounts,
  max_symbols, enabled, enrolled_at, updated_at
)
select true, account.user_id, account.provider_code, account.id, 1, 5, true,
  clock_timestamp(), clock_timestamp()
from public.broker_accounts account
where account.id = '14c6b264-99b8-4c74-a882-135b88e9d100';
reset role;
revoke equora_broker_capture_owner from postgres;
'@

  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "update public.broker_accounts set status='active',retention_status='active' where id='14c6b264-99b8-4c74-a882-135b88e9d100'; update public.broker_sync_lane_states set next_due_at=clock_timestamp()-interval '1 second' where id='26000000-0000-4000-8000-000000000012';" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to arm the materializer concurrency fixture.' }

  $materializeSql = @"
\set ON_ERROR_STOP on
begin;
set role service_role;
select public.equora_materialize_next_due_broker_capture_v1(
  'c1000000-0000-4000-8000-000000000001', 'broker-capture-schedule-v1'
);
select pg_sleep(0.6);
commit;
"@
  $materializeJobA = Start-Job -ScriptBlock $worker -ArgumentList $materializeSql, $ContainerName, $TestDatabase
  $materializeJobB = Start-Job -ScriptBlock $worker -ArgumentList $materializeSql, $ContainerName, $TestDatabase
  Wait-Job -Job $materializeJobA, $materializeJobB | Out-Null
  $materializeA = Receive-Job -Job $materializeJobA
  $materializeB = Receive-Job -Job $materializeJobB
  Remove-Job -Job $materializeJobA, $materializeJobB -Force
  if ($materializeA.ExitCode -ne 0 -or $materializeB.ExitCode -ne 0) {
    throw "Concurrent exact materialization replay failed.`nA: $($materializeA.Output)`nB: $($materializeB.Output)"
  }
  $materializedState = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select (select count(*) from public.broker_capture_materialization_commands where request_id='c1000000-0000-4000-8000-000000000001'),(select count(*) from public.broker_capture_schedule_occurrences),(select count(*) from public.broker_capture_runs),(select count(*) from public.broker_capture_work_units);").Trim()
  if ($LASTEXITCODE -ne 0 -or $materializedState -ne '1|1|1|1') {
    throw "Concurrent materialization was not append-once: $materializedState"
  }

  $secondMaterializeSql = @"
update public.broker_sync_lane_states
set next_due_at=clock_timestamp()-interval '1 second'
where id='26000000-0000-4000-8000-000000000013';
set role service_role;
select public.equora_materialize_next_due_broker_capture_v1(
  'c1000000-0000-4000-8000-000000000002', 'broker-capture-schedule-v1'
);
reset role;
"@
  Invoke-SqlPipe -SqlText $secondMaterializeSql

  $workUnits = @(& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select work_unit_id from public.broker_capture_schedule_occurrences order by lane_state_id;")
  if ($LASTEXITCODE -ne 0 -or $workUnits.Count -ne 2) {
    throw "Could not resolve both scheduler Work Units: $($workUnits -join ',')"
  }
  $workUnitA = $workUnits[0].Trim()
  $workUnitB = $workUnits[1].Trim()
  $claimSqlA = @"
\set ON_ERROR_STOP on
begin;
set role service_role;
select public.equora_claim_broker_capture_work_unit_v2(
  '$workUnitA', 0, 'c2000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001', 'broker-capture-claim-v1'
);
select pg_sleep(0.6);
commit;
"@
  $claimSqlB = @"
\set ON_ERROR_STOP on
begin;
set role service_role;
select public.equora_claim_broker_capture_work_unit_v2(
  '$workUnitB', 0, 'c2000000-0000-4000-8000-000000000002',
  'c3000000-0000-4000-8000-000000000002', 'broker-capture-claim-v1'
);
select pg_sleep(0.6);
commit;
"@
  $claimJobA = Start-Job -ScriptBlock $worker -ArgumentList $claimSqlA, $ContainerName, $TestDatabase
  $claimJobB = Start-Job -ScriptBlock $worker -ArgumentList $claimSqlB, $ContainerName, $TestDatabase
  Wait-Job -Job $claimJobA, $claimJobB | Out-Null
  $claimA = Receive-Job -Job $claimJobA
  $claimB = Receive-Job -Job $claimJobB
  Remove-Job -Job $claimJobA, $claimJobB -Force
  $claimResults = @($claimA, $claimB)
  $claimWinners = @($claimResults | Where-Object { $_.ExitCode -eq 0 })
  $busyLosers = @($claimResults | Where-Object {
    $_.ExitCode -ne 0 -and $_.Output -match 'CONTROL_ACCOUNT_LEASE_BUSY'
  })
  if ($claimWinners.Count -ne 1 -or $busyLosers.Count -ne 1) {
    throw "Account/sync-kind Lease did not elect exactly one claimant.`nA: $($claimA.Output)`nB: $($claimB.Output)"
  }

  $leaseState = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select (select count(*) from public.broker_capture_work_units where status='leased' and row_version=1),(select count(*) from public.broker_capture_work_units where status='pending' and row_version=0),(select count(*) from public.broker_capture_account_leases where state='leased' and work_unit_id is not null and work_unit_row_version=1 and lease_epoch=1);").Trim()
  if ($LASTEXITCODE -ne 0 -or $leaseState -ne '1|1|1') {
    throw "Account/sync-kind Lease race left an invalid final state: $leaseState"
  }

  $leasedWorkUnit = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select id from public.broker_capture_work_units where status='leased';").Trim()
  if ($LASTEXITCODE -ne 0 -or $leasedWorkUnit -notmatch '^[a-f0-9-]{36}$') {
    throw "Could not resolve the Lease winner: $leasedWorkUnit"
  }
  $leaseToken = if ($leasedWorkUnit -eq $workUnitA) {
    'c3000000-0000-4000-8000-000000000001'
  } else {
    'c3000000-0000-4000-8000-000000000002'
  }
  $pendingWorkUnit = if ($leasedWorkUnit -eq $workUnitA) { $workUnitB } else { $workUnitA }

  $renewSql = @"
\set ON_ERROR_STOP on
begin;
set role service_role;
select public.equora_renew_broker_capture_lease_v1(
  '$leasedWorkUnit', 1, '$leaseToken',
  'c4000000-0000-4000-8000-000000000001', 'lease-control-v1'
);
select pg_sleep(0.6);
commit;
"@
  $renewJobA = Start-Job -ScriptBlock $worker -ArgumentList $renewSql, $ContainerName, $TestDatabase
  $renewJobB = Start-Job -ScriptBlock $worker -ArgumentList $renewSql, $ContainerName, $TestDatabase
  Wait-Job -Job $renewJobA, $renewJobB | Out-Null
  $renewA = Receive-Job -Job $renewJobA
  $renewB = Receive-Job -Job $renewJobB
  Remove-Job -Job $renewJobA, $renewJobB -Force
  if ($renewA.ExitCode -ne 0 -or $renewB.ExitCode -ne 0) {
    throw "Concurrent exact Renew replay failed.`nA: $($renewA.Output)`nB: $($renewB.Output)"
  }
  $renewState = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select (select row_version from public.broker_capture_work_units where id='$leasedWorkUnit'),(select work_unit_row_version from public.broker_capture_account_leases where state='leased'),(select count(*) from public.broker_capture_lease_events where work_unit_id='$leasedWorkUnit' and event_kind='renew');").Trim()
  if ($LASTEXITCODE -ne 0 -or $renewState -ne '2|2|1') {
    throw "Concurrent Renew was not an exact single effect: $renewState"
  }

  $releaseSql = @"
\set ON_ERROR_STOP on
begin;
set role service_role;
select public.equora_release_broker_capture_lease_v1(
  '$leasedWorkUnit', 2, '$leaseToken',
  'c5000000-0000-4000-8000-000000000001',
  'cooperative_shutdown', 'lease-control-v1'
);
select pg_sleep(0.6);
commit;
"@
  $releaseJobA = Start-Job -ScriptBlock $worker -ArgumentList $releaseSql, $ContainerName, $TestDatabase
  $releaseJobB = Start-Job -ScriptBlock $worker -ArgumentList $releaseSql, $ContainerName, $TestDatabase
  Wait-Job -Job $releaseJobA, $releaseJobB | Out-Null
  $releaseA = Receive-Job -Job $releaseJobA
  $releaseB = Receive-Job -Job $releaseJobB
  Remove-Job -Job $releaseJobA, $releaseJobB -Force
  if ($releaseA.ExitCode -ne 0 -or $releaseB.ExitCode -ne 0) {
    throw "Concurrent exact Release replay failed.`nA: $($releaseA.Output)`nB: $($releaseB.Output)"
  }
  $releaseState = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select (select status||'|'||row_version from public.broker_capture_work_units where id='$leasedWorkUnit'),(select state from public.broker_capture_account_leases),(select count(*) from public.broker_capture_lease_events where work_unit_id='$leasedWorkUnit' and event_kind='release');").Trim()
  if ($LASTEXITCODE -ne 0 -or $releaseState -ne 'pending|3|available|1') {
    throw "Concurrent Release was not an exact single effect: $releaseState"
  }

  $yieldFixtureSql = @"
with checkpoint_payload as (
  select work_unit.id,
    (work_unit.checkpoint - 'checkpointMac') || jsonb_build_object(
      'status', 'yielded', 'reason', 'work_unit_budget_reached'
    ) as payload,
    integrity_key.key_material
  from public.broker_capture_work_units work_unit
  join public.broker_sync_activations activation
    on activation.id = work_unit.sync_activation_id
  join equora_private.broker_capture_integrity_keys integrity_key
    on integrity_key.id = activation.capture_integrity_key_id
   and integrity_key.key_version = activation.capture_integrity_key_version
  where work_unit.id = '$pendingWorkUnit'
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
from signed_checkpoint signed where work_unit.id = signed.id;
"@
  Invoke-SqlPipe -SqlText $yieldFixtureSql

  # True two-session Disable-vs-Continuation race. The operator transaction
  # wins the singleton Enrollment lock first and holds it briefly. Continuation
  # must wait in the canonical Provider -> Enrollment -> Scope/Lane order, then
  # observe the committed disable and leave predecessor, successor and receipt
  # state unchanged. A timeout/deadlock is not an acceptable substitute.
  $disableEnrollmentSql = @"
\set ON_ERROR_STOP on
set application_name = 'equora_scheduler_enrollment_disable';
begin;
update equora_private.broker_capture_runtime_enrollment
set enabled = false, updated_at = clock_timestamp()
where singleton_key is true;
select pg_sleep(0.8);
commit;
"@
  $disableFirstContinuationSql = @"
\set ON_ERROR_STOP on
set application_name = 'equora_scheduler_continuation_waiter';
begin;
set role service_role;
select public.equora_continue_yielded_broker_capture_work_unit_v1(
  '$pendingWorkUnit', 0,
  'c5f00000-0000-4000-8000-000000000001', 'lease-control-v1'
);
commit;
"@
  $disableEnrollmentJob = Start-Job -ScriptBlock $worker `
    -ArgumentList $disableEnrollmentSql, $ContainerName, $TestDatabase
  $disableEnrollmentLockObserved = $false
  for ($poll = 0; $poll -lt 50 -and -not $disableEnrollmentLockObserved; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase `
      -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name='equora_scheduler_enrollment_disable' and query like '%pg_sleep%';" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect Enrollment disable lock holder.' }
    $disableEnrollmentLockObserved = $activity.Trim() -eq '1'
    if (-not $disableEnrollmentLockObserved) { Start-Sleep -Milliseconds 50 }
  }
  if (-not $disableEnrollmentLockObserved) {
    throw 'Enrollment disable session never reached the lock-holding phase.'
  }
  $disableFirstContinuationJob = Start-Job -ScriptBlock $worker `
    -ArgumentList $disableFirstContinuationSql, $ContainerName, $TestDatabase
  $disableContinuationWaitObserved = $false
  for ($poll = 0; $poll -lt 50 -and -not $disableContinuationWaitObserved; $poll += 1) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase `
      -At -v ON_ERROR_STOP=1 -c "select count(distinct activity.pid) from pg_stat_activity activity join pg_locks lock_row on lock_row.pid=activity.pid and not lock_row.granted where activity.application_name='equora_scheduler_continuation_waiter' and activity.wait_event_type='Lock' and lock_row.waitstart is not null;" 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to inspect Continuation Enrollment-lock wait.' }
    $disableContinuationWaitObserved = $activity.Trim() -eq '1'
    if (-not $disableContinuationWaitObserved) { Start-Sleep -Milliseconds 50 }
  }
  if (-not $disableContinuationWaitObserved) {
    throw 'Continuation was not observed waiting on the Enrollment lock.'
  }
  Wait-Job -Job $disableEnrollmentJob, $disableFirstContinuationJob | Out-Null
  $disableEnrollmentResult = Receive-Job -Job $disableEnrollmentJob
  $disableFirstContinuationResult = Receive-Job -Job $disableFirstContinuationJob
  Remove-Job -Job $disableEnrollmentJob, $disableFirstContinuationJob -Force
  if ($disableEnrollmentResult.ExitCode -ne 0) {
    throw "Enrollment disable winner failed: $($disableEnrollmentResult.Output)"
  }
  if (
    $disableFirstContinuationResult.ExitCode -eq 0 `
      -or $disableFirstContinuationResult.Output -notmatch 'CONTINUATION_AUTHORITY_BLOCKED'
  ) {
    throw "Disable-first Continuation did not fail closed: $($disableFirstContinuationResult.Output)"
  }
  $disableContinuationState = (& docker exec $ContainerName psql -U postgres `
    -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select (select enabled from equora_private.broker_capture_runtime_enrollment where singleton_key is true),(select row_version from public.broker_capture_work_units where id='$pendingWorkUnit'),(select count(*) from public.broker_capture_work_units where predecessor_work_unit_id='$pendingWorkUnit'),(select count(*) from public.broker_capture_lease_events where work_unit_id='$pendingWorkUnit' and event_kind='yield_continuation');").Trim()
  if ($LASTEXITCODE -ne 0 -or $disableContinuationState -ne 'f|0|0|0') {
    throw "Disable-first Continuation left a partial effect: $disableContinuationState"
  }
  Invoke-SqlPipe -SqlText @'
update equora_private.broker_capture_runtime_enrollment
set enabled = true, updated_at = clock_timestamp()
where singleton_key is true;
'@

  $continuationSql = @"
\set ON_ERROR_STOP on
begin;
set role service_role;
select public.equora_continue_yielded_broker_capture_work_unit_v1(
  '$pendingWorkUnit', 0,
  'c6000000-0000-4000-8000-000000000001', 'lease-control-v1'
);
select pg_sleep(0.6);
commit;
"@
  $continuationJobA = Start-Job -ScriptBlock $worker -ArgumentList $continuationSql, $ContainerName, $TestDatabase
  $continuationJobB = Start-Job -ScriptBlock $worker -ArgumentList $continuationSql, $ContainerName, $TestDatabase
  Wait-Job -Job $continuationJobA, $continuationJobB | Out-Null
  $continuationA = Receive-Job -Job $continuationJobA
  $continuationB = Receive-Job -Job $continuationJobB
  Remove-Job -Job $continuationJobA, $continuationJobB -Force
  if ($continuationA.ExitCode -ne 0 -or $continuationB.ExitCode -ne 0) {
    throw "Concurrent exact Continuation replay failed.`nA: $($continuationA.Output)`nB: $($continuationB.Output)"
  }
  $continuationState = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select (select row_version from public.broker_capture_work_units where id='$pendingWorkUnit'),(select count(*) from public.broker_capture_work_units where predecessor_work_unit_id='$pendingWorkUnit'),(select count(*) from public.broker_capture_lease_events where work_unit_id='$pendingWorkUnit' and event_kind='yield_continuation');").Trim()
  if ($LASTEXITCODE -ne 0 -or $continuationState -ne '1|1|1') {
    throw "Concurrent Continuation was not an exact single effect: $continuationState"
  }

  $recoverySetupSql = @"
set role service_role;
select public.equora_claim_broker_capture_work_unit_v2(
  '$leasedWorkUnit', 3,
  'c7000000-0000-4000-8000-000000000001',
  'c8000000-0000-4000-8000-000000000001', 'broker-capture-claim-v1'
);
reset role;
update public.broker_capture_work_units
set lease_expires_at = lease_acquired_at + interval '1 millisecond'
where id = '$leasedWorkUnit';
update public.broker_capture_account_leases slot
set lease_expires_at = work_unit.lease_expires_at
from public.broker_capture_work_units work_unit
where work_unit.id = '$leasedWorkUnit'
  and slot.broker_account_id = work_unit.broker_account_id
  and slot.sync_kind = 'provider_api_observation';
"@
  Invoke-SqlPipe -SqlText $recoverySetupSql

  $recoverySql = @"
\set ON_ERROR_STOP on
begin;
set role service_role;
select public.equora_recover_expired_broker_capture_leases_v1(
  'c9000000-0000-4000-8000-000000000001', 10, 'lease-control-v1'
);
select pg_sleep(0.6);
commit;
"@
  $recoveryJobA = Start-Job -ScriptBlock $worker -ArgumentList $recoverySql, $ContainerName, $TestDatabase
  $recoveryJobB = Start-Job -ScriptBlock $worker -ArgumentList $recoverySql, $ContainerName, $TestDatabase
  Wait-Job -Job $recoveryJobA, $recoveryJobB | Out-Null
  $recoveryA = Receive-Job -Job $recoveryJobA
  $recoveryB = Receive-Job -Job $recoveryJobB
  Remove-Job -Job $recoveryJobA, $recoveryJobB -Force
  if ($recoveryA.ExitCode -ne 0 -or $recoveryB.ExitCode -ne 0) {
    throw "Concurrent exact Recovery replay failed.`nA: $($recoveryA.Output)`nB: $($recoveryB.Output)"
  }
  $recoveryState = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select (select status||'|'||row_version from public.broker_capture_work_units where id='$leasedWorkUnit'),(select state from public.broker_capture_account_leases),(select count(*) from public.broker_capture_recovery_commands where request_id='c9000000-0000-4000-8000-000000000001'),(select count(*) from public.broker_capture_lease_events where work_unit_id='$leasedWorkUnit' and event_kind='expired_recovery');").Trim()
  if ($LASTEXITCODE -ne 0 -or $recoveryState -ne 'pending|5|available|1|1') {
    throw "Concurrent Recovery was not an exact single effect: $recoveryState"
  }

  Write-Output 'Broker capture scheduler concurrency passed.'
}
finally {
  Reset-FixtureOwnerMembership
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
}
