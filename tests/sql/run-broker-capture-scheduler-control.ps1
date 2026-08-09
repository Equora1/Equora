param(
  [string]$ContainerName = 'equora-v5761-scheduler-pgtest',
  [string]$TemplateDatabase = 'equora_full_deployment_scheduler_template',
  [string]$TestDatabase = 'equora_capture_scheduler_control_v5761',
  [switch]$KeepDatabase
)

$ErrorActionPreference = 'Stop'

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TemplateDatabase -notmatch '^equora_[a-z0-9_]+$') {
  throw 'TemplateDatabase must be an explicitly named Equora test database.'
}
if ($TestDatabase -notmatch '^equora_capture_scheduler_control_[a-z0-9_]+$') {
  throw 'TestDatabase must use the equora_capture_scheduler_control_ prefix.'
}

$fixturePath = Join-Path $PSScriptRoot 'broker-capture-persistence.integration.sql'
$schedulerTestPath = Join-Path $PSScriptRoot 'broker-capture-scheduler-control.integration.sql'
$schedulerMigrationPath = Join-Path $PSScriptRoot '..\..\supabase\schema-patch-v57.61.0-g1-scheduler-control.sql'
$activationMigrationPath = Join-Path $PSScriptRoot '..\..\supabase\schema-patch-v57.61.0-g1-activation-authority.sql'
$captureControlMigrationPath = Join-Path $PSScriptRoot '..\..\supabase\schema-patch-v57.61.0-g1-capture-control.sql'
$fullDeploymentRunner = Join-Path $PSScriptRoot 'run-v57.61.0-deployment.ps1'
$fixture = Get-Content -Raw -LiteralPath $fixturePath
$schedulerTestSql = Get-Content -Raw -LiteralPath $schedulerTestPath
$schedulerMigrationSql = Get-Content -Raw -LiteralPath $schedulerMigrationPath
$activationMigrationSql = Get-Content -Raw -LiteralPath $activationMigrationPath
$captureControlMigrationSql = Get-Content -Raw -LiteralPath $captureControlMigrationPath
$setupMarker = '-- EQUORA_SCHEDULER_CONTROL_SETUP_END'
$setupEnd = $fixture.IndexOf($setupMarker, [StringComparison]::Ordinal)
if ($setupEnd -lt 0) {
  throw 'The integration fixture no longer exposes the scheduler setup boundary.'
}
$setupSql = $fixture.Substring(0, $setupEnd) + "`ncommit;`n"

function Invoke-AdminSql {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$Sql
  )
  $ErrorActionPreference = 'Continue'
  $output = & docker exec $ContainerName psql -U postgres -d $Database `
    -v ON_ERROR_STOP=1 -c $Sql 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($exitCode -ne 0) {
    throw "Administrative SQL failed: $($output -join [Environment]::NewLine)"
  }
}

try {
  & $fullDeploymentRunner -ContainerName $ContainerName `
    -TestDatabase $TemplateDatabase -KeepDatabase
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create the current full-stack scheduler template.' }

  Invoke-AdminSql -Database 'postgres' -Sql "drop database if exists $TestDatabase with (force);"
  Invoke-AdminSql -Database 'postgres' -Sql "create database $TestDatabase template $TemplateDatabase;"

  $ErrorActionPreference = 'Continue'
  $migrationOutput = $schedulerMigrationSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  $migrationExitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($migrationExitCode -ne 0) {
    throw "Scheduler-control migration failed: $($migrationOutput -join [Environment]::NewLine)"
  }

  # The minimal local migration template intentionally stubs auth.users with
  # only its primary key. Supabase proper already owns these columns; adding
  # them only in the disposable test database keeps the shared fixture usable.
  Invoke-AdminSql -Database $TestDatabase -Sql "alter table auth.users add column if not exists email text, add column if not exists created_at timestamptz, add column if not exists updated_at timestamptz;"

  $ErrorActionPreference = 'Continue'
  $setupOutput = $setupSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  $setupExitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($setupExitCode -ne 0) {
    throw "Scheduler-control fixture setup failed: $($setupOutput -join [Environment]::NewLine)"
  }

  $ErrorActionPreference = 'Continue'
  $testOutput = $schedulerTestSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  $testExitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($testExitCode -ne 0) {
    throw "Scheduler-control integration failed: $($testOutput -join [Environment]::NewLine)"
  }

  # Re-run every upstream/downstream authority layer over populated synthetic
  # rows, then restore Scheduler last. This proves the effective service ACL is
  # durable across the supported migration order, not only on a clean apply.
  foreach ($layer in @(
    @{ Name = 'Activation Authority'; Sql = $activationMigrationSql },
    @{ Name = 'Capture Control'; Sql = $captureControlMigrationSql },
    @{ Name = 'Scheduler Control'; Sql = $schedulerMigrationSql }
  )) {
    $ErrorActionPreference = 'Continue'
    $layerOutput = $layer.Sql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
    $layerExitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($layerExitCode -ne 0) {
      throw "$($layer.Name) populated re-run failed: $($layerOutput -join [Environment]::NewLine)"
    }
  }

  $aclState = (& docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select has_function_privilege('service_role','public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)','execute'),has_function_privilege('service_role','public.equora_commit_broker_capture_page_v1(uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)','execute'),has_function_privilege('service_role','public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)','execute'),has_function_privilege('service_role','public.equora_claim_broker_capture_work_unit_v2(uuid,bigint,uuid,uuid,text)','execute'),has_function_privilege('service_role','public.equora_authorize_broker_capture_request_v1(uuid,bigint,integer,text,uuid,uuid)','execute'),has_function_privilege('service_role','public.equora_materialize_next_due_broker_capture_v1(uuid,text)','execute');").Trim()
  if ($LASTEXITCODE -ne 0 -or $aclState -ne 'f|f|f|t|t|t') {
    throw "Cross-layer effective RPC ACL drifted after populated re-runs: $aclState"
  }

  Write-Output 'Broker capture scheduler-control integration passed.'
}
finally {
  if (-not $KeepDatabase) {
    Invoke-AdminSql -Database 'postgres' -Sql "drop database if exists $TestDatabase with (force);"
    Invoke-AdminSql -Database 'postgres' -Sql "drop database if exists $TemplateDatabase with (force);"
  }
}
