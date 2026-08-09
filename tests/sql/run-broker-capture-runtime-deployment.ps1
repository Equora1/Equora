param(
  [string]$ContainerName = 'equora-v5761-scheduler-pgtest',
  [string]$TemplateDatabase = 'equora_full_deployment_runtime_template',
  [string]$TestDatabase = 'equora_runtime_deployment_v5761',
  [switch]$KeepDatabase
)

$ErrorActionPreference = 'Stop'

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TemplateDatabase -notmatch '^equora_[a-z0-9_]+$') {
  throw 'TemplateDatabase must be an explicitly named Equora test database.'
}
if ($TestDatabase -notmatch '^equora_runtime_deployment_[a-z0-9_]+$') {
  throw 'TestDatabase must use the equora_runtime_deployment_ prefix.'
}

$migrationPath = Join-Path $PSScriptRoot '..\..\supabase\schema-patch-v57.61.0-g1-runtime-deployment.sql'
$fullDeploymentRunner = Join-Path $PSScriptRoot 'run-v57.61.0-deployment.ps1'
$testPath = Join-Path $PSScriptRoot 'broker-capture-runtime-deployment.integration.sql'
$postflightPath = Join-Path $PSScriptRoot 'broker-capture-runtime-deployment-postflight.integration.sql'
$migrationSql = Get-Content -Raw -Encoding utf8 -LiteralPath $migrationPath
$testSql = Get-Content -Raw -Encoding utf8 -LiteralPath $testPath
$postflightSql = Get-Content -Raw -Encoding utf8 -LiteralPath $postflightPath
$claimRaceMarker = '-- EQUORA_RUNTIME_ENROLLMENT_CLAIM_RACE_SETUP_END'
$claimRaceSetupEnd = $testSql.IndexOf($claimRaceMarker, [StringComparison]::Ordinal)
if ($claimRaceSetupEnd -lt 0) {
  throw 'Runtime integration no longer exposes the enrollment Claim-race setup boundary.'
}
$claimRaceSetupSql = $testSql.Substring(0, $claimRaceSetupEnd) + "`ncommit;`n"

try {
  & $fullDeploymentRunner -ContainerName $ContainerName `
    -TestDatabase $TemplateDatabase -KeepDatabase
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create the current full-stack runtime template.' }

  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to remove the prior runtime-deployment database.' }
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "create database $TestDatabase template $TemplateDatabase;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create the isolated runtime-deployment database.' }

  $ErrorActionPreference = 'Continue'
  $migrationOutput = $migrationSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  $migrationExitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($migrationExitCode -ne 0) { throw "Runtime-deployment migration failed: $($migrationOutput -join [Environment]::NewLine)" }

  # The Supabase test image deliberately leaves the migration executor without
  # inherited authority-owner rights. Enable that membership only while the
  # disposable fixture seeds/inspects owner-protected rows, then revoke it
  # before the production migration/postflight is re-run.
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 `
    -c "grant equora_broker_capture_owner to postgres with inherit true, set true;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to install disposable runtime fixture owner membership.' }

  # Two simultaneous first-time setup requests serialize on the singleton
  # enrollment. Exactly one secret-free command may reserve the external probe
  # slot; the loser fails before any application-side broker GET is possible.
  $concurrencyUserId = '80000000-0000-4000-8000-000000000008'
  $seedSql = @"
insert into auth.users (id) values ('$concurrencyUserId') on conflict (id) do nothing;
insert into equora_private.broker_capture_runtime_enrollment (
  singleton_key, user_id, provider_code, max_accounts, max_symbols,
  enabled, enrolled_at, updated_at
) values (
  true, '$concurrencyUserId', 'mexc', 1, 5,
  true, clock_timestamp(), clock_timestamp()
);
"@
  $seedSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to seed the concurrent setup-reservation fixture.' }

  $worker = {
    param($SqlText, $DockerContainer, $Database)
    $ErrorActionPreference = 'Continue'
    $output = $SqlText | & docker exec -i $DockerContainer psql -U postgres `
      -d $Database -v ON_ERROR_STOP=1 2>&1
    [pscustomobject]@{
      ExitCode = $LASTEXITCODE
      Output = ($output -join [Environment]::NewLine)
    }
  }
  function New-SetupReservationSql {
    param([Parameter(Mandatory = $true)][string]$RequestId)
    return @"
\set ON_ERROR_STOP on
begin;
select set_config('request.jwt.claim.sub', '$concurrencyUserId', true);
set local role authenticated;
select public.equora_request_mexc_connection_setup_v1(
  '$RequestId', 'Concurrent read-only probe', '["BTC_USDT"]'::jsonb, true
);
reset role;
select pg_sleep(1.0);
commit;
"@
  }
  $setupJobA = Start-Job -ScriptBlock $worker -ArgumentList `
    (New-SetupReservationSql -RequestId '81000000-0000-4000-8000-000000000001'), `
    $ContainerName, $TestDatabase
  $setupJobB = Start-Job -ScriptBlock $worker -ArgumentList `
    (New-SetupReservationSql -RequestId '81000000-0000-4000-8000-000000000002'), `
    $ContainerName, $TestDatabase
  Wait-Job -Job $setupJobA, $setupJobB | Out-Null
  $setupResultA = Receive-Job -Job $setupJobA
  $setupResultB = Receive-Job -Job $setupJobB
  Remove-Job -Job $setupJobA, $setupJobB -Force
  $setupResults = @($setupResultA, $setupResultB)
  if (@($setupResults | Where-Object ExitCode -eq 0).Count -ne 1 `
      -or @($setupResults | Where-Object {
        $_.ExitCode -ne 0 -and $_.Output -match 'CONNECTION_SETUP_PROBE_BUSY'
      }).Count -ne 1) {
    throw "Concurrent setup reservation did not produce one winner and one fail-closed loser.`nA: $($setupResultA.Output)`nB: $($setupResultB.Output)"
  }
  $reservationCount = (& docker exec $ContainerName psql -U postgres -d $TestDatabase `
    -At -v ON_ERROR_STOP=1 -c "select count(*) from public.broker_connection_setup_commands where user_id='$concurrencyUserId' and command_status='pending';").Trim()
  if ($LASTEXITCODE -ne 0 -or $reservationCount -ne '1') {
    throw "Concurrent setup reservation count is not append-once: $reservationCount"
  }
  $cleanupSql = @"
delete from public.broker_connection_setup_commands where user_id='$concurrencyUserId';
delete from equora_private.broker_capture_runtime_enrollment where user_id='$concurrencyUserId';
delete from auth.users where id='$concurrencyUserId';
"@
  $cleanupSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to clean the concurrent setup-reservation fixture.' }

  # Disable-vs-Claim: the operator transaction wins the enrollment lock before
  # Claim reaches its downstream operational-authority fence. Claim must then
  # roll back every Work Unit/Run/lease mutation.
  $claimRaceSetupOutput = $claimRaceSetupSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to seed the enrollment Claim-race fixture: $($claimRaceSetupOutput -join [Environment]::NewLine)"
  }
  $claimRaceMaterialization = (& docker exec $ContainerName psql -U postgres -d $TestDatabase `
    -At -v ON_ERROR_STOP=1 -c "select coalesce(result->>'workUnitId','') || '|' || coalesce(result->>'status','') from public.broker_capture_materialization_commands where request_id='91500000-0000-4000-8000-000000000002';").Trim()
  $claimRaceWorkUnitId = ($claimRaceMaterialization -split '\|', 2)[0]
  if ($LASTEXITCODE -ne 0 -or $claimRaceWorkUnitId -notmatch '^[a-f0-9-]{36}$') {
    throw "Claim-race fixture did not expose a scheduled Work Unit: $claimRaceMaterialization`n$($claimRaceSetupOutput -join [Environment]::NewLine)"
  }
  $disableSql = @"
\set ON_ERROR_STOP on
begin;
set application_name='equora_runtime_enrollment_disable_winner';
update equora_private.broker_capture_runtime_enrollment
set enabled=false,updated_at=clock_timestamp()
where singleton_key is true;
select pg_sleep(1.2);
commit;
"@
  $claimSql = @"
\set ON_ERROR_STOP on
begin;
set application_name='equora_runtime_enrollment_claim_loser';
set local role service_role;
select public.equora_claim_broker_capture_work_unit_v2(
  '$claimRaceWorkUnitId',0,
  '91600000-0000-4000-8000-000000000091',
  '91700000-0000-4000-8000-000000000091',
  'broker-capture-claim-v1'
);
commit;
"@
  $disableJob = Start-Job -ScriptBlock $worker -ArgumentList $disableSql, $ContainerName, $TestDatabase
  $disableObserved = $false
  foreach ($attempt in 1..30) {
    $activity = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At `
      -v ON_ERROR_STOP=1 -c "select count(*) from pg_stat_activity where application_name='equora_runtime_enrollment_disable_winner' and query like '%pg_sleep%';" 2>$null
    if ($LASTEXITCODE -eq 0 -and $activity.Trim() -eq '1') { $disableObserved = $true; break }
    Start-Sleep -Milliseconds 100
  }
  if (-not $disableObserved) { throw 'Enrollment disable winner did not reach the lock-holding phase.' }
  $claimJob = Start-Job -ScriptBlock $worker -ArgumentList $claimSql, $ContainerName, $TestDatabase
  Wait-Job -Job $disableJob, $claimJob | Out-Null
  $disableResult = Receive-Job -Job $disableJob
  $claimResult = Receive-Job -Job $claimJob
  Remove-Job -Job $disableJob, $claimJob -Force
  if ($disableResult.ExitCode -ne 0 -or $claimResult.ExitCode -eq 0 `
      -or $claimResult.Output -notmatch 'CONTROL_RUNTIME_ENROLLMENT_INVALID') {
    throw "Disable-vs-Claim did not fail closed.`nDisable: $($disableResult.Output)`nClaim: $($claimResult.Output)"
  }
  $claimRaceState = (& docker exec $ContainerName psql -U postgres -d $TestDatabase `
    -At -v ON_ERROR_STOP=1 -c "select status,row_version,attempt,claim_count,last_claim_request_id is null,lease_token_digest is null from public.broker_capture_work_units where id='$claimRaceWorkUnitId';").Trim()
  if ($LASTEXITCODE -ne 0 -or $claimRaceState -ne 'pending|0|0|0|t|t') {
    throw "Disable-vs-Claim left a partial effect: $claimRaceState"
  }

  # Recreate the isolated database from the exact full-stack template so the
  # normal runtime integration below starts from a pristine state. The
  # temporary owner membership is cluster-global and remains available only
  # for the disposable fixture phase.
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
    -c "drop database $TestDatabase with (force);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to reset the Claim-race database.' }
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
    -c "create database $TestDatabase template $TemplateDatabase;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to recreate the runtime integration database.' }

  $ErrorActionPreference = 'Continue'
  $testOutput = $testSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  $testExitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($testExitCode -ne 0) { throw "Runtime-deployment integration failed: $($testOutput -join [Environment]::NewLine)" }

  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 `
    -c "revoke equora_broker_capture_owner from postgres;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to remove disposable runtime fixture owner membership.' }

  $ErrorActionPreference = 'Continue'
  $rerunOutput = $migrationSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  $rerunExitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($rerunExitCode -ne 0) { throw "Runtime-deployment re-run failed: $($rerunOutput -join [Environment]::NewLine)" }

  $ErrorActionPreference = 'Continue'
  $postflightOutput = $postflightSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  $postflightExitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($postflightExitCode -ne 0) { throw "Runtime-deployment postflight failed: $($postflightOutput -join [Environment]::NewLine)" }

  Write-Output 'Broker capture runtime-deployment integration passed.'
} finally {
  $ownerMembership = (& docker exec $ContainerName psql -U postgres -d postgres `
    -At -v ON_ERROR_STOP=1 -c "select pg_has_role('postgres','equora_broker_capture_owner','member');" 2>$null).Trim()
  if ($LASTEXITCODE -eq 0 -and $ownerMembership -eq 't') {
    & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
      -c "revoke equora_broker_capture_owner from postgres;" | Out-Null
  }
  if (-not $KeepDatabase) {
    & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
    & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TemplateDatabase with (force);" | Out-Null
  }
}
