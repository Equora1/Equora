param(
  [string]$ContainerName = 'equora-v5761-mb3-pinned',
  [string]$TestDatabase = 'equora_mb3_upgrade',
  [switch]$KeepDatabase
)
. (Join-Path $PSScriptRoot 'multibroker-mb3-test-lib.ps1')
Initialize-Mb3TestContext $ContainerName $TestDatabase
try {
  New-Mb3BaseDatabase
  $before = Get-Mb3Scalar "select encode(public.equora_pgcrypto_digest_v1(convert_to(string_agg(pg_get_functiondef(p.oid),E'\\n' order by p.oid::regprocedure::text),'UTF8'),'sha256'),'hex') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('equora_claim_broker_capture_work_unit_v2','equora_authorize_broker_capture_request_v1','equora_commit_broker_capture_page_v2');"
  Install-Mb3Migration
  $after = Get-Mb3Scalar "select encode(public.equora_pgcrypto_digest_v1(convert_to(string_agg(pg_get_functiondef(p.oid),E'\\n' order by p.oid::regprocedure::text),'UTF8'),'sha256'),'hex') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('equora_claim_broker_capture_work_unit_v2','equora_authorize_broker_capture_request_v1','equora_commit_broker_capture_page_v2');"
  $markers = Get-Mb3Scalar "select count(*),count(*) filter (where migration_id='equora_v57.61.0_multibroker_mb3_v1') from equora_private.schema_migrations;"
  if ($before -ne $after -or $markers -ne '8|1') { throw "Upgrade compatibility drift: before=$before after=$after markers=$markers" }
  Write-Output "MB3 upgrade gate PASS (legacy function hash unchanged=$before; seven legacy markers plus one MB3 marker)."
}
finally { if (-not $KeepDatabase) { Remove-Mb3Database } }
