param(
  [string]$ContainerName = 'equora-v5762-trade-import-pinned',
  [string]$TestDatabase = 'equora_full_deployment_trade_import_v5762',
  [switch]$KeepDatabase
)

. (Join-Path $PSScriptRoot 'trade-import-hardening-test-lib.ps1')
Initialize-TradeImportTestContext $ContainerName $TestDatabase

try {
  New-TradeImportBaseDatabase
  Install-TradeImportCandidate
  Install-TradeImportCandidate

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
      and contract_version='equora-broker-file-import-capability-v1');
'@
  if ($candidateState -ne 'true|true|1|1|false') {
    throw "Trade-import candidate fresh/re-run state invalid: $candidateState"
  }

  Invoke-TradeImportIntegration | Out-Null
  Set-TradeImportActivationState -Enabled $true
  & (Join-Path $PSScriptRoot 'run-trade-import-hardening-concurrency.ps1') `
    -ContainerName $ContainerName -TestDatabase $TestDatabase

  Set-TradeImportActivationState -Enabled $false
  $preReapplySnapshot = Get-TradeImportPersistenceSnapshot
  Install-TradeImportCandidate
  $postReapplySnapshot = Get-TradeImportPersistenceSnapshot
  if ($postReapplySnapshot -ne $preReapplySnapshot) {
    throw 'Trade-import post-fixture re-apply changed gate or persisted data.'
  }

  Write-Output 'Trade-import PostgreSQL gate PASS: default-off database activation, authenticated denial without mutation, explicit test activation, rollback to off, fresh apply, exact pre-fixture re-run, post-fixture re-apply, catalog, ACL/RLS, atomic rollback, replay, revert/reimport and concurrency.'
}
finally {
  if (-not $KeepDatabase) {
    Remove-TradeImportDatabase
  }
}
