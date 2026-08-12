param(
  [string]$ContainerName = 'equora-v5761-pgtest',
  [string]$TemplateDatabase = 'equora_remediation',
  [string]$TestDatabase = 'equora_capture_activation_authority_drift_v5761'
)

$ErrorActionPreference = 'Stop'

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TemplateDatabase -notmatch '^equora_[a-z0-9_]+$') {
  throw 'TemplateDatabase must be an explicitly named Equora test database.'
}
if ($TestDatabase -notmatch '^equora_capture_activation_authority_drift_[a-z0-9_]+$') {
  throw 'TestDatabase must use the equora_capture_activation_authority_drift_ prefix.'
}

$migrationPath = Join-Path (Split-Path $PSScriptRoot -Parent) '..\supabase\schema-patch-v57.61.0-g1-activation-authority.sql'
$migrationPath = [System.IO.Path]::GetFullPath($migrationPath)
$migrationSql = Get-Content -Raw -LiteralPath $migrationPath
$captureControlPath = Join-Path (Split-Path $PSScriptRoot -Parent) '..\supabase\schema-patch-v57.61.0-g1-capture-control.sql'
$captureControlPath = [System.IO.Path]::GetFullPath($captureControlPath)
$captureControlSql = Get-Content -Raw -LiteralPath $captureControlPath
$aclProbeRole = 'equora_activation_acl_probe'

function Initialize-TestDatabase {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to remove the prior activation-authority drift database.' }
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "create database $TestDatabase template $TemplateDatabase;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create the activation-authority drift database.' }
}

function Invoke-ExpectedMigrationFailure {
  param([Parameter(Mandatory = $true)][string]$ExpectedCode)
  $priorErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = $migrationSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  $migrationExitCode = $LASTEXITCODE
  $ErrorActionPreference = $priorErrorActionPreference
  if ($migrationExitCode -eq 0 -or ($output -join [Environment]::NewLine) -notmatch $ExpectedCode) {
    throw "Expected $ExpectedCode, got: $($output -join [Environment]::NewLine)"
  }
}

function Invoke-MigrationSuccess {
  $priorErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = $migrationSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  $migrationExitCode = $LASTEXITCODE
  $ErrorActionPreference = $priorErrorActionPreference
  if ($migrationExitCode -ne 0) {
    throw "Expected migration success, got: $($output -join [Environment]::NewLine)"
  }
}

function Invoke-CaptureControlMigrationSuccess {
  $priorErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = $captureControlSql | & docker exec -i $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  $migrationExitCode = $LASTEXITCODE
  $ErrorActionPreference = $priorErrorActionPreference
  if ($migrationExitCode -ne 0) {
    throw "Expected downstream-aware Capture-Control success, got: $($output -join [Environment]::NewLine)"
  }
}

try {
  Initialize-TestDatabase
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "alter table public.broker_sync_activation_commands drop constraint broker_sync_activation_commands_status_check; alter table public.broker_sync_activation_commands add constraint broker_sync_activation_commands_status_check check (command_status in ('pending','applied','rejected','ignored'));" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to arm the constraint-definition drift case.' }
  Invoke-ExpectedMigrationFailure -ExpectedCode 'ACTIVATION_AUTHORITY_CONSTRAINT_DEFINITION_DRIFT'

  Initialize-TestDatabase
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "drop index public.broker_sync_gaps_open_identity_unique; create index broker_sync_gaps_open_identity_unique on public.broker_sync_gaps (id);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to arm the index-definition drift case.' }
  Invoke-ExpectedMigrationFailure -ExpectedCode 'ACTIVATION_AUTHORITY_INDEX_DEFINITION_DRIFT'

  Initialize-TestDatabase
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop role if exists $aclProbeRole; create role $aclProbeRole login noinherit;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create the isolated ACL probe role.' }
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "grant equora_broker_capture_owner to postgres with set true; set role equora_broker_capture_owner; grant execute on function public.equora_apply_broker_sync_activation_command_v1(uuid) to $aclProbeRole; reset role; revoke equora_broker_capture_owner from postgres; grant execute on function public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text) to $aclProbeRole; grant execute on function public.equora_commit_broker_capture_page_v1(uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamptz,timestamptz,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb) to $aclProbeRole; grant execute on function public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text) to $aclProbeRole; grant select on table public.broker_sync_activation_commands to $aclProbeRole;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to arm the arbitrary ACL drift case.' }
  Invoke-MigrationSuccess
  $aclProbe = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select has_function_privilege('$aclProbeRole','public.equora_apply_broker_sync_activation_command_v1(uuid)','execute')::text || '|' || has_function_privilege('$aclProbeRole','public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)','execute')::text || '|' || has_function_privilege('$aclProbeRole','public.equora_commit_broker_capture_page_v1(uuid,uuid,uuid,uuid,uuid,integer,text,text,text,text,uuid,bigint,text,bigint,uuid,integer,text,text,text,jsonb,text,timestamp with time zone,timestamp with time zone,integer,integer,text,text,text,text,integer,text,jsonb,text,jsonb,text,text,text,integer,jsonb)','execute')::text || '|' || has_function_privilege('$aclProbeRole','public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)','execute')::text || '|' || has_table_privilege('$aclProbeRole','public.broker_sync_activation_commands','select')::text || '|' || (select pg_get_userbyid(relowner) from pg_class where oid = 'public.broker_sync_activation_commands'::regclass);"
  if ($LASTEXITCODE -ne 0 -or ($aclProbe -join '').Trim() -ne 'false|false|false|false|false|postgres') {
    throw "ACTIVATION_AUTHORITY_ACL_NORMALIZATION_FAILED: $($aclProbe -join [Environment]::NewLine)"
  }

  Invoke-CaptureControlMigrationSuccess
  $crossLayerAcl = & docker exec $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1 -c "select has_function_privilege('service_role','public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)','execute')::text || '|' || has_function_privilege('service_role','public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)','execute')::text || '|' || has_function_privilege('equora_broker_capture_owner','public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text)','execute')::text || '|' || has_function_privilege('equora_broker_capture_owner','public.equora_record_broker_capture_failure_v1(uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)','execute')::text || '|' || has_function_privilege('service_role','public.equora_claim_broker_capture_work_unit_v2(uuid,bigint,uuid,uuid,text)','execute')::text || '|' || has_function_privilege('service_role','public.equora_record_broker_capture_failure_v2(uuid,timestamp with time zone,uuid,bigint,uuid,uuid,integer,text,text,text,text,integer,integer,integer,text)','execute')::text;"
  if ($LASTEXITCODE -ne 0 -or ($crossLayerAcl -join '').Trim() -ne 'false|false|true|true|true|true') {
    throw "ACTIVATION_AUTHORITY_CROSS_LAYER_RERUN_FAILED: $($crossLayerAcl -join [Environment]::NewLine)"
  }

  Initialize-TestDatabase
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "grant $aclProbeRole to postgres with set true; grant create on schema public to $aclProbeRole; alter table public.broker_sync_activation_commands owner to $aclProbeRole; revoke create on schema public from $aclProbeRole; revoke $aclProbeRole from postgres;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to arm the authority-table owner drift case.' }
  Invoke-ExpectedMigrationFailure -ExpectedCode 'ACTIVATION_AUTHORITY_TABLE_OWNER_DRIFT'

  Initialize-TestDatabase
  & docker exec $ContainerName psql -U postgres -d $TestDatabase -v ON_ERROR_STOP=1 -c "grant $aclProbeRole to postgres with set true; grant create on schema public to $aclProbeRole; alter function public.equora_claim_broker_capture_work_unit_v1(uuid,bigint,uuid,uuid,text) owner to $aclProbeRole; revoke create on schema public from $aclProbeRole; revoke $aclProbeRole from postgres;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to arm the v1 core function-owner drift case.' }
  Invoke-ExpectedMigrationFailure -ExpectedCode 'ACTIVATION_AUTHORITY_V1_CORE_CONFIG_DRIFT'

  Write-Output 'Broker capture activation-authority semantic drift integration passed.'
}
finally {
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists $TestDatabase with (force);" | Out-Null
  & docker exec $ContainerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "drop role if exists $aclProbeRole;" | Out-Null
}
