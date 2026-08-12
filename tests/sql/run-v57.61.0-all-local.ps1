param(
  [string]$ContainerName = 'equora-v5761-scheduler-pgtest',
  [string]$TemplateDatabase = 'equora_full_deployment_validation_template',
  [string]$ActivationTemplateDatabase = 'equora_activation_validation_template'
)

$ErrorActionPreference = 'Stop'

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TemplateDatabase -notmatch '^equora_full_deployment_[a-z0-9_]+$') {
  throw 'TemplateDatabase must use the equora_full_deployment_ prefix.'
}
if ($ActivationTemplateDatabase -notmatch '^equora_activation_[a-z0-9_]+_template$') {
  throw 'ActivationTemplateDatabase must use the equora_activation_*_template form.'
}

$fullDeploymentRunner = Join-Path $PSScriptRoot 'run-v57.61.0-deployment.ps1'

function Invoke-AdminSql {
  param([Parameter(Mandatory = $true)][string]$Sql)

  $ErrorActionPreference = 'Continue'
  $output = & docker exec $ContainerName psql -U postgres -d postgres `
    -v ON_ERROR_STOP=1 -c $Sql 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($exitCode -ne 0) {
    throw "Administrative SQL failed: $($output -join [Environment]::NewLine)"
  }
}

function Initialize-DisposableDatabase {
  param([Parameter(Mandatory = $true)][string]$Database)

  if ($Database -notmatch '^equora_[a-z0-9_]+$') {
    throw "Unsafe disposable database name: $Database"
  }
  Invoke-AdminSql -Sql "drop database if exists $Database with (force);"
  Invoke-AdminSql -Sql "create database $Database template template0;"
}

function Invoke-Runner {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Action
  )

  Write-Output "RUN $Name"
  & $Action
  Write-Output "PASS $Name"
}

function Set-FixtureOwnerMembership {
  param([Parameter(Mandatory = $true)][bool]$Enabled)

  if ($Enabled) {
    Invoke-AdminSql -Sql 'grant equora_broker_capture_owner to postgres with inherit true, set true;'
  } else {
    Invoke-AdminSql -Sql @'
do $$
begin
  if exists (
    select 1
    from pg_auth_members membership
    where membership.roleid = to_regrole('equora_broker_capture_owner')
      and membership.member = to_regrole('postgres')
  ) then
    execute 'revoke equora_broker_capture_owner from postgres';
  end if;
end;
$$;
'@
  }
}

$simpleRunners = @(
  @{ Name = 'activation-authority'; Script = 'run-broker-capture-activation-authority.ps1'; Database = 'equora_capture_activation_authority_v5761' },
  @{ Name = 'activation-authority-concurrency'; Script = 'run-broker-capture-activation-authority-concurrency.ps1'; Database = 'equora_capture_activation_authority_concurrency_v5761' },
  @{ Name = 'activation-authority-drift'; Script = 'run-broker-capture-activation-authority-drift.ps1'; Database = 'equora_capture_activation_authority_drift_v5761' },
  @{ Name = 'claim-concurrency'; Script = 'run-broker-capture-claim-concurrency.ps1'; Database = 'equora_capture_claim_concurrency_v5761' },
  @{ Name = 'capture-concurrency'; Script = 'run-broker-capture-concurrency.ps1'; Database = 'equora_capture_concurrency_v5761' },
  @{ Name = 'failure-concurrency'; Script = 'run-broker-capture-failure-concurrency.ps1'; Database = 'equora_capture_failure_concurrency_v5761' },
  @{ Name = 'lane-health'; Script = 'run-broker-capture-lane-health.ps1'; Database = 'equora_capture_lane_health_v5761' },
  @{ Name = 'outcome-concurrency'; Script = 'run-broker-capture-outcome-concurrency.ps1'; Database = 'equora_capture_outcome_concurrency_v5761' },
  @{ Name = 'page-replay-concurrency'; Script = 'run-broker-capture-page-replay-concurrency.ps1'; Database = 'equora_capture_page_replay_concurrency_v5761' },
  @{ Name = 'scheduler-concurrency'; Script = 'run-broker-capture-scheduler-concurrency.ps1'; Database = 'equora_capture_scheduler_concurrency_v5761' }
)

$postgrestDatabase = 'equora_postgrest_timeout_v5761'

try {
  Invoke-Runner -Name 'full-deployment-fresh-and-rerun' -Action {
    & $fullDeploymentRunner -ContainerName $ContainerName `
      -TestDatabase $TemplateDatabase -KeepDatabase
  }
  Invoke-Runner -Name 'restored-v57.60.1-upgrade-and-rerun' -Action {
    & (Join-Path $PSScriptRoot `
      'run-v57.61.0-restored-v57601-upgrade.ps1') `
      -ContainerName $ContainerName
  }
  Invoke-Runner -Name 'restored-v57.60.1-public-pgcrypto-upgrade-and-rerun' -Action {
    & (Join-Path $PSScriptRoot `
      'run-v57.61.0-restored-v57601-upgrade.ps1') `
      -ContainerName $ContainerName `
      -TestDatabase 'equora_restored_v57601_public_pgcrypto' `
      -PgcryptoSchema public -SkipNegativeOracles
  }
  Invoke-Runner -Name 'activation-layer-template' -Action {
    & (Join-Path $PSScriptRoot 'run-v57.61.0-activation-template.ps1') `
      -ContainerName $ContainerName -TemplateDatabase $ActivationTemplateDatabase
  }

  # The integration fixtures intentionally seed owner-protected tables and
  # invoke owner-only digest helpers directly. Supabase production never grants
  # this membership to postgres; the disposable runner enables it only for the
  # legacy fixture phase and revokes it before deployment/postflight tests.
  Set-FixtureOwnerMembership -Enabled $true

  foreach ($runner in $simpleRunners) {
    Initialize-DisposableDatabase -Database $runner.Database
    $runnerPath = Join-Path $PSScriptRoot $runner.Script
    Invoke-Runner -Name $runner.Name -Action {
      & $runnerPath -ContainerName $ContainerName `
        -TemplateDatabase $ActivationTemplateDatabase -TestDatabase $runner.Database
    }
  }

  foreach ($database in @(
    'equora_capture_scheduler_constraint_drift',
    'equora_capture_scheduler_index_drift'
  )) {
    Initialize-DisposableDatabase -Database $database
  }
  Invoke-Runner -Name 'scheduler-drift' -Action {
    & (Join-Path $PSScriptRoot 'run-broker-capture-scheduler-drift.ps1') `
      -ContainerName $ContainerName -TemplateDatabase $TemplateDatabase
  }

  Initialize-DisposableDatabase -Database $postgrestDatabase
  Invoke-AdminSql -Sql "drop database $postgrestDatabase with (force);"
  Invoke-AdminSql -Sql "create database $postgrestDatabase template $TemplateDatabase;"
  Invoke-Runner -Name 'postgrest-timeout' -Action {
    & (Join-Path $PSScriptRoot 'run-broker-capture-postgrest-timeout.ps1') `
      -DatabaseContainer $ContainerName -Database $postgrestDatabase
  }


  Set-FixtureOwnerMembership -Enabled $false

  Invoke-Runner -Name 'scheduler-control' -Action {
    & (Join-Path $PSScriptRoot 'run-broker-capture-scheduler-control.ps1') `
      -ContainerName $ContainerName
  }

  Initialize-DisposableDatabase -Database 'equora_runtime_deployment_v5761'
  Invoke-Runner -Name 'runtime-deployment' -Action {
    & (Join-Path $PSScriptRoot 'run-broker-capture-runtime-deployment.ps1') `
      -ContainerName $ContainerName
  }

  Invoke-Runner -Name 'full-deployment-drift' -Action {
    & (Join-Path $PSScriptRoot 'run-v57.61.0-deployment-drift.ps1') `
      -ContainerName $ContainerName
  }
  Invoke-Runner -Name 'forward-only-layer-7' -Action {
    & (Join-Path $PSScriptRoot 'run-v57.61.0-layer7-forward.ps1') `
      -ContainerName $ContainerName
  }
  Invoke-Runner -Name 'internal-constraint-trigger-drift' -Action {
    & (Join-Path $PSScriptRoot 'run-v57.61.0-constraint-trigger-drift.ps1')
  }
  Invoke-Runner -Name 'hosted-supabase-v17-compatibility' -Action {
    & (Join-Path $PSScriptRoot 'run-v57.61.0-hosted-supabase-compat.ps1')
  }

  Write-Output 'All local v57.61.0 SQL, Hosted compatibility, concurrency, drift, and PostgREST runners passed.'
}
finally {
  try {
    Set-FixtureOwnerMembership -Enabled $false
  } catch {
    Write-Warning $_.Exception.Message
  }
  foreach ($database in @(
    $postgrestDatabase,
    $ActivationTemplateDatabase,
    $TemplateDatabase
  )) {
    try {
      Invoke-AdminSql -Sql "drop database if exists $database with (force);"
    } catch {
      Write-Warning $_.Exception.Message
    }
  }
}
