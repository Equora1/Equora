param(
  [string]$ContainerName = 'equora-v5761-scheduler-pgtest',
  [string]$TestDatabase = 'equora_full_deployment_v5761',
  [switch]$KeepDatabase
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TestDatabase -notmatch '^equora_full_deployment_[a-z0-9_]+$') {
  throw 'TestDatabase must use the equora_full_deployment_ prefix.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$supabaseRoot = Join-Path $repoRoot 'supabase'
$stubPath = Join-Path $PSScriptRoot 'equora-local-supabase-stubs.sql'
$baselinePaths = @(
  'schema.sql',
  'schema-patch-v57.60.1.sql'
)
$deploymentPaths = @(
  'schema-patch-v57.61.0.sql',
  'schema-patch-v57.61.0-g1-capture-control.sql',
  'schema-patch-v57.61.0-g1-lane-authority.sql',
  'schema-patch-v57.61.0-g1-activation-authority.sql',
  'schema-patch-v57.61.0-g1-scheduler-control.sql',
  'schema-patch-v57.61.0-g1-runtime-deployment.sql',
  'schema-patch-v57.61.0-g1-broker-provider-rls.sql'
)

function Read-Utf8File {
  param([Parameter(Mandatory = $true)][string]$Path)
  return Get-Content -Raw -Encoding utf8 -LiteralPath $Path
}

function Invoke-SqlText {
  param(
    [Parameter(Mandatory = $true)][string]$Sql,
    [Parameter(Mandatory = $true)][string]$Phase
  )
  $ErrorActionPreference = 'Continue'
  $output = $Sql | & docker exec -i $ContainerName psql -U postgres `
    -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($exitCode -ne 0) {
    throw "$Phase failed: $($output -join [Environment]::NewLine)"
  }
  return $output
}

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

function Expand-DeploymentDriver {
  $sql = Read-Utf8File (Join-Path $supabaseRoot 'deploy-v57.61.0.sql')
  foreach ($path in $deploymentPaths) {
    $sql = $sql.Replace("\ir $path", (Read-Utf8File (Join-Path $supabaseRoot $path)))
  }
  return $sql
}

function Expand-Preflight {
  $sql = Read-Utf8File (Join-Path $supabaseRoot 'preflight-v57.61.0.sql')
  $sql = $sql.Replace(
    '\ir verify-v57.60.1-baseline.sql',
    (Read-Utf8File (Join-Path $supabaseRoot 'verify-v57.60.1-baseline.sql'))
  )
  return $sql.Replace(
    '\ir verify-v57.61.0-contract.sql',
    (Read-Utf8File (Join-Path $supabaseRoot 'verify-v57.61.0-contract.sql'))
  )
}

function Expand-Postflight {
  $sql = Read-Utf8File (Join-Path $supabaseRoot 'postflight-v57.61.0.sql')
  return $sql.Replace(
    '\ir verify-v57.61.0-contract.sql',
    (Read-Utf8File (Join-Path $supabaseRoot 'verify-v57.61.0-contract.sql'))
  )
}

try {
  Invoke-AdminSql -Sql "drop database if exists $TestDatabase with (force);"
  Invoke-AdminSql -Sql "create database $TestDatabase template template0;"

  Invoke-SqlText -Sql (Read-Utf8File $stubPath) -Phase 'Supabase test stubs' | Out-Null
  foreach ($path in $baselinePaths) {
    Invoke-SqlText -Sql (Read-Utf8File (Join-Path $supabaseRoot $path)) `
      -Phase "Baseline $path" | Out-Null
  }

  $ErrorActionPreference = 'Continue'
  $directDeployOutput = (Expand-DeploymentDriver) | & docker exec -i $ContainerName `
    psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  $directDeployExitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  $directDeployText = $directDeployOutput -join "`n"
  if ($directDeployExitCode -eq 0 `
      -or $directDeployText -notmatch 'DEPLOY_PREFLIGHT_EVIDENCE_MISSING') {
    throw "Direct deployment without same-session preflight was not rejected: $directDeployText"
  }
  $directDeployMarkerAbsent = (& docker exec $ContainerName psql -U postgres `
    -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select to_regclass('equora_private.schema_migrations') is null;").Trim()
  if ($LASTEXITCODE -ne 0 -or $directDeployMarkerAbsent -ne 't') {
    throw "Direct deployment bypass left a marker effect: $directDeployMarkerAbsent"
  }

  $fullSession = (Expand-Preflight) `
    + "`n" + (Expand-DeploymentDriver) `
    + "`n" + (Expand-Postflight)
  $applyOutput = Invoke-SqlText -Sql $fullSession -Phase 'Fresh v57.61.0 deployment'

  $rerunSession = (Expand-Preflight) `
    + "`n" + (Expand-DeploymentDriver) `
    + "`n" + (Expand-Postflight)
  $rerunOutput = Invoke-SqlText -Sql $rerunSession -Phase 'Exact v57.61.0 re-run'

  $applyText = $applyOutput -join "`n"
  $rerunText = $rerunOutput -join "`n"
  $skipCount = ([regex]::Matches($rerunText, 'already exact; skip')).Count
  if ($applyText -notmatch 'POSTFLIGHT PASS' -or
    $rerunText -notmatch 'POSTFLIGHT PASS' -or $skipCount -ne 7) {
    throw 'Fresh/re-run deployment output did not prove the expected postflight and seven skips.'
  }

  Write-Output 'Full v57.61.0 fresh deployment and exact re-run passed.'
}
finally {
  if (-not $KeepDatabase) {
    Invoke-AdminSql -Sql "drop database if exists $TestDatabase with (force);"
  }
}
