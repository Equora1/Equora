param(
  [string]$ContainerName = 'equora-v5761-pgtest',
  [string]$TemplateDatabase = 'equora_scheduler_remediation_template',
  [string]$ConstraintTestDatabase = 'equora_capture_scheduler_constraint_drift',
  [string]$IndexTestDatabase = 'equora_capture_scheduler_index_drift'
)

$ErrorActionPreference = 'Stop'

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TemplateDatabase -notmatch '^equora_[a-z0-9_]+$') {
  throw 'TemplateDatabase must be an explicitly named Equora test database.'
}
foreach ($database in @($ConstraintTestDatabase, $IndexTestDatabase)) {
  if ($database -notmatch '^equora_capture_scheduler_[a-z0-9_]+_drift$') {
    throw 'Drift databases must use the equora_capture_scheduler_*_drift form.'
  }
}

$migrationPath = Join-Path $PSScriptRoot '..\..\supabase\schema-patch-v57.61.0-g1-scheduler-control.sql'
$migrationSql = Get-Content -Raw -LiteralPath $migrationPath

function New-IsolatedDatabase {
  param([Parameter(Mandatory = $true)][string]$Database)
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
    -c "drop database if exists $Database with (force);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to remove drift database $Database." }
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
    -c "create database $Database template $TemplateDatabase;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to create drift database $Database." }
}

function Assert-MigrationDrift {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$ExpectedError
  )
  $ErrorActionPreference = 'Continue'
  $output = $migrationSql | & docker exec -i $ContainerName psql -U postgres `
    -d $Database -v ON_ERROR_STOP=1 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  $joined = $output -join [Environment]::NewLine
  if ($exitCode -eq 0 -or $joined -notmatch [regex]::Escape($ExpectedError)) {
    throw "Expected $ExpectedError, received exit=$exitCode output=$joined"
  }
}

try {
  New-IsolatedDatabase -Database $ConstraintTestDatabase
  & docker exec $ContainerName psql -U postgres -d $ConstraintTestDatabase `
    -v ON_ERROR_STOP=1 -c "alter table public.broker_capture_account_leases drop constraint broker_capture_account_leases_contract_check; alter table public.broker_capture_account_leases add constraint broker_capture_account_leases_contract_check check (true);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to install constraint drift mutant.' }
  Assert-MigrationDrift -Database $ConstraintTestDatabase `
    -ExpectedError 'SCHEDULER_CONTROL_CONSTRAINT_DEFINITION_DRIFT'

  New-IsolatedDatabase -Database $IndexTestDatabase
  & docker exec $ContainerName psql -U postgres -d $IndexTestDatabase `
    -v ON_ERROR_STOP=1 -c "drop index public.idx_broker_capture_account_leases_expiry; create index idx_broker_capture_account_leases_expiry on public.broker_capture_account_leases (broker_account_id);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to install index drift mutant.' }
  Assert-MigrationDrift -Database $IndexTestDatabase `
    -ExpectedError 'SCHEDULER_CONTROL_INDEX_DEFINITION_DRIFT'

  Write-Output 'Broker capture scheduler semantic drift rejection passed.'
}
finally {
  foreach ($database in @($ConstraintTestDatabase, $IndexTestDatabase)) {
    & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
      -c "drop database if exists $database with (force);" | Out-Null
  }
}
