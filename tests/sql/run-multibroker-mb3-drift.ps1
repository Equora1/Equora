param(
  [string]$ContainerName = 'equora-v5761-mb3-pinned',
  [string]$TestDatabase = 'equora_mb3_drift',
  [switch]$KeepDatabase
)
. (Join-Path $PSScriptRoot 'multibroker-mb3-test-lib.ps1')
Initialize-Mb3TestContext $ContainerName $TestDatabase
try {
  New-Mb3BaseDatabase
  Install-Mb3Migration
  Invoke-Mb3SqlTextExpectFailure "begin; grant equora_broker_operator_control_v2 to postgres; set local role equora_broker_operator_control_v2; update public.broker_provider_capability_contracts_v2 set response_contract_version='drift' where capability_id='historical_orders_v1'; reset role; revoke equora_broker_operator_control_v2 from postgres granted by postgres; select equora_private.equora_verify_multibroker_mb3_v1();" 'MB3_CAPABILITY_REGISTRY_DRIFT' 'Registry drift' | Out-Null
  Invoke-Mb3SqlTextExpectFailure "begin; update equora_private.schema_migrations set contract_fingerprint=repeat('0',64) where migration_id='equora_v57.61.0_multibroker_mb3_v1'; select equora_private.equora_verify_multibroker_mb3_v1();" 'MB3_MARKER_DRIFT' 'Marker drift' | Out-Null
  Invoke-Mb3SqlTextExpectFailure "begin; grant equora_broker_runtime_v2 to postgres; set local role equora_broker_runtime_v2; alter table public.broker_capture_page_commits_v2 disable row level security; reset role; revoke equora_broker_runtime_v2 from postgres granted by postgres; select equora_private.equora_verify_multibroker_mb3_v1();" 'MB3_RLS_CONTRACT_DRIFT' 'RLS drift' | Out-Null
  Invoke-Mb3SqlTextExpectFailure "begin; grant equora_broker_runtime_v2 to postgres; set local role equora_broker_runtime_v2; grant insert on public.broker_capture_page_commits_v2 to service_role; reset role; revoke equora_broker_runtime_v2 from postgres granted by postgres; select equora_private.equora_verify_multibroker_mb3_v1();" 'MB3_DIRECT_DML_GRANT_DRIFT' 'ACL drift' | Out-Null
  Invoke-Mb3SqlTextExpectFailure "begin; grant equora_broker_operator_control_v2 to postgres; set local role equora_broker_operator_control_v2; grant insert on public.broker_provider_capability_contracts_v2 to equora_broker_runtime_v2; reset role; revoke equora_broker_operator_control_v2 from postgres granted by postgres; select equora_private.equora_verify_multibroker_mb3_v1();" 'MB3_DIRECT_DML_GRANT_DRIFT' 'Registry cross-role ACL drift' | Out-Null
  Invoke-Mb3SqlTextExpectFailure "begin; grant equora_broker_runtime_v2 to postgres; set local role equora_broker_runtime_v2; grant select on public.broker_capture_page_commits_v2 to equora_broker_operator_control_v2; reset role; revoke equora_broker_runtime_v2 from postgres granted by postgres; select equora_private.equora_verify_multibroker_mb3_v1();" 'MB3_DIRECT_DML_GRANT_DRIFT' 'Operator cross-role ACL drift' | Out-Null
  Invoke-Mb3SqlTextExpectFailure "begin; grant equora_broker_runtime_v2 to postgres; set local role equora_broker_runtime_v2; grant execute on function public.equora_authorize_provider_capture_request_v2(uuid,uuid,bigint,uuid,bigint,integer,bigint,bigint,text,text,text,text,timestamptz,text) to anon; reset role; revoke equora_broker_runtime_v2 from postgres granted by postgres; select equora_private.equora_verify_multibroker_mb3_v1();" 'MB3_FUNCTION_GRANT_DRIFT' 'Anon request RPC drift' | Out-Null
  Invoke-Mb3SqlTextExpectFailure "begin; grant equora_broker_runtime_v2 to postgres; set local role equora_broker_runtime_v2; grant execute on function public.equora_commit_provider_capture_page_v2(uuid,uuid,uuid,bigint,bigint,bigint,bigint,text,integer,text,jsonb,text,text,jsonb,text,text,text,text) to authenticated; reset role; revoke equora_broker_runtime_v2 from postgres granted by postgres; select equora_private.equora_verify_multibroker_mb3_v1();" 'MB3_FUNCTION_GRANT_DRIFT' 'Authenticated commit RPC drift' | Out-Null
  $overloadMutation = @'
begin;
grant create on schema public to equora_broker_runtime_v2;
grant equora_broker_runtime_v2 to postgres;
set local role equora_broker_runtime_v2;
create function public.equora_authorize_provider_capture_request_v2(p_probe text)
returns jsonb language sql security definer set search_path = ''
as $$ select jsonb_build_object('status','unexpected_overload') $$;
revoke all on function public.equora_authorize_provider_capture_request_v2(text)
  from public, anon, authenticated, equora_broker_operator_control_v2;
grant execute on function public.equora_authorize_provider_capture_request_v2(text)
  to service_role;
reset role;
revoke create on schema public from equora_broker_runtime_v2;
revoke equora_broker_runtime_v2 from postgres granted by postgres;
select equora_private.equora_verify_multibroker_mb3_v1();
'@
  Invoke-Mb3SqlTextExpectFailure $overloadMutation 'MB3_FUNCTION_SIGNATURE_DRIFT' 'Additional authority RPC overload drift' | Out-Null
  Invoke-Mb3SqlTextExpectFailure "begin; alter role equora_broker_runtime_v2 connection limit 7; select equora_private.equora_verify_multibroker_mb3_v1();" 'MB3_AUTHORITY_ROLE_DRIFT' 'Runtime role attribute drift' | Out-Null
  Invoke-Mb3SqlTextExpectFailure 'begin; grant equora_broker_runtime_v2 to postgres; set local role equora_broker_runtime_v2; drop policy "users can read own broker_capture_checkpoints_v2" on public.broker_capture_checkpoints_v2; create policy "users can read own broker_capture_checkpoints_v2" on public.broker_capture_checkpoints_v2 for select to authenticated using (true); reset role; revoke equora_broker_runtime_v2 from postgres granted by postgres; select equora_private.equora_verify_multibroker_mb3_v1();' 'MB3_RLS_POLICY_DRIFT' 'Tenant select policy drift' | Out-Null
  Invoke-Mb3SqlTextExpectFailure "begin; grant equora_broker_operator_control_v2 to postgres; set local role equora_broker_operator_control_v2; drop policy broker_enrollments_mb3_runtime_lock on public.broker_runtime_enrollments_v2; create policy broker_enrollments_mb3_runtime_lock on public.broker_runtime_enrollments_v2 for update to equora_broker_runtime_v2 using (true) with check (true); reset role; revoke equora_broker_operator_control_v2 from postgres granted by postgres; select equora_private.equora_verify_multibroker_mb3_v1();" 'MB3_RLS_POLICY_DRIFT' 'Runtime lock policy drift' | Out-Null
  $publicPolicyTargets = @(
    @{ Schema = 'public'; Table = 'broker_accounts'; Policy = 'mb3_unexpected_public_accounts_update' },
    @{ Schema = 'public'; Table = 'broker_sync_activations'; Policy = 'mb3_unexpected_public_activations_update' },
    @{ Schema = 'public'; Table = 'broker_sync_scopes'; Policy = 'mb3_unexpected_public_scopes_update' },
    @{ Schema = 'public'; Table = 'broker_capture_work_units'; Policy = 'mb3_unexpected_public_work_units_update' },
    @{ Schema = 'equora_private'; Table = 'broker_capture_integrity_keys'; Policy = 'mb3_unexpected_public_keys_update' }
  )
  foreach ($target in $publicPolicyTargets) {
    $mutation = "begin; create policy $($target.Policy) on $($target.Schema).$($target.Table) for update to public using (true) with check (true); select equora_private.equora_verify_multibroker_mb3_v1();"
    Invoke-Mb3SqlTextExpectFailure $mutation 'MB3_RLS_POLICY_DRIFT' "Unexpected PUBLIC policy drift on $($target.Schema).$($target.Table)" | Out-Null
  }
  Invoke-Mb3SqlTextExpectFailure "begin; grant equora_broker_operator_control_v2 to postgres; set local role equora_broker_operator_control_v2; grant execute on function public.equora_lock_provider_capability_contract_v2(text,text,text,text) to anon; reset role; revoke equora_broker_operator_control_v2 from postgres granted by postgres; select equora_private.equora_verify_multibroker_mb3_v1();" 'MB3_REGISTRY_LOCK_AUTHORITY_DRIFT' 'Registry lock helper ACL drift' | Out-Null
  Invoke-Mb3SqlTextExpectFailure "begin; grant equora_broker_runtime_v2 to postgres; set local role equora_broker_runtime_v2; alter table public.broker_capture_page_commits_v2 drop constraint broker_capture_page_commits_v2_enrollment_fkey; reset role; revoke equora_broker_runtime_v2 from postgres granted by postgres; select equora_private.equora_verify_multibroker_mb3_v1();" 'MB3_FK_INDEX_CONTRACT_DRIFT' 'FK drift' | Out-Null
  Invoke-Mb3SqlTextExpectFailure "begin; grant equora_broker_runtime_v2 to postgres; set local role equora_broker_runtime_v2; drop index public.idx_broker_runtime_receipts_v2_owner_keyset; reset role; revoke equora_broker_runtime_v2 from postgres granted by postgres; select equora_private.equora_verify_multibroker_mb3_v1();" 'MB3_FK_INDEX_CONTRACT_DRIFT' 'Index drift' | Out-Null
  $state = Get-Mb3Scalar "select response_contract_version,(select contract_fingerprint from equora_private.schema_migrations where migration_id='equora_v57.61.0_multibroker_mb3_v1'),(select relrowsecurity from pg_class where oid='public.broker_capture_page_commits_v2'::regclass),has_table_privilege('service_role','public.broker_capture_page_commits_v2','insert'),(select count(*) from pg_constraint where conname='broker_capture_page_commits_v2_enrollment_fkey'),to_regclass('public.idx_broker_runtime_receipts_v2_owner_keyset') is not null,(select count(*) from pg_policies where policyname like 'mb3_unexpected_public_%'),(select count(*) from pg_proc procedure_row join pg_namespace namespace_row on namespace_row.oid=procedure_row.pronamespace where namespace_row.nspname='public' and procedure_row.proname in ('equora_lock_provider_capability_contract_v2','equora_apply_broker_operator_command_v2','equora_authorize_provider_capture_request_v2','equora_commit_provider_capture_page_v2')) from public.broker_provider_capability_contracts_v2 where capability_id='historical_orders_v1';"
  if ($state -notmatch '^mexc_historical_orders_response_v1\|32b297e73ce92932eb494296f242794e5a36c4dfdcaed0043ba6458dad0c9c19\|t\|f\|1\|t\|0\|4$') { throw "Drift rollback invalid: $state" }
  Write-Output 'MB3 drift gate PASS (registry, role attributes, exact RLS policies, closed cross-role table/RPC/helper ACL and exact RPC signature set, marker, FK and index drift rejected without durable effects).'
}
finally { if (-not $KeepDatabase) { Remove-Mb3Database } }
