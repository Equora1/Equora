param(
  [string]$ContainerName = 'equora-v5761-hosted-compat-pgtest',
  [string]$Image = 'postgres:17-alpine'
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($Image -notmatch '^[a-zA-Z0-9][a-zA-Z0-9./:_-]{1,255}$') {
  throw 'Image contains unsupported characters.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$supabaseRoot = Join-Path $repoRoot 'supabase'
$fixturePath = Join-Path $PSScriptRoot 'equora-hosted-supabase-v17-stubs.sql'
$baselinePaths = @('schema.sql', 'schema-patch-v57.60.1.sql')
$deploymentPaths = @(
  'schema-patch-v57.61.0.sql',
  'schema-patch-v57.61.0-g1-capture-control.sql',
  'schema-patch-v57.61.0-g1-lane-authority.sql',
  'schema-patch-v57.61.0-g1-activation-authority.sql',
  'schema-patch-v57.61.0-g1-scheduler-control.sql',
  'schema-patch-v57.61.0-g1-runtime-deployment.sql',
  'schema-patch-v57.61.0-g1-broker-provider-rls.sql'
)
$adminRole = 'equora_hosted_fixture_admin'
$baselineDatabase = 'equora_hosted_v57601_template'
$fullDatabase = 'equora_hosted_v5761_full'
$emptyDatabase = 'equora_hosted_v5761_empty'
$containerStarted = $false

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

function Invoke-SqlText {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$Role,
    [Parameter(Mandatory = $true)][string]$Sql,
    [Parameter(Mandatory = $true)][string]$Phase,
    [switch]$AllowFailure
  )
  $ErrorActionPreference = 'Continue'
  $output = $Sql | & docker exec -i $ContainerName psql -U $Role `
    -d $Database -At -v ON_ERROR_STOP=1 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  $text = $output -join "`n"
  if (-not $AllowFailure -and $exitCode -ne 0) {
    throw "${Phase} failed: $text"
  }
  return [pscustomobject]@{ ExitCode = $exitCode; Text = $text }
}

function Invoke-AdminSql {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$Sql
  )
  $result = Invoke-SqlText -Database $Database -Role $adminRole -Sql $Sql `
    -Phase 'Hosted fixture admin SQL'
  return $result.Text
}

function Assert-PreflightFailure {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$ExpectedCode
  )
  $result = Invoke-SqlText -Database $Database -Role 'postgres' `
    -Sql (Expand-Preflight) -Phase "Preflight mutant $Database" -AllowFailure
  if ($result.ExitCode -eq 0 -or
      $result.Text -notmatch [regex]::Escape($ExpectedCode)) {
    throw "Expected $ExpectedCode for ${Database}: $($result.Text)"
  }
  $effect = (Invoke-AdminSql -Database $Database -Sql @'
select (to_regnamespace('equora_private') is null
  and to_regclass('equora_private.schema_migrations') is null
  and to_regprocedure(
    'equora_private.equora_request_context_uid_v1()'
  ) is null)::text;
'@).Trim()
  if ($effect -ne 'true') {
    throw "Failed Preflight left a v57.61 DDL effect in ${Database}: $effect"
  }
}

function New-MutantDatabase {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Mutation
  )
  Invoke-AdminSql -Database 'postgres' -Sql `
    "create database $Name template $baselineDatabase owner postgres;" | Out-Null
  Invoke-AdminSql -Database $Name -Sql $Mutation | Out-Null
  Assert-PreflightFailure -Database $Name `
    -ExpectedCode 'PREFLIGHT_PLATFORM_SECURITY_INVALID'
  Invoke-AdminSql -Database 'postgres' -Sql `
    "drop database $Name with (force);" | Out-Null
}

try {
  & docker image inspect $Image --format '{{.Id}}' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'LOCAL_POSTGRES17_IMAGE_MISSING' }
  $existing = & docker ps -a --filter "name=^${ContainerName}$" --format '{{.Names}}'
  if ($LASTEXITCODE -ne 0) { throw 'Docker container inventory failed.' }
  if (($existing -join '').Trim()) {
    throw "Refusing to replace preexisting container: $ContainerName"
  }

  $containerId = & docker run --pull never --rm -d --network none `
    --name $ContainerName -e POSTGRES_HOST_AUTH_METHOD=trust `
    -e "POSTGRES_USER=$adminRole" $Image
  if ($LASTEXITCODE -ne 0 -or -not ($containerId -join '').Trim()) {
    throw 'Failed to start the disposable Hosted compatibility container.'
  }
  $containerStarted = $true

  $ready = $false
  for ($attempt = 0; $attempt -lt 45; $attempt++) {
    & docker exec $ContainerName pg_isready -U $adminRole -d postgres | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw 'Hosted compatibility container did not become ready.' }

  $bootstrap = @"
create role postgres login superuser createrole bypassrls;
create database $baselineDatabase template template0 owner postgres;
create database $emptyDatabase template template0 owner postgres;
"@
  $bootstrapResult = Invoke-SqlText -Database 'postgres' -Role $adminRole `
    -Sql $bootstrap -Phase 'Hosted fixture bootstrap'
  if ($bootstrapResult.ExitCode -ne 0) { throw $bootstrapResult.Text }

  Invoke-SqlText -Database $baselineDatabase -Role $adminRole `
    -Sql (Read-Utf8File $fixturePath) -Phase 'Hosted platform fixture' | Out-Null
  Invoke-SqlText -Database $emptyDatabase -Role $adminRole `
    -Sql (Read-Utf8File $fixturePath) -Phase 'Hosted empty platform fixture' | Out-Null
  foreach ($path in $baselinePaths) {
    Invoke-SqlText -Database $baselineDatabase -Role 'postgres' `
      -Sql (Read-Utf8File (Join-Path $supabaseRoot $path)) `
      -Phase "Hosted baseline $path" | Out-Null
  }

  Invoke-AdminSql -Database 'postgres' -Sql @'
alter role postgres nosuperuser createrole bypassrls nocreatedb;
'@ | Out-Null

  $capabilities = (Invoke-SqlText -Database $baselineDatabase -Role 'postgres' `
    -Sql @'
select concat_ws('|', rolsuper, rolcreaterole, rolbypassrls,
  has_schema_privilege('postgres','auth','usage'),
  has_schema_privilege('postgres','auth','usage with grant option'),
  has_function_privilege('postgres','auth.uid()','execute'),
  has_function_privilege('postgres','auth.uid()','execute with grant option'),
  has_column_privilege('postgres','auth.users','id','references'))
from pg_roles where rolname='postgres';
'@ -Phase 'Hosted executor capability proof').Text.Trim()
  if ($capabilities -ne 'f|t|t|t|f|t|f|t') {
    throw "Hosted executor fixture is not exact: $capabilities"
  }

  Assert-PreflightFailure -Database $emptyDatabase `
    -ExpectedCode 'PREFLIGHT_BASELINE_INVALID'

  Invoke-AdminSql -Database 'postgres' -Sql `
    "create database $fullDatabase template $baselineDatabase owner postgres;" | Out-Null
  $fullSession = (Expand-Preflight) + "`n" + (Expand-DeploymentDriver) `
    + "`n" + (Expand-Postflight)
  $fresh = Invoke-SqlText -Database $fullDatabase -Role 'postgres' `
    -Sql $fullSession -Phase 'Hosted fresh deployment'
  if ($fresh.Text -notmatch 'POSTFLIGHT PASS') {
    throw 'Hosted fresh deployment did not reach POSTFLIGHT PASS.'
  }
  $rerun = Invoke-SqlText -Database $fullDatabase -Role 'postgres' `
    -Sql $fullSession -Phase 'Hosted exact rerun'
  if ($rerun.Text -notmatch 'POSTFLIGHT PASS' -or
      ([regex]::Matches($rerun.Text, 'already exact; skip')).Count -ne 7) {
    throw 'Hosted exact rerun did not prove seven skips and POSTFLIGHT PASS.'
  }

  $adapter = (Invoke-SqlText -Database $fullDatabase -Role $adminRole -Sql @'
select concat_ws('|', owner_row.rolname, language_row.lanname,
  procedure_row.provolatile, procedure_row.prosecdef,
  procedure_row.prorettype = 'uuid'::regtype,
  procedure_row.pronargs,
  procedure_row.proconfig = array['search_path=""']::text[],
  regexp_replace(procedure_row.prosrc,'[[:space:]]+','','g')='selectauth.uid()')
from pg_proc procedure_row
join pg_roles owner_row on owner_row.oid=procedure_row.proowner
join pg_language language_row on language_row.oid=procedure_row.prolang
where procedure_row.oid=
  'equora_private.equora_request_context_uid_v1()'::regprocedure;
'@ -Phase 'Hosted auth adapter proof').Text.Trim()
  if ($adapter -ne 'postgres|sql|s|t|t|0|t|t') {
    throw "Hosted auth adapter contract drift: $adapter"
  }

  $claim = (Invoke-SqlText -Database $fullDatabase `
    -Role $adminRole -Sql @'
begin;
set local role equora_broker_capture_owner;
select set_config(
  'request.jwt.claim.sub','90000000-0000-4000-8000-000000000009',false
);
select equora_private.equora_request_context_uid_v1();
rollback;
'@ -Phase 'Hosted auth adapter semantics').Text.Trim().Split("`n")
  if ($claim -notcontains '90000000-0000-4000-8000-000000000009') {
    throw "Hosted auth adapter returned the wrong request subject: $claim"
  }

  foreach ($runtimeRole in @('anon','authenticated','service_role')) {
    $denied = Invoke-SqlText -Database $fullDatabase -Role $adminRole `
      -Sql "set role $runtimeRole; select equora_private.equora_request_context_uid_v1();" `
      -Phase "Direct adapter denial $runtimeRole" -AllowFailure
    if ($denied.ExitCode -eq 0) {
      throw "Runtime role $runtimeRole can execute the private auth adapter."
    }
  }

  Invoke-AdminSql -Database 'postgres' -Sql @'
create role equora_platform_drift nologin;
'@ | Out-Null

  New-MutantDatabase -Name 'equora_hosted_mutant_schema_owner' -Mutation @'
alter schema auth owner to equora_platform_drift;
'@
  New-MutantDatabase -Name 'equora_hosted_mutant_uid_owner' -Mutation @'
grant usage, create on schema auth to equora_platform_drift;
alter function auth.uid() owner to equora_platform_drift;
'@
  New-MutantDatabase -Name 'equora_hosted_mutant_foreign_acl' -Mutation @'
grant usage on schema auth to equora_platform_drift;
'@
  New-MutantDatabase -Name 'equora_hosted_mutant_grantable' -Mutation @'
grant usage on schema auth to dashboard_user with grant option;
'@
  New-MutantDatabase -Name 'equora_hosted_mutant_usage' -Mutation @'
revoke usage on schema auth from postgres;
'@
  New-MutantDatabase -Name 'equora_hosted_mutant_execute' -Mutation @'
revoke execute on function auth.uid() from public, postgres;
'@
  New-MutantDatabase -Name 'equora_hosted_mutant_references' -Mutation @'
revoke references (id) on table auth.users from postgres;
'@

  Write-Output 'Hosted Supabase v17 non-superuser compatibility and drift oracles passed.'
}
finally {
  if ($containerStarted) {
    $ErrorActionPreference = 'Continue'
    & docker rm -f $ContainerName | Out-Null
    $ErrorActionPreference = 'Stop'
  }
}
