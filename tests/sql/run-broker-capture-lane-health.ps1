param(
  [string]$ContainerName = 'equora-v5761-pgtest',
  [string]$TemplateDatabase = 'equora_remediation',
  [string]$TestDatabase = 'equora_capture_lane_health_v5761'
)

$ErrorActionPreference = 'Stop'

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TemplateDatabase -notmatch '^equora_[a-z0-9_]+$') {
  throw 'TemplateDatabase must be an explicitly named Equora test database.'
}
if ($TestDatabase -notmatch '^equora_capture_lane_health_[a-z0-9_]+$') {
  throw 'TestDatabase must use the equora_capture_lane_health_ prefix.'
}

$fixturePath = Join-Path $PSScriptRoot 'broker-capture-persistence.integration.sql'
$laneHealthPath = Join-Path $PSScriptRoot 'broker-capture-lane-health.integration.sql'
$fixture = Get-Content -Raw -LiteralPath $fixturePath
$laneHealthSql = Get-Content -Raw -LiteralPath $laneHealthPath
$setupMarker = '-- EQUORA_LANE_HEALTH_SETUP_END'
$setupEnd = $fixture.IndexOf($setupMarker, [StringComparison]::Ordinal)
if ($setupEnd -lt 0) {
  throw 'The integration fixture no longer exposes the expected setup boundary.'
}
$setupSql = $fixture.Substring(0, $setupEnd) + "`ncommit;`n"

try {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to remove the prior lane-health database.' }

  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "create database $TestDatabase template $TemplateDatabase;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create the isolated lane-health database.' }

  $setupOutput = $setupSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Lane-health fixture setup failed: $($setupOutput -join [Environment]::NewLine)"
  }

  $testOutput = $laneHealthSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Lane-health integration failed: $($testOutput -join [Environment]::NewLine)"
  }

  Write-Output 'Broker capture lane-health integration passed.'
}
finally {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
}
