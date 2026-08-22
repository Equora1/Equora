param(
  [string]$ContainerName = 'equora-v5761-mb3-pinned',
  [string]$TestDatabase = 'equora_mb3_partial',
  [switch]$KeepDatabase
)
. (Join-Path $PSScriptRoot 'multibroker-mb3-test-lib.ps1')
Initialize-Mb3TestContext $ContainerName $TestDatabase
try {
  New-Mb3BaseDatabase
  $migration = Read-Mb3Utf8File $script:Mb3MigrationPath
  $marker = '-- EQUORA_MB3_FAILPOINT_AFTER_TABLES'
  $position = $migration.IndexOf($marker, [StringComparison]::Ordinal)
  if ($position -lt 0) { throw 'MB3 failpoint marker is missing.' }
  $partial = $migration.Substring(0, $position + $marker.Length) + "`ndo `$`$ begin raise exception 'MB3_TEST_PARTIAL_FAILURE'; end; `$`$;`ncommit;"
  Invoke-Mb3SqlTextExpectFailure $partial 'MB3_TEST_PARTIAL_FAILURE' 'MB3 injected partial failure' | Out-Null
  $state = Get-Mb3Scalar "select to_regclass('public.broker_runtime_enrollments_v2') is null,(select count(*) from equora_private.schema_migrations where migration_id='equora_v57.61.0_multibroker_mb3_v1');"
  if ($state -ne 't|0') { throw "Partial failure left schema effects: $state" }
  Install-Mb3Migration
  Write-Output 'MB3 partial-failure gate PASS (injected transaction fully rolled back; clean recovery verified).'
}
finally { if (-not $KeepDatabase) { Remove-Mb3Database } }
