param(
  [string]$ContainerName = 'equora-v5761-scheduler-pgtest',
  [string]$TestDatabase = 'equora_restored_v57601_upgrade',
  [ValidateSet('extensions', 'public')]
  [string]$PgcryptoSchema = 'extensions',
  [switch]$SkipNegativeOracles
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}
if ($TestDatabase -notmatch '^equora_restored_v57601_[a-z0-9_]+$') {
  throw 'TestDatabase must use the equora_restored_v57601_ prefix.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$supabaseRoot = Join-Path $repoRoot 'supabase'
$stubPath = Join-Path $PSScriptRoot 'equora-local-supabase-stubs.sql'
$restoreFixturePath = Join-Path $PSScriptRoot `
  'equora-restored-v57601-upgrade-fixture.sql'
$baselineRepairPath = Join-Path $supabaseRoot `
  'repair-v57.60.1-restored-credential-acl.sql'
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

function Invoke-SqlText {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$Sql,
    [Parameter(Mandatory = $true)][string]$Phase,
    [switch]$AllowFailure
  )

  $ErrorActionPreference = 'Continue'
  $output = $Sql | & docker exec -i $ContainerName psql -U postgres `
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
  param([Parameter(Mandatory = $true)][string]$Sql)
  $result = Invoke-SqlText -Database 'postgres' -Sql $Sql `
    -Phase 'Restored-upgrade admin SQL'
  return $result.Text
}

function Expand-DeploymentDriver {
  $sql = Read-Utf8File (Join-Path $supabaseRoot 'deploy-v57.61.0.sql')
  foreach ($path in $deploymentPaths) {
    $sql = $sql.Replace(
      "\ir $path",
      (Read-Utf8File (Join-Path $supabaseRoot $path))
    )
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

function Expand-BaselineRepair {
  $sql = Read-Utf8File $baselineRepairPath
  $sql = $sql.Replace(
    '\ir assert-v57.60.1-restored-credential-acl-repair-source.sql',
    (Read-Utf8File (Join-Path $supabaseRoot `
      'assert-v57.60.1-restored-credential-acl-repair-source.sql'))
  )
  return $sql.Replace(
    '\ir verify-v57.60.1-baseline.sql',
    (Read-Utf8File (Join-Path $supabaseRoot 'verify-v57.60.1-baseline.sql'))
  )
}

function Initialize-RestoredBaseline {
  param([Parameter(Mandatory = $true)][string]$Database)
  if ($Database -notmatch '^equora_restored_v57601_[a-z0-9_]+$') {
    throw "Unsafe restored-upgrade database name: $Database"
  }

  Invoke-AdminSql -Sql "drop database if exists $Database with (force);" |
    Out-Null
  Invoke-AdminSql -Sql "create database $Database template template0;" |
    Out-Null
  Invoke-SqlText -Database $Database -Sql (Read-Utf8File $stubPath) `
    -Phase 'Restored-upgrade Supabase stubs' | Out-Null
  if ($PgcryptoSchema -eq 'public') {
    Invoke-SqlText -Database $Database -Sql @'
alter extension pgcrypto set schema public;
drop schema extensions;
'@ -Phase 'Relocate pgcrypto to restored public namespace' | Out-Null
  }
  Invoke-SqlText -Database $Database `
    -Sql (Read-Utf8File (Join-Path $supabaseRoot 'schema.sql')) `
    -Phase 'Restored-upgrade schema baseline' | Out-Null
  Invoke-SqlText -Database $Database -Sql (Read-Utf8File $restoreFixturePath) `
    -Phase 'Verified restored-v57.60.1 fixture' | Out-Null
  Invoke-SqlText -Database $Database `
    -Sql (Read-Utf8File (Join-Path $supabaseRoot 'schema-patch-v57.60.1.sql')) `
    -Phase 'Restored-upgrade v57.60.1 baseline' | Out-Null
}

function Get-MarkerDigest {
  param([Parameter(Mandatory = $true)][string]$Database)
  return (Invoke-SqlText -Database $Database -Sql @'
select encode(public.equora_pgcrypto_digest_v1(convert_to(string_agg(
  migration_id || '|' || contract_fingerprint || '|' || applied_at::text,
  E'\n' order by migration_id
), 'UTF8'), 'sha256'), 'hex')
from equora_private.schema_migrations;
'@ -Phase 'Migration marker digest').Text.Trim()
}

function Assert-NoV5761Effect {
  param([Parameter(Mandatory = $true)][string]$Database)
  $effect = (Invoke-SqlText -Database $Database -Sql @'
select concat_ws('|',
  to_regclass('equora_private.schema_migrations') is null,
  to_regclass('public.broker_sync_activations') is null,
  to_regprocedure('equora_private.equora_request_context_uid_v1()') is null
);
'@ -Phase 'No-partial-effect proof').Text.Trim()
  if ($effect -ne 't|t|t') {
    throw "Failed path left a v57.61 effect in ${Database}: $effect"
  }
}

function Assert-Failure {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][string]$ExpectedCode,
    [Parameter(Mandatory = $true)][string]$Sql
  )
  $result = Invoke-SqlText -Database $Database -Sql $Sql `
    -Phase "Expected failure $ExpectedCode" -AllowFailure
  if ($result.ExitCode -eq 0 -or
      $result.Text -notmatch [regex]::Escape($ExpectedCode)) {
    throw "Expected ${ExpectedCode} in ${Database}: $($result.Text)"
  }
  Assert-NoV5761Effect -Database $Database
}

function Assert-PgcryptoContract {
  param([Parameter(Mandatory = $true)][string]$Database)

  $catalogSql = @'
with extension_contract as (
  select namespace_row.nspname as schema_name,
    namespace_row.oid as namespace_oid
  from pg_extension extension_row
  join pg_namespace namespace_row
    on namespace_row.oid = extension_row.extnamespace
  where extension_row.extname = 'pgcrypto'
), wrapper_contract as (
  select count(*) = 2
      and bool_and(owner_row.rolname = 'postgres')
      and bool_and(language_row.lanname = 'sql')
      and bool_and(procedure_row.provolatile = 'i')
      and bool_and(procedure_row.proisstrict)
      and bool_and(procedure_row.prosecdef)
      and bool_and(
        procedure_row.proconfig = array['search_path=""']::text[]
      )
      and bool_and(regexp_replace(
        procedure_row.prosrc, '[[:space:]]+', '', 'g'
      ) = case procedure_row.proname
        when 'equora_pgcrypto_digest_v1' then format(
          'select%s.digest(p_value,p_algorithm)',
          quote_ident(extension_contract.schema_name)
        )
        when 'equora_pgcrypto_hmac_v1' then format(
          'select%s.hmac(p_value,p_key,p_algorithm)',
          quote_ident(extension_contract.schema_name)
        )
      end) as exact
  from pg_proc procedure_row
  join pg_namespace namespace_row
    on namespace_row.oid = procedure_row.pronamespace
  join pg_roles owner_row on owner_row.oid = procedure_row.proowner
  join pg_language language_row on language_row.oid = procedure_row.prolang
  cross join extension_contract
  where namespace_row.nspname = 'public'
    and procedure_row.proname in (
      'equora_pgcrypto_digest_v1', 'equora_pgcrypto_hmac_v1'
    )
), wrapper_acl as (
  select count(*) = 2
      and bool_and(grantee_row.rolname = 'equora_broker_capture_owner')
      and bool_and(exploded.privilege_type = 'EXECUTE')
      and bool_and(exploded.is_grantable is false) as exact
  from pg_proc procedure_row
  cross join lateral aclexplode(coalesce(
    procedure_row.proacl, acldefault('f', procedure_row.proowner)
  )) exploded
  join pg_roles grantee_row on grantee_row.oid = exploded.grantee
  where procedure_row.oid in (
    'public.equora_pgcrypto_digest_v1(bytea,text)'::regprocedure,
    'public.equora_pgcrypto_hmac_v1(bytea,bytea,text)'::regprocedure
  )
    and exploded.grantee <> procedure_row.proowner
), direct_extension_acl as (
  select count(*) = 0 as absent
  from pg_proc procedure_row
  cross join extension_contract
  cross join lateral aclexplode(coalesce(
    procedure_row.proacl, acldefault('f', procedure_row.proowner)
  )) exploded
  join pg_roles grantee_row on grantee_row.oid = exploded.grantee
  where procedure_row.pronamespace = extension_contract.namespace_oid
    and procedure_row.proname in ('digest', 'hmac')
    and grantee_row.rolname = 'equora_broker_capture_owner'
)
select concat_ws('|',
  extension_contract.schema_name,
  wrapper_contract.exact,
  wrapper_acl.exact,
  direct_extension_acl.absent,
  not has_schema_privilege(
    'equora_broker_capture_owner', extension_contract.schema_name, 'create'
  ),
  case when extension_contract.schema_name = 'extensions' then
    not has_schema_privilege(
      'equora_broker_capture_owner', extension_contract.schema_name, 'usage'
    )
  else true end,
  not has_function_privilege(
    'anon', 'public.equora_pgcrypto_digest_v1(bytea,text)', 'execute'
  ),
  not has_function_privilege(
    'authenticated', 'public.equora_pgcrypto_digest_v1(bytea,text)', 'execute'
  ),
  not has_function_privilege(
    'service_role', 'public.equora_pgcrypto_digest_v1(bytea,text)', 'execute'
  )
)
from extension_contract, wrapper_contract, wrapper_acl, direct_extension_acl;
'@
  $catalog = (Invoke-SqlText -Database $Database -Sql $catalogSql `
    -Phase 'pgcrypto namespace/wrapper authority proof').Text.Trim()
  $expectedCatalog = "${PgcryptoSchema}|t|t|t|t|t|t|t|t"
  if ($catalog -ne $expectedCatalog) {
    throw "pgcrypto authority contract drift in ${Database}: $catalog"
  }

  # The production owner is NOLOGIN and intentionally has no surviving SET
  # membership. Model its SECURITY DEFINER execution context with disposable
  # owner-bound probes instead of weakening that final membership contract.
  $probeSetupSql = @'
begin;
grant equora_broker_capture_owner to postgres with inherit false, set true;
grant create on schema public to equora_broker_capture_owner;
create function public._equora_test_pgcrypto_wrapper_probe_v1()
returns text
language sql
security definer
set search_path = ''
as $body$
  select encode(
      public.equora_pgcrypto_digest_v1(convert_to('abc', 'UTF8'), 'sha256'),
      'hex'
    ) || '|' || encode(
      public.equora_pgcrypto_hmac_v1(
        convert_to('The quick brown fox jumps over the lazy dog', 'UTF8'),
        convert_to('key', 'UTF8'),
        'sha256'
      ),
      'hex'
    )
$body$;
alter function public._equora_test_pgcrypto_wrapper_probe_v1()
  owner to equora_broker_capture_owner;
revoke all on function public._equora_test_pgcrypto_wrapper_probe_v1()
  from public;
grant execute on function public._equora_test_pgcrypto_wrapper_probe_v1()
  to postgres;
__DIRECT_PROBE__
revoke create on schema public from equora_broker_capture_owner;
revoke equora_broker_capture_owner from postgres;
commit;
'@
  $directProbeSql = if ($PgcryptoSchema -eq 'extensions') { @'
create function public._equora_test_pgcrypto_direct_probe_v1()
returns bytea
language sql
security definer
set search_path = ''
as $body$
  select extensions.digest(convert_to('abc', 'UTF8'), 'sha256')
$body$;
alter function public._equora_test_pgcrypto_direct_probe_v1()
  owner to equora_broker_capture_owner;
revoke all on function public._equora_test_pgcrypto_direct_probe_v1()
  from public;
grant execute on function public._equora_test_pgcrypto_direct_probe_v1()
  to postgres;
'@ } else { '' }
  Invoke-SqlText -Database $Database `
    -Sql $probeSetupSql.Replace('__DIRECT_PROBE__', $directProbeSql) `
    -Phase 'Create disposable capture-owner pgcrypto probes' | Out-Null

  try {
    if ($PgcryptoSchema -eq 'extensions') {
      $directExtensionCall = Invoke-SqlText -Database $Database -Sql `
        'select public._equora_test_pgcrypto_direct_probe_v1();' `
        -Phase 'Direct pgcrypto execution denial' -AllowFailure
      if ($directExtensionCall.ExitCode -eq 0 -or
          $directExtensionCall.Text -notmatch
            'permission denied for schema extensions') {
        throw (
          'Capture owner unexpectedly reached the raw extensions.digest ' +
          "function in ${Database}: $($directExtensionCall.Text)"
        )
      }
    }

    $vectors = (Invoke-SqlText -Database $Database `
      -Sql 'select public._equora_test_pgcrypto_wrapper_probe_v1();' `
      -Phase 'pgcrypto wrapper known vectors as capture owner').Text
  }
  finally {
    $probeCleanupSql = @'
begin;
grant equora_broker_capture_owner to postgres with inherit false, set true;
drop function if exists public._equora_test_pgcrypto_direct_probe_v1();
drop function public._equora_test_pgcrypto_wrapper_probe_v1();
revoke equora_broker_capture_owner from postgres;
commit;
'@
    Invoke-SqlText -Database $Database -Sql $probeCleanupSql `
      -Phase 'Drop disposable capture-owner pgcrypto probes' | Out-Null
  }
  $expectedVectors =
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' +
    '|' +
    'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8'
  if ($vectors -notmatch [regex]::Escape($expectedVectors)) {
    throw "pgcrypto wrapper vector drift in ${Database}: $vectors"
  }
}

$fullSession = (Expand-Preflight) + "`n" + (Expand-DeploymentDriver) +
  "`n" + (Expand-Postflight)
$negativeDatabases = @(
  "${TestDatabase}_legacy_data",
  "${TestDatabase}_ownerless_trade",
  "${TestDatabase}_contract_drift",
  "${TestDatabase}_repair_drift"
)

try {
  Initialize-RestoredBaseline -Database $TestDatabase

  $repairCountsBefore = (Invoke-SqlText -Database $TestDatabase -Sql @'
select concat_ws('|',
  (select count(*) from public.trades),
  (select count(*) from public.broker_credentials)
);
'@ -Phase 'Pre-repair row counts').Text.Trim()
  Invoke-SqlText -Database $TestDatabase -Sql @'
grant all privileges on table public.broker_credentials to anon, authenticated;
'@ -Phase 'Exact restored credential ACL drift fixture' | Out-Null
  Assert-Failure -Database $TestDatabase `
    -ExpectedCode 'PREFLIGHT_BASELINE_CONTRACT_DRIFT' `
    -Sql ("set equora.allow_exact_v57601_credential_acl_repair = 'on';`n" +
      (Expand-Preflight))
  Assert-Failure -Database $TestDatabase `
    -ExpectedCode 'PREFLIGHT_BASELINE_CONTRACT_DRIFT' `
    -Sql ("set equora.allow_exact_v57601_credential_acl_repair = 'on';`n" +
      (Read-Utf8File (Join-Path $supabaseRoot `
        'verify-v57.60.1-baseline.sql')))
  Assert-Failure -Database $TestDatabase `
    -ExpectedCode 'PREFLIGHT_BASELINE_CONTRACT_DRIFT' `
    -Sql (Expand-Preflight)
  $repair = Invoke-SqlText -Database $TestDatabase `
    -Sql (Expand-BaselineRepair) -Phase 'Exact restored credential ACL repair'
  if ($repair.Text -notmatch 'BASELINE REPAIR PASS') {
    throw 'Exact restored credential ACL repair did not reach PASS.'
  }
  $repairProof = (Invoke-SqlText -Database $TestDatabase -Sql @'
select concat_ws('|',
  (select count(*) from public.trades),
  (select count(*) from public.broker_credentials),
  not exists (
    select 1
    from pg_class relation_row
    cross join lateral aclexplode(coalesce(
      relation_row.relacl, acldefault('r', relation_row.relowner)
    )) exploded
    join pg_roles grantee_row on grantee_row.oid = exploded.grantee
    where relation_row.oid = 'public.broker_credentials'::regclass
      and grantee_row.rolname in ('anon', 'authenticated')
  )
);
'@ -Phase 'Exact restored credential ACL repair proof').Text.Trim()
  if ($repairProof -ne "${repairCountsBefore}|t") {
    throw "Restored credential ACL repair drift: $repairProof"
  }

  $apply = Invoke-SqlText -Database $TestDatabase -Sql $fullSession `
    -Phase 'Restored v57.60.1 to v57.61.0 deployment'
  if ($apply.Text -notmatch 'POSTFLIGHT PASS') {
    throw 'Restored upgrade did not reach POSTFLIGHT PASS.'
  }
  Assert-PgcryptoContract -Database $TestDatabase

  $normalized = (Invoke-SqlText -Database $TestDatabase -Sql @'
with legacy_columns as (
  select count(*) as value
  from pg_attribute
  where attrelid = 'public.setups'::regclass
    and attname in ('name','grade','screenshot_url')
    and attnum > 0 and not attisdropped
), canonical_columns as (
  select count(*) as value
  from pg_attribute
  where attrelid = 'public.shared_trade_submissions'::regclass
    and attname in (
      'learning_category','review_labels','coach_strengths',
      'coach_mistakes','coach_action','vault_blurb','featured_at'
    ) and attnum > 0 and not attisdropped
), old_policies as (
  select count(*) as value from pg_policies
  where schemaname='public' and policyname in (
    'trade_import_batches_delete_own','trade_import_batches_insert_own',
    'trade_import_batches_select_own','trade_import_batches_update_own'
  )
)
select concat_ws('|',
  (select value from legacy_columns),
  (select value from canonical_columns),
  (select value from old_policies),
  (select attnotnull from pg_attribute
    where attrelid='public.trades'::regclass and attname='user_id'),
  (select count(*) from pg_policies where schemaname='public'
    and policyname='authenticated users can read featured vault submissions'),
  (select count(*) from pg_indexes where schemaname='public' and indexname in (
    'idx_setup_trade_links_user_created_at','idx_setups_user_sort_title',
    'idx_shared_trade_submissions_featured_at',
    'idx_trade_tags_trade_id_created_at'
  )),
  (select pg_get_constraintdef(oid, true) =
      'FOREIGN KEY (import_batch_id) REFERENCES ' ||
      'trade_import_batches(id) ON DELETE SET NULL'
    from pg_constraint
    where conrelid='public.trades'::regclass
      and conname='trades_import_batch_id_fkey'),
  has_table_privilege('service_role','public.broker_credentials','select'),
  (select count(*) from equora_private.schema_migrations)
);
'@ -Phase 'Restored-upgrade normalization proof').Text.Trim()
  $expectedNormalization = '0|7|0|t|1|4|t|f|6'
  if ($normalized -ne $expectedNormalization) {
    throw "Restored-upgrade normalization drift: $normalized"
  }

  $markerDigestBefore = Get-MarkerDigest -Database $TestDatabase
  $rerun = Invoke-SqlText -Database $TestDatabase -Sql $fullSession `
    -Phase 'Restored v57.61.0 exact re-run'
  if ($rerun.Text -notmatch 'POSTFLIGHT PASS' -or
      ([regex]::Matches($rerun.Text, 'already exact; skip')).Count -ne 6) {
    throw 'Restored exact re-run did not prove six skips and POSTFLIGHT PASS.'
  }
  $markerDigestAfter = Get-MarkerDigest -Database $TestDatabase
  if ($markerDigestAfter -ne $markerDigestBefore) {
    throw 'Restored exact re-run changed immutable migration receipts.'
  }

  if (-not $SkipNegativeOracles) {
    Initialize-RestoredBaseline -Database $negativeDatabases[0]
    Invoke-SqlText -Database $negativeDatabases[0] -Sql @'
insert into public.setups(title, name) values ('fixture', 'must-reconcile');
'@ -Phase 'Legacy setup-data mutation' | Out-Null
    Assert-Failure -Database $negativeDatabases[0] `
      -ExpectedCode 'MIGRATION_LEGACY_SETUP_COLUMN_RECONCILIATION_REQUIRED:name' `
      -Sql $fullSession

    Initialize-RestoredBaseline -Database $negativeDatabases[1]
    Invoke-SqlText -Database $negativeDatabases[1] -Sql @'
insert into public.trades(user_id, market, setup)
values (null, 'BTCUSDT', 'fixture');
'@ -Phase 'Ownerless-trade mutation' | Out-Null
    Assert-Failure -Database $negativeDatabases[1] `
      -ExpectedCode 'MIGRATION_TRADE_OWNER_RECONCILIATION_REQUIRED' `
      -Sql $fullSession

    Initialize-RestoredBaseline -Database $negativeDatabases[2]
    Invoke-SqlText -Database $negativeDatabases[2] -Sql @'
alter table public.trades add column unknown_restore_drift text;
'@ -Phase 'Restored-baseline drift mutation' | Out-Null
    Assert-Failure -Database $negativeDatabases[2] `
      -ExpectedCode 'PREFLIGHT_BASELINE_CONTRACT_DRIFT' `
      -Sql $fullSession

    Initialize-RestoredBaseline -Database $negativeDatabases[3]
    Invoke-SqlText -Database $negativeDatabases[3] -Sql @'
grant select on table public.broker_credentials to anon;
'@ -Phase 'Non-exact credential ACL repair drift mutation' | Out-Null
    Assert-Failure -Database $negativeDatabases[3] `
      -ExpectedCode 'BASELINE_REPAIR_SOURCE_CONTRACT_DRIFT' `
      -Sql (Expand-BaselineRepair)
  }

  $negativeOracleStatus = if ($SkipNegativeOracles) {
    'negative oracles skipped here and covered by the mandatory extensions run'
  } else {
    'no-partial-effect negative oracles passed'
  }
  Write-Output (
    "Verified restored v57.60.1 upgrade with pgcrypto in $PgcryptoSchema, " +
    "exact re-run, normalization, and $negativeOracleStatus."
  )
}
finally {
  foreach ($database in @($TestDatabase) + $negativeDatabases) {
    try {
      Invoke-AdminSql -Sql "drop database if exists $database with (force);" |
        Out-Null
    } catch {
      Write-Warning $_.Exception.Message
    }
  }
}
