$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$script:Mb3Container = $null
$script:Mb3Database = $null
$script:Mb3RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:Mb3SupabaseRoot = Join-Path $script:Mb3RepoRoot 'supabase'
$script:Mb3MigrationPath = Join-Path $script:Mb3SupabaseRoot 'schema-patch-v57.61.0-multibroker-mb3.sql'
$script:Mb3IntegrationPath = Join-Path $PSScriptRoot 'multibroker-mb3.integration.sql'
$script:Mb3ExpectedImage = 'public.ecr.aws/supabase/postgres:17.6.1.084'
$script:Mb3ExpectedImageDigest = 'sha256:95d92e9563121189086690a4b7f8f2b711a4809a2499f45592199aae68ebae5f'

function Initialize-Mb3TestContext {
  param(
    [Parameter(Mandatory = $true)][string]$ContainerName,
    [Parameter(Mandatory = $true)][string]$TestDatabase
  )
  if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
    throw 'ContainerName contains unsupported characters.'
  }
  if ($TestDatabase -notmatch '^equora_mb3_[a-z0-9_]+$') {
    throw 'TestDatabase must use the equora_mb3_ prefix.'
  }
  $script:Mb3Container = $ContainerName
  $script:Mb3Database = $TestDatabase

  $dockerContext = (& docker context show 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $dockerContext) {
    throw 'MB3 Docker context could not be resolved.'
  }
  $contextJson = (& docker context inspect $dockerContext 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "MB3 Docker context inspection failed: $contextJson" }
  $contextObject = @($contextJson | ConvertFrom-Json)
  $dockerHost = [string]$contextObject[0].Endpoints.docker.Host
  if ($dockerHost -notmatch '^(npipe|unix)://') {
    throw "MB3 Docker context is not a local npipe/unix endpoint: $dockerHost"
  }
  $containerState = (& docker inspect --format '{{.Id}}|{{.Config.Image}}|{{.Image}}|{{.HostConfig.NetworkMode}}|{{.State.Running}}' $ContainerName 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "MB3 container inspection failed: $containerState" }
  $parts = $containerState.Split('|')
  if ($parts.Count -ne 5 -or $parts[1] -ne $script:Mb3ExpectedImage -or $parts[3] -ne 'none' -or $parts[4] -ne 'true') {
    throw "MB3 container identity/network mismatch: $containerState"
  }
  $imageJson = (& docker image inspect $parts[2] 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw "MB3 image inspection failed: $imageJson" }
  $imageObject = @($imageJson | ConvertFrom-Json)
  $repoDigests = @($imageObject[0].RepoDigests) -join ','
  if ($repoDigests -notmatch [regex]::Escape("@$($script:Mb3ExpectedImageDigest)")) {
    throw "MB3 image digest mismatch: $repoDigests"
  }
  $postgresVersion = (& docker exec $ContainerName psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c 'show server_version;' 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $postgresVersion -notmatch '^17\.6(?:\D|$)') {
    throw "MB3 PostgreSQL version mismatch: $postgresVersion"
  }
  Write-Output "MB3 environment attestation PASS: dockerContext=$dockerContext; dockerHost=$dockerHost; containerId=$($parts[0]); image=$($parts[1]); imageDigest=$script:Mb3ExpectedImageDigest; networkMode=none; postgresVersion=$postgresVersion."
}

function Read-Mb3Utf8File {
  param([Parameter(Mandatory = $true)][string]$Path)
  return Get-Content -Raw -Encoding utf8 -LiteralPath $Path
}

function Invoke-Mb3AdminSql {
  param([Parameter(Mandatory = $true)][string]$Sql)
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = & docker exec $script:Mb3Container psql -U postgres -d postgres `
    -v ON_ERROR_STOP=1 -c $Sql 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($exitCode -ne 0) {
    throw "MB3 administrative SQL failed: $($output -join [Environment]::NewLine)"
  }
  return $output
}

function Invoke-Mb3SqlText {
  param(
    [Parameter(Mandatory = $true)][string]$Sql,
    [Parameter(Mandatory = $true)][string]$Phase
  )
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = $Sql | & docker exec -i $script:Mb3Container psql -U postgres `
    -d $script:Mb3Database -v ON_ERROR_STOP=1 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($exitCode -ne 0) {
    throw "$Phase failed: $($output -join [Environment]::NewLine)"
  }
  return $output
}

function Invoke-Mb3SqlTextExpectFailure {
  param(
    [Parameter(Mandatory = $true)][string]$Sql,
    [Parameter(Mandatory = $true)][string]$ExpectedPattern,
    [Parameter(Mandatory = $true)][string]$Phase
  )
  $ErrorActionPreference = 'Continue'
  $output = $Sql | & docker exec -i $script:Mb3Container psql -U postgres `
    -d $script:Mb3Database -v ON_ERROR_STOP=1 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  $text = $output -join "`n"
  if ($exitCode -eq 0 -or $text -notmatch $ExpectedPattern) {
    throw "$Phase did not fail closed with $ExpectedPattern`: $text"
  }
  return $text
}

function Get-Mb3Scalar {
  param([Parameter(Mandatory = $true)][string]$Sql)
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = & docker exec $script:Mb3Container psql -U postgres `
    -d $script:Mb3Database -At -v ON_ERROR_STOP=1 -c $Sql 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($exitCode -ne 0) {
    throw "MB3 scalar query failed: $($output -join [Environment]::NewLine)"
  }
  return ($output -join "`n").Trim()
}

function Expand-Mb3Preflight {
  $sql = Read-Mb3Utf8File (Join-Path $script:Mb3SupabaseRoot 'preflight-v57.61.0.sql')
  $sql = $sql.Replace(
    '\ir verify-v57.60.1-baseline.sql',
    (Read-Mb3Utf8File (Join-Path $script:Mb3SupabaseRoot 'verify-v57.60.1-baseline.sql'))
  )
  return $sql.Replace(
    '\ir verify-v57.61.0-contract.sql',
    (Read-Mb3Utf8File (Join-Path $script:Mb3SupabaseRoot 'verify-v57.61.0-contract.sql'))
  )
}

function Expand-Mb3Deployment {
  $sql = Read-Mb3Utf8File (Join-Path $script:Mb3SupabaseRoot 'deploy-v57.61.0.sql')
  foreach ($name in @(
    'schema-patch-v57.61.0.sql',
    'schema-patch-v57.61.0-g1-capture-control.sql',
    'schema-patch-v57.61.0-g1-lane-authority.sql',
    'schema-patch-v57.61.0-g1-activation-authority.sql',
    'schema-patch-v57.61.0-g1-scheduler-control.sql',
    'schema-patch-v57.61.0-g1-runtime-deployment.sql',
    'schema-patch-v57.61.0-g1-broker-provider-rls.sql'
  )) {
    $sql = $sql.Replace("\ir $name", (Read-Mb3Utf8File (Join-Path $script:Mb3SupabaseRoot $name)))
  }
  return $sql
}

function New-Mb3BaseDatabase {
  Invoke-Mb3AdminSql "drop database if exists $script:Mb3Database with (force);" | Out-Null
  $preexistingRoles = (& docker exec $script:Mb3Container psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_roles where rolname in ('equora_broker_operator_control_v2','equora_broker_runtime_v2');" 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $preexistingRoles -ne '0') {
    throw "MB3 gate did not start from a first-install role state: $preexistingRoles"
  }
  Invoke-Mb3AdminSql "create database $script:Mb3Database template template0;" | Out-Null
  Invoke-Mb3SqlText (Read-Mb3Utf8File (Join-Path $PSScriptRoot 'equora-local-supabase-stubs.sql')) 'Supabase stubs' | Out-Null
  Invoke-Mb3SqlText (Read-Mb3Utf8File (Join-Path $script:Mb3SupabaseRoot 'schema.sql')) 'Schema baseline' | Out-Null
  Invoke-Mb3SqlText (Read-Mb3Utf8File (Join-Path $script:Mb3SupabaseRoot 'schema-patch-v57.60.1.sql')) 'v57.60.1 baseline' | Out-Null
  Invoke-Mb3SqlText ((Expand-Mb3Preflight) + "`n" + (Expand-Mb3Deployment)) 'v57.61.0 seven-layer base' | Out-Null
  $markerCount = Get-Mb3Scalar "select count(*) from equora_private.schema_migrations where migration_id in ('equora_v57.61.0_broker_capture_v1','equora_v57.61.0_g1_capture_control_v1','equora_v57.61.0_g1_lane_authority_v1','equora_v57.61.0_g1_activation_authority_v1','equora_v57.61.0_g1_scheduler_control_v2','equora_v57.61.0_g1_runtime_deployment_v1','equora_v57.61.0_broker_provider_rls_v1');"
  if ($markerCount -ne '7') { throw "Base marker count was not 7: $markerCount" }
}

function Install-Mb3Migration {
  Invoke-Mb3SqlText (Read-Mb3Utf8File $script:Mb3MigrationPath) 'MB3 migration' | Out-Null
}

function Invoke-Mb3Integration {
  Invoke-Mb3SqlText (Read-Mb3Utf8File $script:Mb3IntegrationPath) 'MB3 integration fixture'
}

function Remove-Mb3Database {
  Invoke-Mb3AdminSql "drop database if exists $script:Mb3Database with (force);" | Out-Null
  Invoke-Mb3AdminSql "drop role if exists equora_broker_runtime_v2; drop role if exists equora_broker_operator_control_v2;" | Out-Null
  $clusterState = (& docker exec $script:Mb3Container psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c "select (select count(*) from pg_roles where rolname in ('equora_broker_operator_control_v2','equora_broker_runtime_v2')),(select count(*) from pg_auth_members membership join pg_roles role_row on role_row.oid=membership.roleid where role_row.rolname in ('equora_broker_operator_control_v2','equora_broker_runtime_v2'));" 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $clusterState -ne '0|0') {
    throw "MB3 cluster role/membership cleanup failed: $clusterState"
  }
  Write-Output 'MB3 cluster cleanup PASS: test database removed; MB3 memberships and roles absent.'
}
