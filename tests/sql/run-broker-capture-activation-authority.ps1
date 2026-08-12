param(
  [string]$ContainerName = 'equora-v5761-pgtest',
  [string]$TemplateDatabase = 'equora_remediation',
  [string]$TestDatabase = 'equora_capture_activation_authority_v5761'
)

$ErrorActionPreference = 'Stop'

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TemplateDatabase -notmatch '^equora_[a-z0-9_]+$') {
  throw 'TemplateDatabase must be an explicitly named Equora test database.'
}
if ($TestDatabase -notmatch '^equora_capture_activation_authority_[a-z0-9_]+$') {
  throw 'TestDatabase must use the equora_capture_activation_authority_ prefix.'
}

$fixturePath = Join-Path $PSScriptRoot 'broker-capture-persistence.integration.sql'
$authorityPath = Join-Path $PSScriptRoot 'broker-capture-activation-authority.integration.sql'
$fixture = Get-Content -Raw -LiteralPath $fixturePath
$authoritySql = Get-Content -Raw -LiteralPath $authorityPath
$setupMarker = '-- EQUORA_CONCURRENCY_SETUP_END'
$setupEnd = $fixture.IndexOf($setupMarker, [StringComparison]::Ordinal)
if ($setupEnd -lt 0) {
  throw 'The integration fixture no longer exposes the expected setup boundary.'
}
$setupSql = $fixture.Substring(0, $setupEnd) + "`ncommit;`n"
$combinedSql = $setupSql + "`n" + $authoritySql

try {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to remove the prior activation-authority database.' }

  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "create database $TestDatabase template $TemplateDatabase;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create the isolated activation-authority database.' }

  # Keep the pg_temp fixture adapters and checkpoint state alive for the v2
  # Page-path assertions by executing setup and authority tests in one session.
  $testOutput = $combinedSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Activation-authority integration failed: $($testOutput -join [Environment]::NewLine)"
  }

  Write-Output 'Broker capture activation-authority integration passed.'
}
finally {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
}
