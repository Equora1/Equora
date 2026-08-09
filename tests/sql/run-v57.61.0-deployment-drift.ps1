param(
  [string]$ContainerName = 'equora-v5761-scheduler-pgtest',
  [string]$TemplateDatabase = 'equora_full_deployment_drift_template'
)

$ErrorActionPreference = 'Stop'

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TemplateDatabase -notmatch '^equora_full_deployment_[a-z0-9_]+$') {
  throw 'TemplateDatabase must use the equora_full_deployment_ prefix.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$supabaseRoot = Join-Path $repoRoot 'supabase'
$fullDeploymentRunner = Join-Path $PSScriptRoot 'run-v57.61.0-deployment.ps1'
$baselineDatabase = 'equora_full_deployment_drift_baseline'
$partialDatabase = 'equora_full_deployment_drift_partial'
$driftRole = 'equora_v5761_drift_probe'
$deploymentPaths = @(
  'schema-patch-v57.61.0.sql',
  'schema-patch-v57.61.0-g1-capture-control.sql',
  'schema-patch-v57.61.0-g1-lane-authority.sql',
  'schema-patch-v57.61.0-g1-activation-authority.sql',
  'schema-patch-v57.61.0-g1-scheduler-control.sql',
  'schema-patch-v57.61.0-g1-runtime-deployment.sql'
)

function Read-Utf8File {
  param([Parameter(Mandatory = $true)][string]$Path)
  return Get-Content -Raw -Encoding utf8 -LiteralPath $Path
}

function Expand-DeploymentDriver {
  $sql = Read-Utf8File (Join-Path $supabaseRoot 'deploy-v57.61.0.sql')
  foreach ($path in $deploymentPaths) {
    $sql = $sql.Replace("\ir $path", (Read-Utf8File (Join-Path $supabaseRoot $path)))
  }
  return $sql
}

function Expand-Preflight {
  $sql = Read-Utf8File (Join-Path $supabaseRoot 'preflight-v57.61.0.sql')
  $sql = $sql.Replace(
    '\ir verify-v57.60.1-baseline.sql',
    (Read-Utf8File (Join-Path $supabaseRoot 'verify-v57.60.1-baseline.sql'))
  )
  return $sql.Replace(
    '\ir verify-v57.61.0-contract.sql',
    (Read-Utf8File (Join-Path $supabaseRoot 'verify-v57.61.0-contract.sql'))
  )
}

function Expand-Postflight {
  $sql = Read-Utf8File (Join-Path $supabaseRoot 'postflight-v57.61.0.sql')
  return $sql.Replace(
    '\ir verify-v57.61.0-contract.sql',
    (Read-Utf8File (Join-Path $supabaseRoot 'verify-v57.61.0-contract.sql'))
  )
}

function Invoke-AdminSql {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$Sql
  )
  $ErrorActionPreference = 'Continue'
  $output = & docker exec $ContainerName psql -U postgres -d $Database `
    -v ON_ERROR_STOP=1 -c $Sql 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($exitCode -ne 0) {
    throw "Administrative SQL failed: $($output -join [Environment]::NewLine)"
  }
}

function Reset-AuthorityRoleDrift {
  Invoke-AdminSql -Database 'postgres' -Sql @'
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'equora_broker_capture_owner') then
    execute 'alter role equora_broker_capture_owner nologin';
    if exists (select 1 from pg_roles where rolname = 'equora_v5761_drift_probe') then
      execute 'revoke equora_broker_capture_owner from equora_v5761_drift_probe';
    end if;
  end if;
end;
$$;
'@
}

function Invoke-SqlText {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$Sql,
    [Parameter(Mandatory = $true)][string]$Phase
  )
  $ErrorActionPreference = 'Continue'
  $output = $Sql | & docker exec -i $ContainerName psql -U postgres `
    -d $Database -v ON_ERROR_STOP=1 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  if ($exitCode -ne 0) {
    throw "${Phase} failed: $($output -join [Environment]::NewLine)"
  }
}

function Invoke-ExpectedFailure {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$ExpectedCode
  )
  $session = (Expand-Preflight) `
    + "`n" + (Expand-DeploymentDriver) `
    + "`n" + (Expand-Postflight)
  $ErrorActionPreference = 'Continue'
  $output = $session | & docker exec -i $ContainerName psql -U postgres `
    -d $Database -v ON_ERROR_STOP=1 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  $text = $output -join "`n"
  if ($exitCode -eq 0 -or $text -notmatch [regex]::Escape($ExpectedCode)) {
    throw "Drift mutant did not fail with ${ExpectedCode}: $text"
  }
}

function Invoke-ExpectedPreflightFailureAsRole {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$Role,
    [Parameter(Mandatory = $true)][string]$ExpectedCode
  )
  if ($Role -notmatch '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$') {
    throw 'Role contains unsupported characters.'
  }
  $session = "set role $Role;`n" + (Expand-Preflight)
  $ErrorActionPreference = 'Continue'
  $output = $session | & docker exec -i $ContainerName psql -U postgres `
    -d $Database -v ON_ERROR_STOP=1 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  $text = $output -join "`n"
  if ($exitCode -eq 0 -or $text -notmatch [regex]::Escape($ExpectedCode)) {
    throw "Role-bound Preflight did not fail with ${ExpectedCode}: $text"
  }
}

$mutants = @(
  @{
    Name = 'column';
    Sql = 'grant equora_broker_capture_owner to postgres with set true; set role equora_broker_capture_owner; alter table public.broker_connection_setup_commands add column drift_probe text; reset role; revoke equora_broker_capture_owner from postgres;';
    Expected = 'POSTFLIGHT_COLUMN_CONTRACT_DRIFT'
  },
  @{
    Name = 'table_acl';
    Sql = 'grant select on table public.broker_raw_responses to equora_v5761_drift_probe;';
    Expected = 'POSTFLIGHT_RELATION_SECURITY_CONTRACT_DRIFT'
  },
  @{
    Name = 'function_config';
    Sql = "grant equora_broker_capture_owner to postgres with set true; set role equora_broker_capture_owner; alter function public.equora_find_claimable_broker_capture_work_unit_v1() set statement_timeout = '6s'; reset role; revoke equora_broker_capture_owner from postgres;";
    Expected = 'POSTFLIGHT_FUNCTION_CONTRACT_DRIFT'
  },
  @{
    Name = 'credential_acl';
    Sql = 'grant select on table public.broker_credentials to equora_v5761_drift_probe;';
    Expected = 'POSTFLIGHT_RELATION_SECURITY_CONTRACT_DRIFT'
  },
  @{
    Name = 'trigger';
    Sql = 'alter table public.trade_media disable trigger equora_trade_media_cleanup_v1;';
    Expected = 'POSTFLIGHT_TRIGGER_CONTRACT_DRIFT'
  },
  @{
    Name = 'public_table_rls';
    Sql = 'alter table public.trades disable row level security;';
    Expected = 'POSTFLIGHT_RELATION_SECURITY_CONTRACT_DRIFT'
  },
  @{
    Name = 'schema_public_acl';
    Sql = 'grant create on schema public to equora_v5761_drift_probe;';
    Expected = 'POSTFLIGHT_SCHEMA_ACL_CONTRACT_DRIFT'
  },
  @{
    Name = 'schema_private_acl';
    Sql = 'grant create on schema equora_private to equora_v5761_drift_probe;';
    Expected = 'POSTFLIGHT_SCHEMA_ACL_CONTRACT_DRIFT'
  },
  @{
    Name = 'schema_auth_usage';
    Sql = 'revoke usage on schema auth from equora_broker_capture_owner;';
    Expected = 'POSTFLIGHT_PLATFORM_SECURITY_CONTRACT_DRIFT'
  },
  @{
    Name = 'schema_auth_foreign_create';
    Sql = 'grant create on schema auth to equora_v5761_drift_probe;';
    Expected = 'PREFLIGHT_PLATFORM_SECURITY_INVALID'
  },
  @{
    Name = 'schema_owner';
    Sql = 'grant equora_v5761_drift_probe to postgres with set true; alter schema equora_private owner to equora_v5761_drift_probe; revoke equora_v5761_drift_probe from postgres;';
    Expected = 'POSTFLIGHT_SCHEMA_ACL_CONTRACT_DRIFT'
  },
  @{
    Name = 'owner_login';
    Sql = 'alter role equora_broker_capture_owner login;';
    Expected = 'POSTFLIGHT_AUTHORITY_SECURITY_CONTRACT_DRIFT'
  },
  @{
    Name = 'owner_membership';
    Sql = 'grant equora_broker_capture_owner to equora_v5761_drift_probe with set true;';
    Expected = 'POSTFLIGHT_AUTHORITY_SECURITY_CONTRACT_DRIFT'
  },
  @{
    Name = 'owner_schema_create';
    Sql = 'grant create on schema public to equora_broker_capture_owner;';
    Expected = 'POSTFLIGHT_SCHEMA_ACL_CONTRACT_DRIFT'
  }
)

try {
  Reset-AuthorityRoleDrift
  Invoke-AdminSql -Database 'postgres' `
    -Sql "drop role if exists $driftRole; create role $driftRole nologin;"
  Invoke-AdminSql -Database 'postgres' `
    -Sql "drop database if exists $baselineDatabase with (force);"
  Invoke-AdminSql -Database 'postgres' `
    -Sql "create database $baselineDatabase template template0;"
  foreach ($path in @(
    (Join-Path $PSScriptRoot 'equora-local-supabase-stubs.sql'),
    (Join-Path $supabaseRoot 'schema.sql'),
    (Join-Path $supabaseRoot 'schema-patch-v57.60.1.sql')
  )) {
    Invoke-SqlText -Database $baselineDatabase -Sql (Read-Utf8File $path) `
      -Phase "Baseline $path"
  }
  Invoke-AdminSql -Database 'postgres' `
    -Sql "grant $driftRole to postgres with inherit false, set true;"
  try {
    Invoke-ExpectedPreflightFailureAsRole -Database $baselineDatabase `
      -Role $driftRole -ExpectedCode 'PREFLIGHT_EXECUTOR_CAPABILITY_INVALID'
  }
  finally {
    Invoke-AdminSql -Database 'postgres' `
      -Sql "revoke $driftRole from postgres;"
  }
  Invoke-AdminSql -Database $baselineDatabase `
    -Sql 'alter table public.trades add column drift_probe text;'
  Invoke-ExpectedFailure -Database $baselineDatabase `
    -ExpectedCode 'PREFLIGHT_BASELINE_CONTRACT_DRIFT'
  Invoke-AdminSql -Database 'postgres' `
    -Sql "drop database if exists $baselineDatabase with (force);"

  # A marker-free equora_private schema is an unsupported preexisting surface.
  # Fresh installation requires complete absence so CREATE IF NOT EXISTS can
  # never adopt a partial or foreign-owned private schema after DDL begins.
  Invoke-AdminSql -Database 'postgres' `
    -Sql "create database $baselineDatabase template template0;"
  foreach ($path in @(
    (Join-Path $PSScriptRoot 'equora-local-supabase-stubs.sql'),
    (Join-Path $supabaseRoot 'schema.sql'),
    (Join-Path $supabaseRoot 'schema-patch-v57.60.1.sql')
  )) {
    Invoke-SqlText -Database $baselineDatabase -Sql (Read-Utf8File $path) `
      -Phase "Baseline $path"
  }
  Invoke-AdminSql -Database $baselineDatabase -Sql @'
create schema if not exists equora_private;
create table equora_private.schema_migrations (
  migration_id text primary key,
  contract_fingerprint text not null,
  applied_at timestamptz not null default now()
);
alter table public.trades add column marker_free_drift text;
'@
  Invoke-ExpectedFailure -Database $baselineDatabase `
    -ExpectedCode 'PREFLIGHT_PRIVATE_SCHEMA_STATE_INVALID'
  Invoke-AdminSql -Database 'postgres' `
    -Sql "drop database if exists $baselineDatabase with (force);"

  # The platform-managed auth schema is checked as a closed allowlist before
  # DDL. A project-specific CREATE grantee is unsupported and fails early.
  Invoke-AdminSql -Database 'postgres' `
    -Sql "create database $baselineDatabase template template0;"
  foreach ($path in @(
    (Join-Path $PSScriptRoot 'equora-local-supabase-stubs.sql'),
    (Join-Path $supabaseRoot 'schema.sql'),
    (Join-Path $supabaseRoot 'schema-patch-v57.60.1.sql')
  )) {
    Invoke-SqlText -Database $baselineDatabase -Sql (Read-Utf8File $path) `
      -Phase "Baseline $path"
  }
  Invoke-AdminSql -Database $baselineDatabase `
    -Sql 'grant create on schema auth to equora_v5761_drift_probe;'
  Invoke-ExpectedFailure -Database $baselineDatabase `
    -ExpectedCode 'PREFLIGHT_PLATFORM_SECURITY_INVALID'
  Invoke-AdminSql -Database 'postgres' `
    -Sql "drop database if exists $baselineDatabase with (force);"

  Invoke-AdminSql -Database 'postgres' `
    -Sql "create database $baselineDatabase template template0;"
  foreach ($path in @(
    (Join-Path $PSScriptRoot 'equora-local-supabase-stubs.sql'),
    (Join-Path $supabaseRoot 'schema.sql'),
    (Join-Path $supabaseRoot 'schema-patch-v57.60.1.sql')
  )) {
    Invoke-SqlText -Database $baselineDatabase -Sql (Read-Utf8File $path) `
      -Phase "Baseline $path"
  }
  Invoke-AdminSql -Database $baselineDatabase `
    -Sql 'alter table public.trade_media disable trigger equora_trade_media_cleanup_v1;'
  Invoke-ExpectedFailure -Database $baselineDatabase `
    -ExpectedCode 'PREFLIGHT_BASELINE_CONTRACT_DRIFT'
  Invoke-AdminSql -Database 'postgres' `
    -Sql "drop database if exists $baselineDatabase with (force);"

  # A foreign or grantable default privilege can leak authority as soon as an
  # early layer commits. It therefore has to fail before the first v57.61 DDL,
  # not only in the final all-object postflight.
  Invoke-AdminSql -Database 'postgres' `
    -Sql "create database $baselineDatabase template template0;"
  foreach ($path in @(
    (Join-Path $PSScriptRoot 'equora-local-supabase-stubs.sql'),
    (Join-Path $supabaseRoot 'schema.sql'),
    (Join-Path $supabaseRoot 'schema-patch-v57.60.1.sql')
  )) {
    Invoke-SqlText -Database $baselineDatabase -Sql (Read-Utf8File $path) `
      -Phase "Baseline $path"
  }
  Invoke-AdminSql -Database $baselineDatabase `
    -Sql 'alter default privileges for role postgres in schema public grant select on tables to equora_v5761_drift_probe;'
  Invoke-ExpectedFailure -Database $baselineDatabase `
    -ExpectedCode 'PREFLIGHT_DEFAULT_ACL_INVALID'
  Invoke-AdminSql -Database 'postgres' `
    -Sql "drop database if exists $baselineDatabase with (force);"

  # PUBLIC is not a harmless default grantee for relations. A table SELECT
  # default would be inherited by Layer-1 Broker tables before the final global
  # ACL postflight and therefore must fail before any v57.61 DDL can commit.
  Invoke-AdminSql -Database 'postgres' `
    -Sql "create database $baselineDatabase template template0;"
  foreach ($path in @(
    (Join-Path $PSScriptRoot 'equora-local-supabase-stubs.sql'),
    (Join-Path $supabaseRoot 'schema.sql'),
    (Join-Path $supabaseRoot 'schema-patch-v57.60.1.sql')
  )) {
    Invoke-SqlText -Database $baselineDatabase -Sql (Read-Utf8File $path) `
      -Phase "Baseline $path"
  }
  Invoke-AdminSql -Database $baselineDatabase `
    -Sql 'alter default privileges for role postgres in schema public grant select on tables to public;'
  Invoke-ExpectedFailure -Database $baselineDatabase `
    -ExpectedCode 'PREFLIGHT_DEFAULT_ACL_INVALID'
  Invoke-AdminSql -Database $baselineDatabase `
    -Sql "do `$`$ begin if to_regclass('equora_private.schema_migrations') is not null then raise exception 'PUBLIC_DEFAULT_ACL_REACHED_DDL'; end if; end `$`$;"
  Invoke-AdminSql -Database 'postgres' `
    -Sql "drop database if exists $baselineDatabase with (force);"

  # A marker-free baseline also binds the public schema owner and complete ACL,
  # not only the objects contained in the schema.
  Invoke-AdminSql -Database 'postgres' `
    -Sql "create database $baselineDatabase template template0;"
  foreach ($path in @(
    (Join-Path $PSScriptRoot 'equora-local-supabase-stubs.sql'),
    (Join-Path $supabaseRoot 'schema.sql'),
    (Join-Path $supabaseRoot 'schema-patch-v57.60.1.sql')
  )) {
    Invoke-SqlText -Database $baselineDatabase -Sql (Read-Utf8File $path) `
      -Phase "Baseline $path"
  }
  Invoke-AdminSql -Database $baselineDatabase `
    -Sql 'grant create on schema public to equora_v5761_drift_probe;'
  Invoke-ExpectedFailure -Database $baselineDatabase `
    -ExpectedCode 'PREFLIGHT_BASELINE_CONTRACT_DRIFT'
  Invoke-AdminSql -Database 'postgres' `
    -Sql "drop database if exists $baselineDatabase with (force);"

  # Partial deployment is restore-only: it must fail before a fourth marker or
  # any downstream DDL can be committed.
  Invoke-AdminSql -Database 'postgres' `
    -Sql "drop database if exists $partialDatabase with (force);"
  Invoke-AdminSql -Database 'postgres' `
    -Sql "create database $partialDatabase template template0;"
  foreach ($path in @(
    (Join-Path $PSScriptRoot 'equora-local-supabase-stubs.sql'),
    (Join-Path $supabaseRoot 'schema.sql'),
    (Join-Path $supabaseRoot 'schema-patch-v57.60.1.sql'),
    (Join-Path $supabaseRoot $deploymentPaths[0]),
    (Join-Path $supabaseRoot $deploymentPaths[1]),
    (Join-Path $supabaseRoot $deploymentPaths[2])
  )) {
    Invoke-SqlText -Database $partialDatabase -Sql (Read-Utf8File $path) `
      -Phase "Partial fixture $path"
  }
  Invoke-ExpectedFailure -Database $partialDatabase `
    -ExpectedCode 'PREFLIGHT_PARTIAL_MIGRATION_RESTORE_REQUIRED'
  Invoke-SqlText -Database $partialDatabase -Phase 'Partial marker no-effect oracle' -Sql @'
do $$ begin
  if (select count(*) from equora_private.schema_migrations
      where migration_id like 'equora_v57.61.0%') <> 3
    or to_regclass('public.broker_sync_activation_commands') is not null
  then raise exception 'PARTIAL_PREFLIGHT_MUTATED_DATABASE'; end if;
end $$;
'@
  Invoke-AdminSql -Database 'postgres' `
    -Sql "drop database if exists $partialDatabase with (force);"

  & $fullDeploymentRunner -ContainerName $ContainerName `
    -TestDatabase $TemplateDatabase -KeepDatabase
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create the full-stack drift template.' }

  foreach ($mutant in $mutants) {
    $database = "equora_full_deployment_drift_$($mutant.Name)"
    Invoke-AdminSql -Database 'postgres' `
      -Sql "drop database if exists $database with (force);"
    Invoke-AdminSql -Database 'postgres' `
      -Sql "create database $database template $TemplateDatabase;"
    try {
      Invoke-AdminSql -Database $database -Sql $mutant.Sql
      Invoke-ExpectedFailure -Database $database -ExpectedCode $mutant.Expected
    }
    finally {
      Reset-AuthorityRoleDrift
      Invoke-AdminSql -Database 'postgres' `
        -Sql "drop database if exists $database with (force);"
    }
  }

  Write-Output 'Full v57.61.0 marker-skip drift matrix passed.'
}
finally {
  Reset-AuthorityRoleDrift
  Invoke-AdminSql -Database 'postgres' `
    -Sql "drop database if exists $baselineDatabase with (force);"
  Invoke-AdminSql -Database 'postgres' `
    -Sql "drop database if exists $partialDatabase with (force);"
  Invoke-AdminSql -Database 'postgres' `
    -Sql "drop database if exists $TemplateDatabase with (force);"
  Invoke-AdminSql -Database 'postgres' `
    -Sql "drop role if exists $driftRole;"
}
