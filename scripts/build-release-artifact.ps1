$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$artifactRoot = Join-Path $projectRoot 'release-artifacts'
$packageFolderName = 'Equora Starter v57.61.0'
$stagingRoot = Join-Path $artifactRoot '.staging-v57.61.0'
$payloadRoot = Join-Path $stagingRoot $packageFolderName
$verificationRoot = Join-Path $artifactRoot '.verify-v57.61.0'
$zipPath = Join-Path $artifactRoot 'Equora_Starter_v57.61.0.zip'
$hashPath = Join-Path $artifactRoot 'Equora_Starter_v57.61.0.sha256.txt'
$fileListPath = Join-Path $artifactRoot 'Equora_Starter_v57.61.0.files.txt'

New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
$resolvedArtifactRoot = (Resolve-Path $artifactRoot).Path.TrimEnd([IO.Path]::DirectorySeparatorChar)
foreach ($temporaryRoot in @($stagingRoot, $verificationRoot)) {
  $resolvedTemporaryRoot = [IO.Path]::GetFullPath($temporaryRoot)
  if (-not $resolvedTemporaryRoot.StartsWith($resolvedArtifactRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe temporary artifact path: $temporaryRoot"
  }
}

$allowedRootFiles = @(
  '.env.example',
  '.gitignore',
  'BETA-TEST.md',
  'BROKER-SYNC.md',
  'BUILD-STATUS-v57.60.md',
  'GIT-SETUP.md',
  'INSTALL-v57.60.1.md',
  'INSTALL-v57.61.0.md',
  'INSTALL-v57.60.md',
  'INTEGRATION.md',
  'middleware.ts',
  'MIGRATION.md',
  'next-env.d.ts',
  'next.config.ts',
  'OPERATIONS-SOP-v57.60.1.md',
  'OPERATIONS-SOP-v57.61.0.md',
  'package-lock.json',
  'package.json',
  'PERFORMANCE-v57.55.md',
  'PERFORMANCE-v57.56.md',
  'PERFORMANCE-v57.57.md',
  'PERFORMANCE-v57.58.md',
  'postcss.config.js',
  'PRODUCT-GLOSSAR.md',
  'README.md',
  'RELEASE-v57.60.1.md',
  'RELEASE-v57.61.0.md',
  'RELEASE-v57.60.md',
  'tailwind.config.ts',
  'TRADINGVIEW-IMPORT.md',
  'tsconfig.json',
  'vercel.capture.pro.example.json',
  'vercel.json',
  'vitest.config.mts'
)

$allowedNestedFiles = @(
  'public/fonts/README.md'
)

$allowedExtensionsByDirectory = [ordered]@{
  'app' = @('.css', '.ts', '.tsx')
  'components' = @('.ts', '.tsx')
  'lib' = @('.ts', '.tsx')
  'public' = @('.png')
  'scripts' = @('.mjs', '.ps1')
  'supabase' = @('.sql')
  'tests' = @('.ps1', '.sql', '.ts', '.tsx')
  'types' = @('.ts')
}

$sourceFiles = [Collections.Generic.List[IO.FileInfo]]::new()
foreach ($relativeRootFile in $allowedRootFiles) {
  $sourcePath = Join-Path $projectRoot $relativeRootFile
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Required release file is missing: $relativeRootFile"
  }
  $sourceFiles.Add((Get-Item -LiteralPath $sourcePath -Force))
}

foreach ($relativeNestedFile in $allowedNestedFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $relativeNestedFile) -PathType Leaf)) {
    throw "Required release file is missing: $relativeNestedFile"
  }
}

foreach ($entry in $allowedExtensionsByDirectory.GetEnumerator()) {
  $directoryPath = Join-Path $projectRoot $entry.Key
  if (-not (Test-Path -LiteralPath $directoryPath -PathType Container)) {
    throw "Required release directory is missing: $($entry.Key)"
  }

  foreach ($file in Get-ChildItem -LiteralPath $directoryPath -Recurse -Force -File) {
    $relativeUnexpected = $file.FullName.Substring($projectRoot.Length).TrimStart([char]92, [char]47).Replace([char]92, [char]47)
    if ($entry.Value -notcontains $file.Extension.ToLowerInvariant() -and $allowedNestedFiles -notcontains $relativeUnexpected) {
      throw "File outside the release allowlist: $relativeUnexpected"
    }
    $sourceFiles.Add($file)
  }
}

foreach ($temporaryRoot in @($stagingRoot, $verificationRoot)) {
  if (Test-Path -LiteralPath $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
New-Item -ItemType Directory -Path $payloadRoot -Force | Out-Null

try {
  foreach ($file in $sourceFiles) {
    $relative = $file.FullName.Substring($projectRoot.Length).TrimStart([char]92, [char]47)
    $target = Join-Path $payloadRoot $relative
    $targetDirectory = Split-Path -Parent $target
    New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $target
  }

  $env:EQUORA_ZIP_CHECK = 'true'
  Push-Location $payloadRoot
  try {
    & node (Join-Path $payloadRoot 'scripts/release-check.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Staging release check failed.' }
  } finally {
    Pop-Location
  }

  $relativeFiles = Get-ChildItem -LiteralPath $stagingRoot -Recurse -Force -File |
    ForEach-Object { $_.FullName.Substring($stagingRoot.Length).TrimStart([char]92, [char]47).Replace([char]92, [char]47) } |
    Sort-Object
  Set-Content -LiteralPath $fileListPath -Value $relativeFiles -Encoding utf8

  if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
  $zipStream = [IO.File]::Open($zipPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  try {
    $archive = [IO.Compression.ZipArchive]::new(
      $zipStream, [IO.Compression.ZipArchiveMode]::Create, $false
    )
    try {
      foreach ($relativeFile in $relativeFiles) {
        $sourcePath = Join-Path $stagingRoot $relativeFile.Replace([char]47, [IO.Path]::DirectorySeparatorChar)
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
          $archive,
          $sourcePath,
          $relativeFile,
          [IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
      }
    } finally {
      $archive.Dispose()
    }
  } finally {
    $zipStream.Dispose()
  }

  $archiveReader = [IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $archiveEntries = @($archiveReader.Entries | ForEach-Object { $_.FullName } | Sort-Object)
    foreach ($entryName in $archiveEntries) {
      $segments = $entryName.Split([char]47)
      if ($entryName.Contains([char]92) -or $entryName.StartsWith([char]47) -or
          $segments -contains '..' -or $segments -contains '.') {
        throw "ZIP contains a non-canonical or unsafe entry name: $entryName"
      }
    }
    $centralDirectoryDifference = Compare-Object -ReferenceObject $relativeFiles -DifferenceObject $archiveEntries
    if ($centralDirectoryDifference) {
      throw "ZIP central directory does not match the canonical file manifest: $($centralDirectoryDifference | Out-String)"
    }
  } finally {
    $archiveReader.Dispose()
  }

  New-Item -ItemType Directory -Path $verificationRoot -Force | Out-Null
  [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $verificationRoot)
  $topLevelEntries = @(Get-ChildItem -LiteralPath $verificationRoot -Force)
  $hasSingleExpectedRoot = $topLevelEntries.Count -eq 1 -and $topLevelEntries[0].PSIsContainer -and $topLevelEntries[0].Name -eq $packageFolderName
  if (-not $hasSingleExpectedRoot) {
    throw "The generated ZIP must contain exactly one root folder named '$packageFolderName'."
  }
  $verifiedFiles = Get-ChildItem -LiteralPath $verificationRoot -Recurse -Force -File |
    ForEach-Object { $_.FullName.Substring($verificationRoot.Length).TrimStart([char]92, [char]47).Replace([char]92, [char]47) } |
    Sort-Object
  $archiveDifference = Compare-Object -ReferenceObject $relativeFiles -DifferenceObject $verifiedFiles
  if ($archiveDifference) {
    throw "The generated ZIP does not match the checked file manifest: $($archiveDifference | Out-String)"
  }

  foreach ($relativeFile in $relativeFiles) {
    $sourcePath = Join-Path $stagingRoot $relativeFile.Replace([char]47, [IO.Path]::DirectorySeparatorChar)
    $verifiedPath = Join-Path $verificationRoot $relativeFile.Replace([char]47, [IO.Path]::DirectorySeparatorChar)
    $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
    $verifiedHash = (Get-FileHash -LiteralPath $verifiedPath -Algorithm SHA256).Hash
    if ($sourceHash -cne $verifiedHash) {
      throw "Extracted ZIP content digest mismatch: $relativeFile"
    }
  }

  $verifiedPayloadRoot = Join-Path $verificationRoot $packageFolderName
  Push-Location $verifiedPayloadRoot
  try {
    & node (Join-Path $verifiedPayloadRoot 'scripts/release-check.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Extracted ZIP release check failed.' }
  } finally {
    Pop-Location
  }

  $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -LiteralPath $hashPath -Value "$hash  Equora_Starter_v57.61.0.zip" -Encoding ascii

  Write-Output "Release artifact: $zipPath"
  Write-Output "SHA-256: $hash"
  Write-Output "Files: $($relativeFiles.Count)"
  Write-Output "Root folder: $packageFolderName"
} finally {
  Remove-Item Env:EQUORA_ZIP_CHECK -ErrorAction SilentlyContinue
  foreach ($temporaryRoot in @($stagingRoot, $verificationRoot)) {
    if (Test-Path -LiteralPath $temporaryRoot) {
      Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
  }
}
