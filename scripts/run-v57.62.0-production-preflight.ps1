[CmdletBinding()]
param(
  [ValidateSet('ValidateLocal', 'ExecuteReadOnly')]
  [string]$Mode = 'ValidateLocal',

  [string]$ExpectedHead,

  [string]$ExpectedProjectRef,

  [string]$ExpectedDatabaseHost,

  [string]$EvidenceDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:RepositoryRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$script:ManifestPath = Join-Path $script:RepositoryRoot `
  'docs\gates\EQUORA_v57.62.0_PRODUCTION_SQL_MANIFEST.json'
$script:PreflightRelativePath = 'supabase/preflight-v57.62.0-trade-import.sql'
$script:RequiredProjectRef = 'rrkfdprhqilvicjbgfcn'
$script:RequiredSourceCommit = '889a145e3443e52e5298ae945f53e3a8f44dc50b'
$script:RequiredSourceTree = '0868907cd1fb05abdd9072541f6b24f05bff3196'
$script:RequiredManifestAlgorithm = (
  'SHA-256 over file bytes after replacing CRLF with LF; ' +
  'lone CR and all other bytes are preserved'
)
$script:RequiredSqlPaths = @(
  'supabase/preflight-v57.62.0-trade-import.sql',
  'supabase/deploy-v57.62.0-trade-import.sql',
  'supabase/postflight-v57.62.0-trade-import.sql',
  'supabase/schema-patch-v57.62.0-trade-import-hardening.sql',
  'supabase/verify-v57.62.0-trade-import.sql',
  'supabase/activate-v57.62.0-trade-import.sql',
  'supabase/deactivate-v57.62.0-trade-import.sql'
)

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

function Test-FullyQualifiedPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not [IO.Path]::IsPathRooted($Path)) {
    return $false
  }
  if ([IO.Path]::DirectorySeparatorChar -eq '\') {
    if ($Path -notmatch '^[A-Za-z]:[\\/]') {
      return $false
    }
    if ($Path -match '(?:^|[\\/])[^\\/]*~[0-9]+[^\\/]*(?:[\\/]|$)') {
      return $false
    }
    return $true
  }
  return $Path.StartsWith('/', [StringComparison]::Ordinal)
}

function Get-WindowsDosDeviceTarget {
  param([Parameter(Mandatory = $true)][string]$DriveRoot)

  if ([IO.Path]::DirectorySeparatorChar -ne '\') {
    return $null
  }

  $driveName = $DriveRoot.TrimEnd([char[]]@('\', '/'))
  if ($driveName -notmatch '^[A-Za-z]:$') {
    throw "Cannot resolve DOS-device target for invalid drive root: $DriveRoot"
  }

  if ($null -eq ('EquoraPathNativeMethods' -as [type])) {
    Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
using System.Text;

public static class EquoraPathNativeMethods
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern uint QueryDosDevice(
        string lpDeviceName,
        StringBuilder lpTargetPath,
        int ucchMax
    );
}
'@
  }

  $targetBuffer = [Text.StringBuilder]::new(32768)
  $targetLength = [EquoraPathNativeMethods]::QueryDosDevice(
    $driveName,
    $targetBuffer,
    $targetBuffer.Capacity
  )
  if ($targetLength -eq 0) {
    $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "Cannot resolve DOS-device target for $driveName (Win32 error $errorCode)."
  }

  return $targetBuffer.ToString()
}

function Assert-TrustedWindowsDriveDescriptor {
  param(
    [Parameter(Mandatory = $true)][string]$ValueName,
    [Parameter(Mandatory = $true)][string]$DriveRoot,
    [Parameter(Mandatory = $true)][string]$DriveType,
    [Parameter(Mandatory = $true)][string]$IsReady,
    [Parameter(Mandatory = $true)][string]$DosDeviceTarget,
    [Parameter(Mandatory = $true)][string]$RepositoryDriveRoot,
    [Parameter(Mandatory = $true)][string]$RepositoryDosDeviceTarget
  )

  if ($DriveType -cne 'Fixed' -or $IsReady -cne 'true') {
    throw "$ValueName must be located on a ready fixed local drive."
  }
  if (
    $DosDeviceTarget.StartsWith('\??\', [StringComparison]::OrdinalIgnoreCase) -or
    $DosDeviceTarget.StartsWith('\DosDevices\', [StringComparison]::OrdinalIgnoreCase)
  ) {
    throw "$ValueName must not use a SUBST or DOS-device alias."
  }
  if (-not $DosDeviceTarget.StartsWith('\Device\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "$ValueName must resolve directly to a recognized local device."
  }
  if (
    -not $DriveRoot.Equals(
      $RepositoryDriveRoot,
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    $repositoryDevicePrefix = (
      $RepositoryDosDeviceTarget.TrimEnd([char[]]@('\', '/')) + '\'
    )
    $aliasesRepositoryVolume = (
      $DosDeviceTarget.Equals(
        $RepositoryDosDeviceTarget,
        [StringComparison]::OrdinalIgnoreCase
      ) -or
      $DosDeviceTarget.StartsWith(
        $repositoryDevicePrefix,
        [StringComparison]::OrdinalIgnoreCase
      )
    )
    if ($aliasesRepositoryVolume) {
      throw "$ValueName must not alias the repository volume through another drive letter."
    }
  }
}

function Assert-TrustedWindowsDrive {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$ValueName
  )

  if ([IO.Path]::DirectorySeparatorChar -ne '\') {
    return
  }

  $driveRoot = [IO.Path]::GetPathRoot($Path)
  $repositoryDriveRoot = [IO.Path]::GetPathRoot($script:RepositoryRoot)
  $driveInfo = [IO.DriveInfo]::new($driveRoot)
  $dosDeviceTarget = Get-WindowsDosDeviceTarget -DriveRoot $driveRoot
  $repositoryDosDeviceTarget = Get-WindowsDosDeviceTarget -DriveRoot $repositoryDriveRoot

  Assert-TrustedWindowsDriveDescriptor -ValueName $ValueName -DriveRoot $driveRoot -DriveType $driveInfo.DriveType.ToString() -IsReady $driveInfo.IsReady.ToString().ToLowerInvariant() -DosDeviceTarget $dosDeviceTarget -RepositoryDriveRoot $repositoryDriveRoot -RepositoryDosDeviceTarget $repositoryDosDeviceTarget
}

function Resolve-ExternalEvidenceDirectory {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-FullyQualifiedPath -Path $Path)) {
    throw 'EvidenceDirectory must be a fully qualified absolute path.'
  }
  Assert-TrustedWindowsDrive -Path $Path -ValueName 'EvidenceDirectory'

  $fullPath = [IO.Path]::GetFullPath($Path)
  $pathRoot = [IO.Path]::GetPathRoot($fullPath)
  if ($fullPath.Equals($pathRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'EvidenceDirectory must not be a filesystem root.'
  }

  $trimCharacters = [char[]]@(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  )
  $candidatePath = $fullPath.TrimEnd($trimCharacters)
  $repositoryPath = ([IO.Path]::GetFullPath($script:RepositoryRoot)).TrimEnd(
    $trimCharacters
  )
  $repositoryPrefix = $repositoryPath + [IO.Path]::DirectorySeparatorChar
  $isRepositoryRoot = $candidatePath.Equals(
    $repositoryPath,
    [StringComparison]::OrdinalIgnoreCase
  )
  $isRepositoryChild = $candidatePath.StartsWith(
    $repositoryPrefix,
    [StringComparison]::OrdinalIgnoreCase
  )
  if ($isRepositoryRoot -or $isRepositoryChild) {
    throw 'EvidenceDirectory must be outside the repository.'
  }

  $pathCursor = [IO.DirectoryInfo]::new($candidatePath)
  while ($null -ne $pathCursor) {
    if (
      $pathCursor.Exists -and
      (($pathCursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
    ) {
      throw 'EvidenceDirectory must not traverse a reparse point or symbolic link.'
    }
    $pathCursor = $pathCursor.Parent
  }

  return $candidatePath
}

function Resolve-ProductionConnectionTarget {
  param(
    [Parameter(Mandatory = $true)][string]$ConnectionUrl,
    [Parameter(Mandatory = $true)][string]$ExpectedProjectRef,
    [Parameter(Mandatory = $true)][string]$ExpectedDatabaseHost
  )

  $connectionUri = $null
  if (-not [Uri]::TryCreate($ConnectionUrl, [UriKind]::Absolute, [ref]$connectionUri)) {
    throw 'Production database URL is not a valid absolute URI.'
  }
  if ($connectionUri.Scheme -notin @('postgres', 'postgresql')) {
    throw 'Production database URL must use postgres or postgresql.'
  }

  $expectedHost = $ExpectedDatabaseHost.Trim().TrimEnd('.').ToLowerInvariant()
  if (
    [string]::IsNullOrWhiteSpace($expectedHost) -or
    [Uri]::CheckHostName($expectedHost) -ne [UriHostNameType]::Dns
  ) {
    throw 'ExpectedDatabaseHost must be one exact DNS hostname.'
  }

  $databaseHost = $connectionUri.DnsSafeHost.TrimEnd('.').ToLowerInvariant()
  if ($databaseHost -cne $expectedHost) {
    throw 'Database URL host does not match ExpectedDatabaseHost.'
  }

  $userInfoSeparator = $connectionUri.UserInfo.IndexOf(':')
  if ($userInfoSeparator -lt 1) {
    throw 'Production database URL must contain both user and password.'
  }
  $databaseUser = [Uri]::UnescapeDataString(
    $connectionUri.UserInfo.Substring(0, $userInfoSeparator)
  )
  $databasePassword = [Uri]::UnescapeDataString(
    $connectionUri.UserInfo.Substring($userInfoSeparator + 1)
  )
  if ([string]::IsNullOrEmpty($databasePassword)) {
    throw 'Production database URL password is empty.'
  }

  $databaseName = $connectionUri.AbsolutePath.Trim('/')
  $databasePort = if ($connectionUri.IsDefaultPort) { 5432 } else { $connectionUri.Port }
  if ($databasePort -ne 5432) {
    throw 'Production preflight requires direct or shared session-pooler port 5432.'
  }
  if ($databaseName -cne 'postgres') {
    throw 'Production preflight requires database postgres.'
  }

  $requiredDirectHost = "db.$ExpectedProjectRef.supabase.co"
  $isDirectTarget = (
    $expectedHost -ceq $requiredDirectHost -and
    $databaseUser -ceq 'postgres'
  )
  $isSessionPoolerHost = $expectedHost -match (
    '^[a-z0-9]+-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$'
  )
  $isSessionPoolerTarget = (
    $isSessionPoolerHost -and
    $databaseUser -ceq "postgres.$ExpectedProjectRef"
  )
  if (-not ($isDirectTarget -or $isSessionPoolerTarget)) {
    throw 'Database target is not an accepted direct or shared session-pooler identity.'
  }

  return [ordered]@{
    connectionType = if ($isDirectTarget) { 'direct' } else { 'shared_session_pooler' }
    databaseHost = $databaseHost
    databasePort = $databasePort
    databaseName = $databaseName
    databaseUser = $databaseUser
    databasePassword = $databasePassword
  }
}

function Resolve-TrustedRootCertificate {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-FullyQualifiedPath -Path $Path)) {
    throw 'EQUORA_SUPABASE_SSL_ROOT_CERT must be a fully qualified absolute path.'
  }
  Assert-TrustedWindowsDrive -Path $Path -ValueName 'EQUORA_SUPABASE_SSL_ROOT_CERT'
  $certificatePath = [IO.Path]::GetFullPath($Path)
  if (-not (Test-Path -LiteralPath $certificatePath -PathType Leaf)) {
    throw 'EQUORA_SUPABASE_SSL_ROOT_CERT must reference an existing file.'
  }

  $trimCharacters = [char[]]@(
    [IO.Path]::DirectorySeparatorChar,
    [IO.Path]::AltDirectorySeparatorChar
  )
  $repositoryPath = ([IO.Path]::GetFullPath($script:RepositoryRoot)).TrimEnd(
    $trimCharacters
  )
  $repositoryPrefix = $repositoryPath + [IO.Path]::DirectorySeparatorChar
  if (
    $certificatePath.Equals($repositoryPath, [StringComparison]::OrdinalIgnoreCase) -or
    $certificatePath.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase)
  ) {
    throw 'EQUORA_SUPABASE_SSL_ROOT_CERT must be outside the repository.'
  }

  $certificateFile = [IO.FileInfo]::new($certificatePath)
  if (
    ($certificateFile.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
  ) {
    throw 'EQUORA_SUPABASE_SSL_ROOT_CERT must not traverse a reparse point or symbolic link.'
  }
  $pathCursor = $certificateFile.Directory
  while ($null -ne $pathCursor) {
    if (
      $pathCursor.Exists -and
      (($pathCursor.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
    ) {
      throw 'EQUORA_SUPABASE_SSL_ROOT_CERT must not traverse a reparse point or symbolic link.'
    }
    $pathCursor = $pathCursor.Parent
  }

  $certificateBytes = [IO.File]::ReadAllBytes($certificatePath)
  if ($certificateBytes.Length -eq 0) {
    throw 'EQUORA_SUPABASE_SSL_ROOT_CERT must not be empty.'
  }
  return [ordered]@{
    path = $certificatePath
    sha256 = Get-Sha256Hex -Bytes $certificateBytes
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
if ($manifest.sourceCommit -cne $script:RequiredSourceCommit) {
  throw 'Production SQL manifest sourceCommit does not match the reviewed source.'
}
if ($manifest.sourceTree -cne $script:RequiredSourceTree) {
  throw 'Production SQL manifest sourceTree does not match the reviewed source.'
}
if ($manifest.algorithm -cne $script:RequiredManifestAlgorithm) {
  throw 'Production SQL manifest algorithm does not match the reviewed algorithm.'
}
$manifestPaths = @($manifestEntries | ForEach-Object { $_.path } | Sort-Object)
$requiredManifestPaths = @($script:RequiredSqlPaths | Sort-Object)
if (
  [string]::Join('|', $manifestPaths) -cne
  [string]::Join('|', $requiredManifestPaths)
) {
  throw 'Production SQL manifest does not bind the exact reviewed seven-file set.'
}

$seenPaths = @{}
$verifiedFiles = @()
$manifestTrimCharacters = [char[]]@(
  [IO.Path]::DirectorySeparatorChar,
  [IO.Path]::AltDirectorySeparatorChar
)
$manifestRepositoryPrefix = (
  $script:RepositoryRoot.TrimEnd($manifestTrimCharacters) +
  [IO.Path]::DirectorySeparatorChar
)
foreach ($entry in $manifestEntries) {
  if ($seenPaths.ContainsKey($entry.path)) {
    throw "Duplicate production SQL manifest path: $($entry.path)"
  }
  $seenPaths[$entry.path] = $true

  $candidatePath = [IO.Path]::GetFullPath((Join-Path $script:RepositoryRoot $entry.path))
  if (
    -not $candidatePath.StartsWith(
      $manifestRepositoryPrefix,
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
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
$resolvedEvidenceDirectory = $null
if (-not [string]::IsNullOrWhiteSpace($EvidenceDirectory)) {
  $resolvedEvidenceDirectory = Resolve-ExternalEvidenceDirectory `
    -Path $EvidenceDirectory
}

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
  evidenceDirectoryValidated = $null -ne $resolvedEvidenceDirectory
  hostedSupabaseAccessed = $false
  databaseMutationAttempted = $false
}

if ($Mode -eq 'ValidateLocal') {
  $localValidation | ConvertTo-Json -Depth 6
  exit 0
}

Assert-RequiredValue -Name 'ExpectedHead' -Value $ExpectedHead
Assert-RequiredValue -Name 'ExpectedProjectRef' -Value $ExpectedProjectRef
Assert-RequiredValue -Name 'ExpectedDatabaseHost' -Value $ExpectedDatabaseHost
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

$connectionUrl = [Environment]::GetEnvironmentVariable(
  'EQUORA_SUPABASE_DATABASE_URL',
  'Process'
)
if ([string]::IsNullOrWhiteSpace($connectionUrl)) {
  throw 'EQUORA_SUPABASE_DATABASE_URL is missing from the current process environment.'
}
$connectionTarget = Resolve-ProductionConnectionTarget `
  -ConnectionUrl $connectionUrl `
  -ExpectedProjectRef $ExpectedProjectRef `
  -ExpectedDatabaseHost $ExpectedDatabaseHost
$databaseHost = $connectionTarget.databaseHost
$databasePort = $connectionTarget.databasePort
$databaseName = $connectionTarget.databaseName
$databaseUser = $connectionTarget.databaseUser
$databasePassword = $connectionTarget.databasePassword
$connectionType = $connectionTarget.connectionType

$sslRootCertificateInput = [Environment]::GetEnvironmentVariable(
  'EQUORA_SUPABASE_SSL_ROOT_CERT',
  'Process'
)
if ([string]::IsNullOrWhiteSpace($sslRootCertificateInput)) {
  throw 'EQUORA_SUPABASE_SSL_ROOT_CERT is missing from the current process environment.'
}
$sslRootCertificate = Resolve-TrustedRootCertificate `
  -Path $sslRootCertificateInput

$psqlCommand = @(Get-Command psql -CommandType Application -ErrorAction Stop)[0]
$psqlVersionLines = @(& $psqlCommand.Source '--version' 2>&1 | ForEach-Object { "$_" })
if ($LASTEXITCODE -ne 0 -or $psqlVersionLines.Count -eq 0) {
  throw 'Unable to obtain the selected psql version.'
}
$psqlVersion = ($psqlVersionLines -join ' ').Trim()
$preflightPath = Join-Path $script:RepositoryRoot $script:PreflightRelativePath
$connectionDescriptor = (
  "host=$databaseHost port=$databasePort " +
  "dbname=$databaseName user=$databaseUser sslmode=verify-full connect_timeout=10 " +
  'application_name=equora_v5762_readonly_preflight'
)

if (-not (Test-Path -LiteralPath $resolvedEvidenceDirectory)) {
  New-Item -ItemType Directory -Path $resolvedEvidenceDirectory | Out-Null
}
$resolvedEvidenceDirectory = Resolve-ExternalEvidenceDirectory `
  -Path $resolvedEvidenceDirectory
$timestamp = [DateTimeOffset]::Now.ToString('yyyyMMdd-HHmmsszzz').Replace(':', '')
$logPath = Join-Path $resolvedEvidenceDirectory "v5762-production-preflight-$timestamp.log"
$receiptPath = Join-Path $resolvedEvidenceDirectory "v5762-production-preflight-$timestamp.json"
if ((Test-Path -LiteralPath $logPath) -or (Test-Path -LiteralPath $receiptPath)) {
  throw 'Refusing to overwrite existing preflight evidence.'
}

$previousPgPassword = [Environment]::GetEnvironmentVariable('PGPASSWORD', 'Process')
$previousPgOptions = [Environment]::GetEnvironmentVariable('PGOPTIONS', 'Process')
$previousPgAppName = [Environment]::GetEnvironmentVariable('PGAPPNAME', 'Process')
$previousPgSslRootCert = [Environment]::GetEnvironmentVariable('PGSSLROOTCERT', 'Process')
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
  $env:PGSSLROOTCERT = $sslRootCertificate.path

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
  [Environment]::SetEnvironmentVariable(
    'PGSSLROOTCERT',
    $previousPgSslRootCert,
    'Process'
  )
  $databasePassword = $null
  $connectionUrl = $null
  $sslRootCertificateInput = $null
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
  expectedDatabaseHost = $ExpectedDatabaseHost
  connectionType = $connectionType
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
  sslMode = 'verify-full'
  sslRootCertificateSha256 = $sslRootCertificate.sha256
  psqlPath = $psqlCommand.Source
  psqlVersion = $psqlVersion
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
