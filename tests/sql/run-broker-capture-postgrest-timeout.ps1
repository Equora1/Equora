param(
  [string]$DatabaseContainer = 'equora-v5761-pgtest',
  [string]$Database = 'equora_hmac_test3',
  [string]$PostgrestImage = 'postgrest/postgrest:v14.15',
  [string]$ProbeContainer = 'equora-v5761-postgrest-timeout',
  [string]$NetworkName = 'equora-v5761-timeout-net',
  [int]$HostPort = 33001
)

# Windows PowerShell surfaces native stderr as non-terminating ErrorRecords.
# Docker/PostgREST emits startup diagnostics there, so native exit codes are
# checked explicitly and PowerShell web failures opt into terminating behavior.
$ErrorActionPreference = 'Continue'

foreach ($value in @($DatabaseContainer, $ProbeContainer, $NetworkName)) {
  if ($value -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$') {
    throw 'Container and network names may contain only Docker-safe characters.'
  }
}
if ($Database -notmatch '^equora_[a-z0-9_]+$') {
  throw 'Database must be an explicitly named Equora test database.'
}
if ($PostgrestImage -notmatch '^postgrest/postgrest:v14\.[0-9]+$') {
  throw 'PostgrestImage must be an explicitly pinned official PostgREST v14 image.'
}
if ($HostPort -lt 1024 -or $HostPort -gt 65535) {
  throw 'HostPort must be between 1024 and 65535.'
}

$probeRole = 'equora_pgrst_timeout_probe'
$probeFunction = 'equora_postgrest_statement_timeout_probe_v1'
$probePassword = [Guid]::NewGuid().ToString('N')
$networkCreated = $false
$databaseConnected = $false
$probeStarted = $false

try {
  $configOutput = & docker run --rm `
    -e PGRST_DB_URI=postgres://example:example@localhost/example `
    -e PGRST_DB_ANON_ROLE=anon `
    -e PGRST_DB_SCHEMAS=public `
    $PostgrestImage postgrest --dump-config 2>$null
  $configText = $configOutput -join "`n"
  if ($LASTEXITCODE -ne 0 -or $configText -notmatch 'db-hoisted-tx-settings = ".*statement_timeout') {
    throw 'The pinned PostgREST runtime does not prove statement_timeout hoisting.'
  }

  $existingProbe = & docker ps -a --filter "name=^/$ProbeContainer$" --format '{{.Names}}'
  if ($existingProbe) {
    throw "Probe container already exists: $ProbeContainer"
  }

  $existingNetwork = & docker network ls --filter "name=^$NetworkName$" --format '{{.Name}}'
  if ($existingNetwork) {
    throw "Probe network already exists: $NetworkName"
  }

  & docker network create $NetworkName | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to create the isolated PostgREST probe network.' }
  $networkCreated = $true

  & docker network connect $NetworkName $DatabaseContainer
  if ($LASTEXITCODE -ne 0) { throw 'Failed to connect the local database container to the probe network.' }
  $databaseConnected = $true

  $setupSql = @"
set client_min_messages = warning;
drop function if exists public.$probeFunction();
drop role if exists $probeRole;
create role $probeRole noinherit login password '$probePassword';
grant service_role to $probeRole;
create function public.$probeFunction()
returns void
language plpgsql
security definer
set search_path = ''
set statement_timeout = '15s'
as `$function`$
begin
  perform pg_sleep(20);
end;
`$function`$;
revoke all on function public.$probeFunction() from public, anon, authenticated;
grant execute on function public.$probeFunction() to service_role;
"@
  $setupOutput = $setupSql | & docker exec -i $DatabaseContainer psql -q -U postgres -d $Database -v ON_ERROR_STOP=1 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to prepare the local PostgREST timeout probe: $($setupOutput -join [Environment]::NewLine)"
  }

  $databaseUri = "postgres://${probeRole}:${probePassword}@${DatabaseContainer}:5432/${Database}"
  $probeId = & docker run -d `
    --name $ProbeContainer `
    --network $NetworkName `
    -p "127.0.0.1:${HostPort}:3000" `
    -e "PGRST_DB_URI=$databaseUri" `
    -e PGRST_DB_SCHEMAS=public `
    -e PGRST_DB_ANON_ROLE=service_role `
    $PostgrestImage postgrest
  if ($LASTEXITCODE -ne 0 -or -not $probeId) { throw 'Failed to start the local PostgREST probe.' }
  $probeStarted = $true

  $ready = $false
  for ($poll = 0; $poll -lt 100 -and -not $ready; $poll += 1) {
    try {
      $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$HostPort/" -TimeoutSec 2 -ErrorAction Stop
      $ready = $health.StatusCode -eq 200
    } catch {
      Start-Sleep -Milliseconds 100
    }
  }
  if (-not $ready) {
    $logs = & docker logs $ProbeContainer 2>&1
    throw "PostgREST probe did not become ready: $($logs -join [Environment]::NewLine)"
  }

  $timer = [Diagnostics.Stopwatch]::StartNew()
  $responseBody = $null
  try {
    Invoke-WebRequest `
      -UseBasicParsing `
      -Method Post `
      -Uri "http://127.0.0.1:$HostPort/rpc/$probeFunction" `
      -ContentType 'application/json' `
      -Body '{}' `
      -TimeoutSec 25 `
      -ErrorAction Stop | Out-Null
    throw 'PostgREST accepted the 20-second probe despite the 15-second function timeout.'
  } catch {
    $responseBody = $_.ErrorDetails.Message
    if (-not $responseBody -and $_.Exception.Response) {
      $stream = $_.Exception.Response.GetResponseStream()
      if ($stream) {
        $reader = [IO.StreamReader]::new($stream)
        try { $responseBody = $reader.ReadToEnd() } finally { $reader.Dispose() }
      }
    }
  } finally {
    $timer.Stop()
  }

  if ($responseBody -notmatch '"code"\s*:\s*"57014"' -or $responseBody -notmatch 'statement timeout' -or $timer.Elapsed.TotalSeconds -lt 13 -or $timer.Elapsed.TotalSeconds -gt 20) {
    throw "PostgREST did not enforce the hoisted 15-second statement timeout. Elapsed=$($timer.Elapsed.TotalSeconds) Response=$responseBody"
  }

  Write-Host ('PASS: PostgREST v14 hoisted the function statement_timeout and aborted SQLSTATE 57014 after {0:N2}s.' -f $timer.Elapsed.TotalSeconds)
}
finally {
  if ($probeStarted) {
    & docker rm -f $ProbeContainer | Out-Null
  }

  $cleanupSql = "set client_min_messages = warning; drop function if exists public.$probeFunction(); drop role if exists $probeRole;"
  $cleanupSql | & docker exec -i $DatabaseContainer psql -q -U postgres -d $Database -v ON_ERROR_STOP=1 2>$null | Out-Null

  if ($databaseConnected) {
    & docker network disconnect $NetworkName $DatabaseContainer 2>$null
  }
  if ($networkCreated) {
    & docker network rm $NetworkName 2>$null | Out-Null
  }
}
