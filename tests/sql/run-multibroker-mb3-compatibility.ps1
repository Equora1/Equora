param(
  [string]$ContainerName = 'equora-v5761-mb3-pinned',
  [string]$TestDatabase = 'equora_mb3_compatibility',
  [switch]$KeepDatabase
)
. (Join-Path $PSScriptRoot 'multibroker-mb3-test-lib.ps1')
Initialize-Mb3TestContext $ContainerName $TestDatabase
try {
  New-Mb3BaseDatabase
  $before = Get-Mb3Scalar "select to_regprocedure('public.equora_authorize_provider_capture_request_v2(uuid,uuid,bigint,uuid,bigint,integer,bigint,bigint,text,text,text,text,timestamptz,text)') is null,(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('equora_claim_broker_capture_work_unit_v2','equora_authorize_broker_capture_request_v1','equora_commit_broker_capture_page_v2'));"
  if ($before -ne 't|3') { throw "Pre-MB3 compatibility state invalid: $before" }
  Install-Mb3Migration
  Invoke-Mb3Integration | Out-Null
  $after = Get-Mb3Scalar "select to_regprocedure('public.equora_authorize_provider_capture_request_v2(uuid,uuid,bigint,uuid,bigint,integer,bigint,bigint,text,text,text,text,timestamptz,text)') is not null,(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('equora_claim_broker_capture_work_unit_v2','equora_authorize_broker_capture_request_v1','equora_commit_broker_capture_page_v2'));"
  if ($after -ne 't|3') { throw "Post-MB3 compatibility state invalid: $after" }
  Write-Output 'MB3 compatibility gate PASS (pre-MB3 v2 absent, v1 RPCs preserved, v2 integration rollback PASS).'
}
finally { if (-not $KeepDatabase) { Remove-Mb3Database } }
