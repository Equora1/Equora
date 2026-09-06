$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$script:TradeImportContainer = $null
$script:TradeImportDatabase = $null
$script:TradeImportRepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:TradeImportSupabaseRoot = Join-Path $script:TradeImportRepoRoot 'supabase'
$script:TradeImportIntegrationPath = Join-Path $PSScriptRoot `
  'trade-import-hardening.integration.sql'
$script:TradeImportExpectedImage = 'public.ecr.aws/supabase/postgres:17.6.1.084'
$script:TradeImportExpectedImageDigest = `
  'sha256:95d92e9563121189086690a4b7f8f2b711a4809a2499f45592199aae68ebae5f'
$script:TradeImportDisposableLabel = 'trade-import-v5762'

function Initialize-TradeImportTestContext {
  param(
    [Parameter(Mandatory = $true)][string]$ContainerName,
    [Parameter(Mandatory = $true)][string]$TestDatabase
  )

  if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
    throw 'ContainerName contains unsupported characters.'
  }
  if ($TestDatabase -notmatch '^equora_full_deployment_trade_import_[a-z0-9_]+$') {
    throw 'TestDatabase must use the equora_full_deployment_trade_import_ prefix.'
  }

  $script:TradeImportContainer = $ContainerName
  $script:TradeImportDatabase = $TestDatabase

  $dockerContext = (& docker context show 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $dockerContext) {
    throw 'Trade-import Docker context could not be resolved.'
  }
  $contextJson = (& docker context inspect $dockerContext 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Trade-import Docker context inspection failed: $contextJson"
  }
  $contextObject = @($contextJson | ConvertFrom-Json)
  $dockerHost = [string]$contextObject[0].Endpoints.docker.Host
  if ($dockerHost -notmatch '^(npipe|unix)://') {
    throw "Trade-import Docker context is not local: $dockerHost"
  }

  $containerState = (& docker inspect $ContainerName 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Trade-import container inspection failed: $containerState"
  }
  $containerObjects = @($containerState | ConvertFrom-Json)
  if ($containerObjects.Count -ne 1) {
    throw 'Trade-import container inspection did not return exactly one container.'
  }
  $container = $containerObjects[0]
  # Windows PowerShell 5.1 turns an empty JSON array into $null and then counts
  # @($null) as one item. Read Count directly so an attested empty Mounts array
  # remains zero in both Windows PowerShell 5.1 and PowerShell 7.
  $mountCount = [int]$container.Mounts.Count
  $pidMode = [string]$container.HostConfig.PidMode
  $ipcMode = [string]$container.HostConfig.IpcMode
  $disposableLabel = [string]$container.Config.Labels.'com.equora.disposable-harness'
  if ([string]$container.Config.Image -ne $script:TradeImportExpectedImage `
      -or [string]$container.HostConfig.NetworkMode -ne 'none' `
      -or -not [bool]$container.State.Running `
      -or [bool]$container.HostConfig.Privileged `
      -or $mountCount -ne 0 `
      -or -not [string]::IsNullOrEmpty($pidMode) `
      -or $ipcMode -notin @('', 'private') `
      -or $disposableLabel -ne $script:TradeImportDisposableLabel) {
    throw "Trade-import container isolation mismatch: image=$($container.Config.Image); NetworkMode=$($container.HostConfig.NetworkMode); Running=$($container.State.Running); Privileged=$($container.HostConfig.Privileged); MountCount=$mountCount; PidMode=$pidMode; IpcMode=$ipcMode; DisposableLabel=$disposableLabel"
  }

  $imageJson = (& docker image inspect $container.Image 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Trade-import image inspection failed: $imageJson"
  }
  $imageObject = @($imageJson | ConvertFrom-Json)
  $repoDigests = @($imageObject[0].RepoDigests) -join ','
  if ($repoDigests -notmatch `
      [regex]::Escape("@$($script:TradeImportExpectedImageDigest)")) {
    throw "Trade-import image digest mismatch: $repoDigests"
  }

  $postgresVersion = (& docker exec $ContainerName psql -U postgres -d postgres `
    -At -v ON_ERROR_STOP=1 -c 'show server_version;' 2>&1 | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $postgresVersion -notmatch '^17\.6(?:\D|$)') {
    throw "Trade-import PostgreSQL version mismatch: $postgresVersion"
  }

  Write-Output "Trade-import environment attestation PASS: dockerContext=$dockerContext; dockerHost=$dockerHost; containerId=$($container.Id); image=$($container.Config.Image); imageDigest=$script:TradeImportExpectedImageDigest; NetworkMode=none; Privileged=false; MountCount=0; PidMode=empty; IpcMode=$ipcMode; DisposableLabel=$disposableLabel; postgresVersion=$postgresVersion."
}

function Read-TradeImportUtf8File {
  param([Parameter(Mandatory = $true)][string]$Path)
  return Get-Content -Raw -Encoding utf8 -LiteralPath $Path
}

function Expand-TradeImportV5762File {
  param([Parameter(Mandatory = $true)][string]$Name)

  $allowedNames = @(
    'preflight-v57.62.0-trade-import.sql',
    'deploy-v57.62.0-trade-import.sql',
    'postflight-v57.62.0-trade-import.sql',
    'verify-v57.62.0-trade-import.sql',
    'schema-patch-v57.62.0-trade-import-hardening.sql',
    'activate-v57.62.0-trade-import.sql',
    'deactivate-v57.62.0-trade-import.sql'
  )
  if ($Name -notin $allowedNames) {
    throw "Unsupported v57.62.0 trade-import include: $Name"
  }

  $sql = Read-TradeImportUtf8File (Join-Path $script:TradeImportSupabaseRoot $Name)
  foreach ($includeName in $allowedNames) {
    $includeToken = "\ir $includeName"
    if ($sql.Contains($includeToken)) {
      $sql = $sql.Replace(
        $includeToken,
        (Expand-TradeImportV5762File -Name $includeName)
      )
    }
  }
  return $sql
}

function Invoke-TradeImportAdminSql {
  param([Parameter(Mandatory = $true)][string]$Sql)

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = & docker exec $script:TradeImportContainer psql -U postgres `
    -d postgres -v ON_ERROR_STOP=1 -c $Sql 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($exitCode -ne 0) {
    throw "Trade-import administrative SQL failed: $($output -join [Environment]::NewLine)"
  }
  return $output
}

function Invoke-TradeImportSqlText {
  param(
    [Parameter(Mandatory = $true)][string]$Sql,
    [Parameter(Mandatory = $true)][string]$Phase
  )

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = $Sql | & docker exec -i $script:TradeImportContainer psql `
    -U postgres -d $script:TradeImportDatabase -v ON_ERROR_STOP=1 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($exitCode -ne 0) {
    throw "$Phase failed: $($output -join [Environment]::NewLine)"
  }
  return $output
}

function Invoke-TradeImportSqlExpectFailure {
  param(
    [Parameter(Mandatory = $true)][string]$Sql,
    [Parameter(Mandatory = $true)][string]$ExpectedCode,
    [Parameter(Mandatory = $true)][string]$Phase
  )

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = $Sql | & docker exec -i $script:TradeImportContainer psql `
    -U postgres -d $script:TradeImportDatabase -v ON_ERROR_STOP=1 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  $text = $output -join [Environment]::NewLine
  if ($exitCode -eq 0) {
    throw "$Phase unexpectedly succeeded."
  }
  if ($text -notmatch [regex]::Escape($ExpectedCode)) {
    throw "$Phase failed without ${ExpectedCode}: $text"
  }
  return $text
}

function Get-TradeImportScalar {
  param([Parameter(Mandatory = $true)][string]$Sql)

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = & docker exec $script:TradeImportContainer psql -U postgres `
    -d $script:TradeImportDatabase -At -v ON_ERROR_STOP=1 -c $Sql 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($exitCode -ne 0) {
    throw "Trade-import scalar query failed: $($output -join [Environment]::NewLine)"
  }
  return ($output -join "`n").Trim()
}

function Expand-TradeImportPreflight {
  $sql = Read-TradeImportUtf8File (
    Join-Path $script:TradeImportSupabaseRoot 'preflight-v57.61.0.sql'
  )
  $sql = $sql.Replace(
    '\ir verify-v57.60.1-baseline.sql',
    (Read-TradeImportUtf8File (
      Join-Path $script:TradeImportSupabaseRoot 'verify-v57.60.1-baseline.sql'
    ))
  )
  return $sql.Replace(
    '\ir verify-v57.61.0-contract.sql',
    (Read-TradeImportUtf8File (
      Join-Path $script:TradeImportSupabaseRoot 'verify-v57.61.0-contract.sql'
    ))
  )
}

function Expand-TradeImportDeployment {
  $sql = Read-TradeImportUtf8File (
    Join-Path $script:TradeImportSupabaseRoot 'deploy-v57.61.0.sql'
  )
  foreach ($name in @(
    'schema-patch-v57.61.0.sql',
    'schema-patch-v57.61.0-g1-capture-control.sql',
    'schema-patch-v57.61.0-g1-lane-authority.sql',
    'schema-patch-v57.61.0-g1-activation-authority.sql',
    'schema-patch-v57.61.0-g1-scheduler-control.sql',
    'schema-patch-v57.61.0-g1-runtime-deployment.sql',
    'schema-patch-v57.61.0-g1-broker-provider-rls.sql'
  )) {
    $sql = $sql.Replace(
      "\ir $name",
      (Read-TradeImportUtf8File (Join-Path $script:TradeImportSupabaseRoot $name))
    )
  }
  return $sql
}

function Assert-TradeImportBaseMarkers {
  $markerContract = Get-TradeImportScalar @'
with expected(migration_id, contract_fingerprint) as (values
  ('equora_v57.61.0_broker_capture_v1',
    '492ebad5496806ad60425abd58e9801c58a58b421e38392d54e6082d7fa2b083'),
  ('equora_v57.61.0_g1_capture_control_v1',
    'c133d5e0c987e7f927963db4465ef5ab2f6f4c174cfdc96a3ed1cffb5cd62be5'),
  ('equora_v57.61.0_g1_lane_authority_v1',
    '6be313155e81e0f14c48d0c71301e28a75b792a90e49542bc49ffe638f56c68d'),
  ('equora_v57.61.0_g1_activation_authority_v1',
    'b074a756a015b34a7e3da804f3d3955100a40f9a6391855a75c1e415cbbb2abb'),
  ('equora_v57.61.0_g1_scheduler_control_v2',
    '87158546782b900817d3f36501a2e43b5619906a2f07636d0cb1167b042e5ab7'),
  ('equora_v57.61.0_g1_runtime_deployment_v1',
    '892f1587e8e37937a538dad1239ec931d43bd1f65d2f224d56ab7b9356f89e96'),
  ('equora_v57.61.0_broker_provider_rls_v1',
    'd72047ce5e28e1400869a9abdcdad650a4f1b3b11e1e1b7cb07a9b37157eca47')
)
select (
  (select count(*) from equora_private.schema_migrations marker
    join expected using (migration_id, contract_fingerprint)) = 7
  and (select count(*) from equora_private.schema_migrations marker
    where marker.migration_id like 'equora_v57.61.0%') = 7
)::text;
'@
  if ($markerContract -ne 'true') {
    throw "Trade-import v57.61.0 base marker contract was not exact: $markerContract"
  }
}

function New-TradeImportBaseDatabase {
  Invoke-TradeImportAdminSql `
    "drop database if exists $script:TradeImportDatabase with (force);" | Out-Null
  Invoke-TradeImportAdminSql `
    "create database $script:TradeImportDatabase template template0;" | Out-Null
  Invoke-TradeImportSqlText `
    (Read-TradeImportUtf8File (Join-Path $PSScriptRoot 'equora-local-supabase-stubs.sql')) `
    'Trade-import Supabase stubs' | Out-Null
  Invoke-TradeImportSqlText `
    (Read-TradeImportUtf8File (Join-Path $script:TradeImportSupabaseRoot 'schema.sql')) `
    'Trade-import schema baseline' | Out-Null
  Invoke-TradeImportSqlText `
    (Read-TradeImportUtf8File (
      Join-Path $script:TradeImportSupabaseRoot 'schema-patch-v57.60.1.sql'
    )) `
    'Trade-import v57.60.1 baseline' | Out-Null

  # The pinned local Supabase image has the documented pre-existing
  # POSTFLIGHT_AUTHORITY_SECURITY_CONTRACT_DRIFT in the immutable v57.61
  # verifier. Reuse the established MB3 boundary: run the unchanged preflight
  # and all seven deployment layers in one session, then attest the exact seven
  # immutable markers. Do not claim the incompatible legacy postflight as PASS.
  Invoke-TradeImportSqlText `
    ((Expand-TradeImportPreflight) + "`n" + (Expand-TradeImportDeployment)) `
    'Trade-import v57.61.0 seven-layer base' | Out-Null
  Assert-TradeImportBaseMarkers
  Write-Output 'Trade-import v57.61.0 seven-layer base PASS: exact markers; legacy local postflight not claimed.'
}

function Install-TradeImportRelease {
  Invoke-TradeImportSqlText `
    (Expand-TradeImportV5762File -Name 'deploy-v57.62.0-trade-import.sql') `
    'Trade-import v57.62 release deployment' | Out-Null
}

function Set-TradeImportActivationState {
  param([Parameter(Mandatory = $true)][bool]$Enabled)

  $transitionName = if ($Enabled) {
    'activate-v57.62.0-trade-import.sql'
  } else {
    'deactivate-v57.62.0-trade-import.sql'
  }
  Invoke-TradeImportSqlText `
    (Expand-TradeImportV5762File -Name $transitionName) `
    "Trade-import v57.62 controlled gate transition: $transitionName" | Out-Null

  $expected = if ($Enabled) { '1|true|true' } else { '1|false|true' }
  $actual = Get-TradeImportScalar @'
select count(*)::text || '|' || bool_or(enabled)::text || '|' ||
  bool_and((enabled and activated_at is not null)
    or (not enabled and activated_at is null))::text
from public.equora_runtime_capability_gates
where capability_key='journal_file_import_persistence_v2'
  and contract_version='equora-broker-file-import-capability-v1';
'@
  if ($actual -ne $expected) {
    throw "Trade-import activation transition invalid: expected=$expected; actual=$actual"
  }
}

function Get-TradeImportPersistenceSnapshot {
  return Get-TradeImportScalar @'
select encode(pg_catalog.sha256(convert_to(jsonb_build_object(
  'gate',(
    select to_jsonb(gate_row)
    from public.equora_runtime_capability_gates gate_row
    where capability_key='journal_file_import_persistence_v2'
      and contract_version='equora-broker-file-import-capability-v1'
  ),
  'accounts',coalesce((
    select jsonb_agg(to_jsonb(account_row) order by account_row.id)
    from public.journal_import_accounts account_row
  ),'[]'::jsonb),
  'batches',coalesce((
    select jsonb_agg(to_jsonb(batch_row) order by batch_row.id)
    from public.trade_import_batches batch_row
  ),'[]'::jsonb),
  'trades',coalesce((
    select jsonb_agg(to_jsonb(trade_row) order by trade_row.id)
    from public.trades trade_row
  ),'[]'::jsonb),
  'sourceKeys',coalesce((
    select jsonb_agg(to_jsonb(source_key_row) order by source_key_row.id)
    from public.trade_import_source_keys source_key_row
  ),'[]'::jsonb)
)::text,'UTF8')),'hex');
'@
}

function Invoke-TradeImportIntegration {
  return Invoke-TradeImportSqlText `
    (Read-TradeImportUtf8File $script:TradeImportIntegrationPath) `
    'Trade-import integration fixture'
}

function Remove-TradeImportDatabase {
  Invoke-TradeImportAdminSql `
    "drop database if exists $script:TradeImportDatabase with (force);" | Out-Null
  Write-Output 'Trade-import disposable database cleanup PASS.'
}
