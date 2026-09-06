param(
  [string]$ContainerName = 'equora-v5762-trade-import-pinned',
  [string]$TestDatabase = 'equora_full_deployment_trade_import_v5762',
  [switch]$KeepDatabase
)

. (Join-Path $PSScriptRoot 'trade-import-hardening-test-lib.ps1')
Initialize-TradeImportTestContext $ContainerName $TestDatabase

try {
  New-TradeImportBaseDatabase
  & (Join-Path $PSScriptRoot 'run-trade-import-v5762-release-negative.ps1') `
    -ContainerName $ContainerName -TestDatabase $TestDatabase -Mode PreInstall
  Install-TradeImportRelease
  Install-TradeImportRelease

  $candidateState = Get-TradeImportScalar @'
select
  (to_regprocedure('public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)') is not null)::text
  || '|' ||
  (to_regclass('public.trade_import_source_keys') is not null)::text
  || '|' ||
  (select count(*) from pg_indexes where schemaname='public'
    and indexname='trade_import_source_keys_active_identity_key')::text
  || '|' ||
  (select count(*) from public.equora_runtime_capability_gates
    where capability_key='journal_file_import_persistence_v2'
      and contract_version='equora-broker-file-import-capability-v1')::text
  || '|' ||
  (select enabled::text from public.equora_runtime_capability_gates
    where capability_key='journal_file_import_persistence_v2'
      and contract_version='equora-broker-file-import-capability-v1')
  || '|' ||
  (select exists (
    select 1 from equora_private.schema_migrations
    where migration_id='equora_v57.62.0_trade_import_persistence_v1'
      and contract_fingerprint=
        '014731e263ec2f0ffc9b0e16962b5d5574516a0c975a1713580740fa3bc6413d'
  ))::text;
'@
  if ($candidateState -ne 'true|true|1|1|false|true') {
    throw "Trade-import release fresh/re-run state invalid: $candidateState"
  }

  Invoke-TradeImportIntegration | Out-Null
  Set-TradeImportActivationState -Enabled $true
  Set-TradeImportActivationState -Enabled $true
  & (Join-Path $PSScriptRoot 'run-trade-import-hardening-concurrency.ps1') `
    -ContainerName $ContainerName -TestDatabase $TestDatabase

  Set-TradeImportActivationState -Enabled $false
  Set-TradeImportActivationState -Enabled $false
  $preReapplySnapshot = Get-TradeImportPersistenceSnapshot
  Install-TradeImportRelease
  $postReapplySnapshot = Get-TradeImportPersistenceSnapshot
  if ($postReapplySnapshot -ne $preReapplySnapshot) {
    throw 'Trade-import post-fixture re-apply changed gate or persisted data.'
  }
  & (Join-Path $PSScriptRoot 'run-trade-import-v5762-release-negative.ps1') `
    -ContainerName $ContainerName -TestDatabase $TestDatabase -Mode PostInstall

  Write-Output 'Trade-import PostgreSQL gate PASS: default-off database activation, authenticated denial without mutation, explicit test activation, rollback to off, fresh apply, exact pre-fixture re-run, post-fixture re-apply, catalog, ACL/RLS, atomic rollback, replay, revert/reimport and concurrency.'
}
finally {
  if (-not $KeepDatabase) {
    Remove-TradeImportDatabase
  }
}
