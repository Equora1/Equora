param(
  [string]$ContainerName = 'equora-v5761-constraint-trigger-pgtest',
  [string]$Image = 'postgres:17-alpine'
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

if ($ContainerName -notmatch '^equora-v5761-[a-z0-9_.-]+$') {
  throw 'ContainerName must use the equora-v5761-* prefix.'
}
if ($Image -ne 'postgres:17-alpine') {
  throw 'Only the pinned local postgres:17-alpine test image is supported.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$supabaseRoot = Join-Path $repoRoot 'supabase'
$fullDeploymentRunner = Join-Path $PSScriptRoot 'run-v57.61.0-deployment.ps1'
$baselineDatabase = 'equora_full_deployment_constraint_trigger_baseline'
$fullDatabase = 'equora_full_deployment_constraint_trigger_full'
$containerStarted = $false

function Read-Utf8File {
  param([Parameter(Mandatory = $true)][string]$Path)
  return Get-Content -Raw -Encoding utf8 -LiteralPath $Path
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

function Invoke-SqlFile {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$Path
  )
  $ErrorActionPreference = 'Continue'
  $output = (Read-Utf8File $Path) | & docker exec -i $ContainerName psql `
    -U postgres -d $Database -v ON_ERROR_STOP=1 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($exitCode -ne 0) {
    throw "SQL fixture failed for ${Path}: $($output -join [Environment]::NewLine)"
  }
}

function Disable-FirstInternalForeignKeyTrigger {
  param([Parameter(Mandatory = $true)][string]$Database)
  Invoke-AdminSql -Database $Database -Sql @'
do $do$
declare
  v_schema text;
  v_table text;
  v_trigger text;
begin
  select namespace_row.nspname, relation_row.relname, trigger_row.tgname
  into strict v_schema, v_table, v_trigger
  from pg_trigger trigger_row
  join pg_constraint constraint_row on constraint_row.oid = trigger_row.tgconstraint
  join pg_class relation_row on relation_row.oid = trigger_row.tgrelid
  join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
  where namespace_row.nspname in ('public', 'equora_private')
    and constraint_row.contype = 'f'
    and trigger_row.tgisinternal
    and trigger_row.tgenabled = 'O'
  order by namespace_row.nspname, relation_row.relname, constraint_row.conname,
    trigger_row.tgname
  limit 1;
  execute format('alter table %I.%I disable trigger %I',
    v_schema, v_table, v_trigger);
end;
$do$;
'@
}

function Invoke-ExpectedPreflightFailure {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$ExpectedCode
  )
  $ErrorActionPreference = 'Continue'
  $output = (Expand-Preflight) | & docker exec -i $ContainerName psql `
    -U postgres -d $Database -v ON_ERROR_STOP=1 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  $text = $output -join "`n"
  if ($exitCode -eq 0 -or $text -notmatch [regex]::Escape($ExpectedCode)) {
    throw "Internal-trigger drift did not fail with ${ExpectedCode}: $text"
  }
}

try {
  & docker image inspect $Image --format '{{.Id}}' | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'LOCAL_POSTGRES17_IMAGE_MISSING'
  }
  $existingContainer = & docker ps -a --filter "name=^${ContainerName}$" `
    --format '{{.Names}}'
  if ($LASTEXITCODE -ne 0) {
    throw 'Docker container inventory failed.'
  }
  if (($existingContainer -join '').Trim()) {
    throw "Refusing to replace preexisting container: $ContainerName"
  }

  $containerId = & docker run --pull never --rm -d --name $ContainerName `
    -e POSTGRES_HOST_AUTH_METHOD=trust $Image
  if ($LASTEXITCODE -ne 0 -or -not ($containerId -join '').Trim()) {
    throw 'Failed to start the disposable PostgreSQL trigger-test container.'
  }
  $containerStarted = $true

  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    & docker exec $ContainerName pg_isready -U postgres -d postgres | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) {
    throw 'Disposable PostgreSQL trigger-test container did not become ready.'
  }

  Invoke-AdminSql -Database 'postgres' -Sql @'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role authenticator nologin;
create role dashboard_user nologin;
create role supabase_auth_admin nologin;
'@

  Invoke-AdminSql -Database 'postgres' `
    -Sql "create database $baselineDatabase template template0;"
  foreach ($path in @(
    (Join-Path $PSScriptRoot 'equora-local-supabase-stubs.sql'),
    (Join-Path $supabaseRoot 'schema.sql'),
    (Join-Path $supabaseRoot 'schema-patch-v57.60.1.sql')
  )) {
    Invoke-SqlFile -Database $baselineDatabase -Path $path
  }
  Disable-FirstInternalForeignKeyTrigger -Database $baselineDatabase
  Invoke-ExpectedPreflightFailure -Database $baselineDatabase `
    -ExpectedCode 'PREFLIGHT_BASELINE_CONTRACT_DRIFT'

  & $fullDeploymentRunner -ContainerName $ContainerName `
    -TestDatabase $fullDatabase -KeepDatabase
  if ($LASTEXITCODE -ne 0) {
    throw 'Failed to create the full deployment trigger-test database.'
  }
  Disable-FirstInternalForeignKeyTrigger -Database $fullDatabase
  Invoke-ExpectedPreflightFailure -Database $fullDatabase `
    -ExpectedCode 'POSTFLIGHT_TRIGGER_CONTRACT_DRIFT'

  Write-Output 'Baseline and full-marker internal FK-trigger drift oracles passed.'
}
finally {
  if ($containerStarted) {
    $ErrorActionPreference = 'Continue'
    & docker rm -f $ContainerName | Out-Null
    $ErrorActionPreference = 'Stop'
  }
}
