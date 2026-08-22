param(
  [string]$ContainerName = 'equora-v5761-mb3-pinned',
  [string]$TestDatabase = 'equora_mb3_fresh',
  [switch]$KeepDatabase
)
. (Join-Path $PSScriptRoot 'multibroker-mb3-test-lib.ps1')
Initialize-Mb3TestContext $ContainerName $TestDatabase
try {
  New-Mb3BaseDatabase
  Install-Mb3Migration
  Install-Mb3Migration
  $state = Get-Mb3Scalar "select (select count(*) from equora_private.schema_migrations where migration_id='equora_v57.61.0_multibroker_mb3_v1'),(select count(*) from public.broker_provider_capability_contracts_v2),(select count(*) from public.broker_runtime_enrollments_v2);"
  if ($state -ne '1|4|0') { throw "Fresh/idempotent MB3 state invalid: $state" }
  Invoke-Mb3Integration | Out-Null
  Write-Output 'MB3 fresh/idempotency gate PASS (marker=1, capabilities=4, default enrollments=0, integration rollback PASS).'
}
finally { if (-not $KeepDatabase) { Remove-Mb3Database } }
