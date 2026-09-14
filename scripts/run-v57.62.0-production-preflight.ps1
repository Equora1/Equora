[CmdletBinding()]
param(
  [ValidateSet('ValidateLocal', 'ExecuteReadOnly')]
  [string]$Mode = 'ValidateLocal',

  [string]$ExpectedHead,

  [string]$ExpectedProjectRef,

  [string]$EvidenceDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:RepositoryRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$script:ManifestPath = Join-Path $script:RepositoryRoot `
  'docs\gates\EQUORA_v57.62.0_PRODUCTION_SQL_MANIFEST.json'
$script:PreflightRelativePath = 'supabase/preflight-v57.62.0-trade-import.sql'
$script:RequiredProjectRef = 'rrkfdprhqilvicjbgfcn'

function Get-Sha256Hex {
  param([Parameter(Mandatory = $true)][byte[]]$Bytes)

  $sha256 = [Security.Cryptography.SHA256]::Create()
  try {
    return [BitConverter]::ToString($sha256.ComputeHash($Bytes)).Replace('-', '')
  }
  finally {
    $sha256.Dispose()
  }
}

function Get-CrlfNormalizedBytes {
  param([Parameter(Mandatory = $true)][byte[]]$Bytes)

  $stream = [IO.MemoryStream]::new()
  try {
    for ($index = 0; $index -lt $Bytes.Length; $index += 1) {
      if (
        $Bytes[$index] -eq 13 -and
        ($index + 1) -lt $Bytes.Length -and
        $Bytes[$index + 1] -eq 10
      ) {
        $stream.WriteByte(10)
        $index += 1
      }
      else {
        $stream.WriteByte($Bytes[$index])
      }
    }
    return $stream.ToArray()
  }
  finally {
    $stream.Dispose()
  }
}

function Invoke-GitText {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  $output = & git -c "safe.directory=$script:RepositoryRoot" `
    -C $script:RepositoryRoot @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: $($output -join [Environment]::NewLine)"
  }
  return ($output | Out-String).Trim()
}

function Assert-RequiredValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [AllowEmptyString()][string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name is required in ExecuteReadOnly mode."
  }
}

if (-not (Test-Path -LiteralPath $script:ManifestPath -PathType Leaf)) {
  throw "Production SQL manifest is missing: $script:ManifestPath"
}

$manifest = Get-Content -LiteralPath $script:ManifestPath -Raw | ConvertFrom-Json
$manifestEntries = @($manifest.files)
if ($manifest.schema -ne 'equora-v57.62.0-production-sql-manifest-v1') {
  throw 'Production SQL manifest schema is not recognized.'
}
if ($manifest.fileCount -ne 7 -or $manifestEntries.Count -ne 7) {
  throw 'Production SQL manifest must bind exactly seven files.'
}

$seenPaths = @{}
$verifiedFiles = @()
foreach ($entry in $manifestEntries) {
  if ($seenPaths.ContainsKey($entry.path)) {
    throw "Duplicate production SQL manifest path: $($entry.path)"
  }
  $seenPaths[$entry.path] = $true

  $candidatePath = [IO.Path]::GetFullPath((Join-Path $script:RepositoryRoot $entry.path))
  $repositoryPrefix = $script:RepositoryRoot.TrimEnd('\') + '\'
  if (-not $candidatePath.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Production SQL manifest path escapes the repository: $($entry.path)"
  }
  if (-not (Test-Path -LiteralPath $candidatePath -PathType Leaf)) {
    throw "Production SQL file is missing: $($entry.path)"
  }

  $normalizedBytes = Get-CrlfNormalizedBytes `
    -Bytes ([IO.File]::ReadAllBytes($candidatePath))
  $actualSha256 = Get-Sha256Hex -Bytes $normalizedBytes
  if ($actualSha256 -cne $entry.sha256 -or $normalizedBytes.Length -ne $entry.normalizedBytes) {
    throw "Production SQL manifest mismatch: $($entry.path)"
  }

  $verifiedFiles += [ordered]@{
    path = $entry.path
    normalizedBytes = $normalizedBytes.Length
    sha256 = $actualSha256
  }
}

$currentHead = Invoke-GitText -Arguments @('rev-parse', 'HEAD')
$currentBranch = Invoke-GitText -Arguments @('branch', '--show-current')
$originMain = Invoke-GitText -Arguments @('rev-parse', 'origin/main')
$worktreeStatus = Invoke-GitText -Arguments @('status', '--porcelain=v1', '--untracked-files=all')
$worktreeClean = [string]::IsNullOrWhiteSpace($worktreeStatus)
$manifestFileSha256 = Get-Sha256Hex `
  -Bytes ([IO.File]::ReadAllBytes($script:ManifestPath))

$localValidation = [ordered]@{
  schema = 'equora-v57.62.0-production-preflight-local-validation-v1'
  mode = $Mode
  branch = $currentBranch
  head = $currentHead
  originMain = $originMain
  worktreeClean = $worktreeClean
  sqlManifest = $script:ManifestPath
  sqlManifestSha256 = $manifestFileSha256
  sqlFileCount = $verifiedFiles.Count
  sqlFiles = $verifiedFiles
  hostedSupabaseAccessed = $false
  databaseMutationAttempted = $false
}

if ($Mode -eq 'ValidateLocal') {
  $localValidation | ConvertTo-Json -Depth 6
  exit 0
}

Assert-RequiredValue -Name 'ExpectedHead' -Value $ExpectedHead
Assert-RequiredValue -Name 'ExpectedProjectRef' -Value $ExpectedProjectRef
Assert-RequiredValue -Name 'EvidenceDirectory' -Value $EvidenceDirectory

if ($ExpectedHead -notmatch '^[0-9a-f]{40}$') {
  throw 'ExpectedHead must be an exact lowercase 40-character Git commit ID.'
}
if ($ExpectedProjectRef -notmatch '^[a-z0-9]{20}$') {
  throw 'ExpectedProjectRef must be an exact 20-character Supabase project ref.'
}
if ($ExpectedProjectRef -cne $script:RequiredProjectRef) {
  throw 'ExpectedProjectRef does not match the reviewed Equora Production target.'
}
if ($currentHead -cne $ExpectedHead) {
  throw "Current HEAD does not match ExpectedHead: $currentHead"
}
if (-not $worktreeClean) {
  throw 'ExecuteReadOnly requires a clean working tree, including no untracked files.'
}

$resolvedEvidenceDirectory = [IO.Path]::GetFullPath($EvidenceDirectory)
$repositoryPrefixForEvidence = $script:RepositoryRoot.TrimEnd('\') + '\'
if ($resolvedEvidenceDirectory.StartsWith(
    $repositoryPrefixForEvidence,
    [StringComparison]::OrdinalIgnoreCase
  )) {
  throw 'EvidenceDirectory must be outside the repository.'
}

$connectionUrl = [Environment]::GetEnvironmentVariable(
  'EQUORA_SUPABASE_DIRECT_URL',
  'Process'
)
if ([string]::IsNullOrWhiteSpace($connectionUrl)) {
  throw 'EQUORA_SUPABASE_DIRECT_URL is missing from the current process environment.'
}

$connectionUri = $null
if (-not [Uri]::TryCreate($connectionUrl, [UriKind]::Absolute, [ref]$connectionUri)) {
  throw 'EQUORA_SUPABASE_DIRECT_URL is not a valid absolute URI.'
}
if ($connectionUri.Scheme -notin @('postgres', 'postgresql')) {
  throw 'EQUORA_SUPABASE_DIRECT_URL must use postgres or postgresql.'
}
$databaseHost = $connectionUri.DnsSafeHost
if (-not $databaseHost.EndsWith('.supabase.com', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Database host is not a Supabase host.'
}

$userInfoSeparator = $connectionUri.UserInfo.IndexOf(':')
if ($userInfoSeparator -lt 1) {
  throw 'Database URI must contain both user and password.'
}
$databaseUser = [Uri]::UnescapeDataString(
  $connectionUri.UserInfo.Substring(0, $userInfoSeparator)
)
$databasePassword = [Uri]::UnescapeDataString(
  $connectionUri.UserInfo.Substring($userInfoSeparator + 1)
)
$databaseName = $connectionUri.AbsolutePath.Trim('/')
$databasePort = if ($connectionUri.IsDefaultPort) { 5432 } else { $connectionUri.Port }
$directHostMatches = (
  $databaseHost -ceq "db.$ExpectedProjectRef.supabase.co" -and
  $databaseUser -ceq 'postgres'
)
$poolerIdentityMatches = $databaseUser -ceq "postgres.$ExpectedProjectRef"

if (-not ($directHostMatches -or $poolerIdentityMatches)) {
  throw 'Database URI does not bind to ExpectedProjectRef.'
}
if ($databasePort -ne 5432) {
  throw 'Production preflight requires the reviewed direct or session-pooler port 5432.'
}
if ($databaseName -cne 'postgres') {
  throw 'Production preflight requires database postgres.'
}
if ([string]::IsNullOrEmpty($databasePassword)) {
  throw 'Database URI password is empty.'
}

$psqlCommand = @(Get-Command psql -CommandType Application -ErrorAction Stop)[0]
$preflightPath = Join-Path $script:RepositoryRoot $script:PreflightRelativePath
$connectionDescriptor = (
  "host=$databaseHost port=$databasePort " +
  "dbname=$databaseName user=$databaseUser sslmode=require connect_timeout=10 " +
  'application_name=equora_v5762_readonly_preflight'
)
$connectionUri = $null

if (-not (Test-Path -LiteralPath $resolvedEvidenceDirectory)) {
  New-Item -ItemType Directory -Path $resolvedEvidenceDirectory | Out-Null
}
$timestamp = [DateTimeOffset]::Now.ToString('yyyyMMdd-HHmmsszzz').Replace(':', '')
$logPath = Join-Path $resolvedEvidenceDirectory "v5762-production-preflight-$timestamp.log"
$receiptPath = Join-Path $resolvedEvidenceDirectory "v5762-production-preflight-$timestamp.json"
if ((Test-Path -LiteralPath $logPath) -or (Test-Path -LiteralPath $receiptPath)) {
  throw 'Refusing to overwrite existing preflight evidence.'
}

$previousPgPassword = [Environment]::GetEnvironmentVariable('PGPASSWORD', 'Process')
$previousPgOptions = [Environment]::GetEnvironmentVariable('PGOPTIONS', 'Process')
$previousPgAppName = [Environment]::GetEnvironmentVariable('PGAPPNAME', 'Process')
$startedAt = [DateTimeOffset]::Now
$outputLines = @()
$exitCode = -1

try {
  $env:PGPASSWORD = $databasePassword
  $env:PGOPTIONS = (
    '-c default_transaction_read_only=on ' +
    '-c statement_timeout=45000 ' +
    '-c idle_in_transaction_session_timeout=60000'
  )
  $env:PGAPPNAME = 'equora_v5762_readonly_preflight'

  $outputLines = @(& $psqlCommand.Source `
    '-X' `
    '--no-psqlrc' `
    '-v' 'ON_ERROR_STOP=1' `
    '-d' $connectionDescriptor `
    '-f' $preflightPath 2>&1 | ForEach-Object { "$_" })
  $exitCode = $LASTEXITCODE
}
finally {
  [Environment]::SetEnvironmentVariable('PGPASSWORD', $previousPgPassword, 'Process')
  [Environment]::SetEnvironmentVariable('PGOPTIONS', $previousPgOptions, 'Process')
  [Environment]::SetEnvironmentVariable('PGAPPNAME', $previousPgAppName, 'Process')
  $databasePassword = $null
  $connectionUrl = $null
}

$utf8NoBom = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllLines($logPath, $outputLines, $utf8NoBom)
$preflightPassed = (
  $exitCode -eq 0 -and
  ($outputLines -join "`n") -match
    'v57\.62\.0 trade-import preflight PASS; apply_required= (true|false)'
)
$completedAt = [DateTimeOffset]::Now
$logSha256 = Get-Sha256Hex -Bytes ([IO.File]::ReadAllBytes($logPath))
$receipt = [ordered]@{
  schema = 'equora-v57.62.0-production-preflight-receipt-v1'
  startedAt = $startedAt.ToString('o')
  completedAt = $completedAt.ToString('o')
  mode = 'ExecuteReadOnly'
  expectedProjectRef = $ExpectedProjectRef
  databaseHost = $databaseHost
  databasePort = $databasePort
  databaseName = $databaseName
  databaseUser = $databaseUser
  expectedHead = $ExpectedHead
  actualHead = $currentHead
  branch = $currentBranch
  worktreeClean = $worktreeClean
  sqlManifestSha256 = $manifestFileSha256
  sqlFileCount = $verifiedFiles.Count
  forcedDefaultTransactionReadOnly = $true
  psqlExitCode = $exitCode
  preflightPassed = $preflightPassed
  logFile = [IO.Path]::GetFileName($logPath)
  logSha256 = $logSha256
  deploymentAttempted = $false
  activationAttempted = $false
}
[IO.File]::WriteAllText(
  $receiptPath,
  (($receipt | ConvertTo-Json -Depth 6) + "`n"),
  $utf8NoBom
)

if (-not $preflightPassed) {
  throw "Production preflight failed. Review evidence outside the repository: $receiptPath"
}

$receipt | ConvertTo-Json -Depth 6
