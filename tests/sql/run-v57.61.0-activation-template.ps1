param(
  [string]$ContainerName = 'equora-v5761-scheduler-pgtest',
  [string]$TemplateDatabase = 'equora_activation_validation_template'
)

$ErrorActionPreference = 'Stop'

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TemplateDatabase -notmatch '^equora_activation_[a-z0-9_]+_template$') {
  throw 'TemplateDatabase must use the equora_activation_*_template form.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$supabaseRoot = Join-Path $repoRoot 'supabase'
$paths = @(
  (Join-Path $PSScriptRoot 'equora-local-supabase-stubs.sql'),
  (Join-Path $supabaseRoot 'schema.sql'),
  (Join-Path $supabaseRoot 'schema-patch-v57.60.1.sql'),
  (Join-Path $supabaseRoot 'schema-patch-v57.61.0.sql'),
  (Join-Path $supabaseRoot 'schema-patch-v57.61.0-g1-capture-control.sql'),
  (Join-Path $supabaseRoot 'schema-patch-v57.61.0-g1-lane-authority.sql'),
  (Join-Path $supabaseRoot 'schema-patch-v57.61.0-g1-activation-authority.sql')
)

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

function Invoke-SqlFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  $sql = Get-Content -Raw -Encoding utf8 -LiteralPath $Path
  $ErrorActionPreference = 'Continue'
  $output = $sql | & docker exec -i $ContainerName psql -U postgres `
    -d $TemplateDatabase -v ON_ERROR_STOP=1 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($exitCode -ne 0) {
    throw "Layer template apply failed for $Path`: $($output -join [Environment]::NewLine)"
  }
}

Invoke-AdminSql -Sql "drop database if exists $TemplateDatabase with (force);"
Invoke-AdminSql -Sql "create database $TemplateDatabase template template0;"
foreach ($path in $paths) {
  Invoke-SqlFile -Path $path
}

Write-Output 'Activation-layer v57.61.0 template created.'
