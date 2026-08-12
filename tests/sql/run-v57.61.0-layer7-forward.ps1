param(
  [string]$ContainerName = 'equora-v5761-scheduler-pgtest'
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
  throw 'ContainerName contains unsupported characters.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$supabaseRoot = Join-Path $repoRoot 'supabase'
$stubPath = Join-Path $PSScriptRoot 'equora-local-supabase-stubs.sql'
$originalSix = @(
  'schema-patch-v57.61.0.sql',
  'schema-patch-v57.61.0-g1-capture-control.sql',
  'schema-patch-v57.61.0-g1-lane-authority.sql',
  'schema-patch-v57.61.0-g1-activation-authority.sql',
  'schema-patch-v57.61.0-g1-scheduler-control.sql',
  'schema-patch-v57.61.0-g1-runtime-deployment.sql'
)
$deploymentPaths = @($originalSix) + @(
  'schema-patch-v57.61.0-g1-broker-provider-rls.sql'
)
$databases = @(
  'equora_full_deployment_layer7_rls_off',
  'equora_full_deployment_layer7_rls_on',
  'equora_full_deployment_layer7_unknown'
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
  Invoke-SqlText -Database 'postgres' -Sql $Sql -Phase 'Layer-7 admin SQL' |
    Out-Null
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

function Initialize-SixMarkerPredecessor {
  param(
    [Parameter(Mandatory = $true)][string]$Database,
    [Parameter(Mandatory = $true)][bool]$EnableProviderRls
  )
  Invoke-AdminSql -Sql "drop database if exists $Database with (force);"
  Invoke-AdminSql -Sql "create database $Database template template0;"
  foreach ($path in @(
    $stubPath,
    (Join-Path $supabaseRoot 'schema.sql'),
    (Join-Path $supabaseRoot 'schema-patch-v57.60.1.sql')
  )) {
    Invoke-SqlText -Database $Database -Sql (Read-Utf8File $path) `
      -Phase "Layer-7 predecessor fixture $path" | Out-Null
  }
  foreach ($path in $originalSix) {
    Invoke-SqlText -Database $Database `
      -Sql (Read-Utf8File (Join-Path $supabaseRoot $path)) `
      -Phase "Layer-7 predecessor $path" | Out-Null
  }
  if ($EnableProviderRls) {
    Invoke-SqlText -Database $Database `
      -Sql 'alter table public.broker_providers enable row level security;' `
      -Phase 'Hosted-style provider RLS predecessor' | Out-Null
  }
}

function Get-StateDigest {
  param([Parameter(Mandatory = $true)][string]$Database)
  return (Invoke-SqlText -Database $Database -Phase 'Layer-7 state digest' -Sql @'
select concat_ws('|',
  (select encode(public.equora_pgcrypto_digest_v1(convert_to(coalesce(string_agg(
    migration_id || '|' || contract_fingerprint || '|' || applied_at::text,
    E'\n' order by migration_id), ''), 'UTF8'), 'sha256'), 'hex')
   from equora_private.schema_migrations
   where migration_id in (
     'equora_v57.61.0_broker_capture_v1',
     'equora_v57.61.0_g1_capture_control_v1',
     'equora_v57.61.0_g1_lane_authority_v1',
     'equora_v57.61.0_g1_activation_authority_v1',
     'equora_v57.61.0_g1_scheduler_control_v2',
     'equora_v57.61.0_g1_runtime_deployment_v1'
   )),
  (select count(*) from public.trades),
  (select count(*) from public.broker_connections),
  (select count(*) from public.broker_credentials),
  (select count(*) from public.broker_providers)
);
'@).Text.Trim()
}

try {
  $fullSession = (Expand-Preflight) + "`n" + (Expand-DeploymentDriver) `
    + "`n" + (Expand-Postflight)

  foreach ($case in @(
    @{ Database = $databases[0]; Rls = $false },
    @{ Database = $databases[1]; Rls = $true }
  )) {
    Initialize-SixMarkerPredecessor -Database $case.Database `
      -EnableProviderRls $case.Rls
    $before = Get-StateDigest -Database $case.Database

    $apply = Invoke-SqlText -Database $case.Database -Sql $fullSession `
      -Phase "Layer-7 forward apply RLS=$($case.Rls)"
    if ($apply.Text -notmatch 'POSTFLIGHT PASS' -or
        ([regex]::Matches($apply.Text, 'already exact; skip')).Count -ne 6 -or
        $apply.Text -notmatch '7/7 broker-provider RLS normalization') {
      throw "Layer-7 apply did not prove six skips plus one apply: $($apply.Text)"
    }

    $after = Get-StateDigest -Database $case.Database
    if ($after -ne $before) {
      throw "Layer-7 changed predecessor receipts or data counts: $before -> $after"
    }

    $contract = (Invoke-SqlText -Database $case.Database `
      -Phase 'Layer-7 canonical contract' -Sql @'
select concat_ws('|',
  (select count(*) from equora_private.schema_migrations
   where migration_id like 'equora_v57.61.0%'),
  (select contract_fingerprint
   from equora_private.schema_migrations
   where migration_id='equora_v57.61.0_broker_provider_rls_v1'),
  (select relrowsecurity from pg_class
   where oid='public.broker_providers'::regclass),
  (select relforcerowsecurity from pg_class
   where oid='public.broker_providers'::regclass),
  (select count(*) from pg_policies
   where schemaname='public' and tablename='broker_providers')
);
'@).Text.Trim()
    if ($contract -ne '7|d72047ce5e28e1400869a9abdcdad650a4f1b3b11e1e1b7cb07a9b37157eca47|t|f|0') {
      throw "Layer-7 final contract drift: $contract"
    }

    $rerun = Invoke-SqlText -Database $case.Database -Sql $fullSession `
      -Phase 'Layer-7 exact rerun'
    if ($rerun.Text -notmatch 'POSTFLIGHT PASS' -or
        ([regex]::Matches($rerun.Text, 'already exact; skip')).Count -ne 7) {
      throw 'Layer-7 exact rerun did not prove seven skips and POSTFLIGHT PASS.'
    }
  }

  Initialize-SixMarkerPredecessor -Database $databases[2] `
    -EnableProviderRls $true
  Invoke-SqlText -Database $databases[2] -Phase 'Unknown marker mutation' -Sql @'
insert into equora_private.schema_migrations(migration_id, contract_fingerprint)
values ('equora_v57.61.0_unknown_v1', repeat('a', 64));
'@ | Out-Null
  $unknown = Invoke-SqlText -Database $databases[2] -Sql $fullSession `
    -Phase 'Unknown seven-marker predecessor rejection' -AllowFailure
  if ($unknown.ExitCode -eq 0 -or
      $unknown.Text -notmatch 'PREFLIGHT_MIGRATION_STATE_INVALID') {
    throw "Unknown marker state was not rejected: $($unknown.Text)"
  }
  $unknownEffect = (Invoke-SqlText -Database $databases[2] `
    -Phase 'Unknown marker no-effect oracle' -Sql @'
select count(*) from equora_private.schema_migrations
where migration_id='equora_v57.61.0_broker_provider_rls_v1';
'@).Text.Trim()
  if ($unknownEffect -ne '0') {
    throw 'Unknown marker preflight produced a Layer-7 marker effect.'
  }

  Write-Output 'Forward-only Layer-7 false/true predecessor, exact rerun and unknown-marker no-effect oracles passed.'
}
finally {
  foreach ($database in $databases) {
    Invoke-AdminSql -Sql "drop database if exists $database with (force);"
  }
}
