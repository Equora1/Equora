param(
  [string]$ContainerName = 'equora-v5762-trade-import-pinned',
  [string]$TestDatabase = 'equora_full_deployment_trade_import_v5762'
)

. (Join-Path $PSScriptRoot 'trade-import-hardening-test-lib.ps1')
Initialize-TradeImportTestContext $ContainerName $TestDatabase

if ((Get-TradeImportScalar `
    "select to_regprocedure('public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)') is not null;") -ne 't') {
  throw 'Trade-import concurrency gate requires the applied v57.62 candidate.'
}

$setupSql = @'
insert into auth.users(id,email,created_at,updated_at)
values ('c1000000-0000-4000-8000-000000000001','concurrency@example.invalid',now(),now());
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',false);
select public.equora_upsert_import_account_v1(
  'c1000000-0000-4000-8000-000000000010',
  'generic','Concurrency Account','EUR'
);
'@
Invoke-TradeImportSqlText $setupSql 'Trade-import concurrency setup' | Out-Null

$worker = {
  param(
    $Container,
    $Database,
    $BatchId,
    $ApplicationName,
    $HoldSeconds,
    $FileName,
    $Market
  )
  $sql = @"
set application_name='$ApplicationName';
begin;
set local statement_timeout='90s';
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select public.equora_import_trades_v2(
  '$BatchId',
  'c1000000-0000-4000-8000-000000000010',
  '{"file_name":"$FileName","preset_key":"generic","preset_label":"Generic CSV","account_label":"Concurrency Account","account_currency":"EUR"}'::jsonb,
  '[{"row_number":2,"preview_status":"importable","selected":true}]'::jsonb,
  '[{"row_number":2,"trade":{"id":"c1000000-0000-4000-8000-000000000099","created_at":"2026-08-30T10:00:00.000Z","market":"$Market","setup":"Imported execution","bias":"long","net_pnl":"12.50","position_size":"0.0100","account_currency":"USD","broker_profile":"generic","account_template":"spot"},"tags":["CSV Import"],"source_keys":[]}]'::jsonb
);
select pg_sleep($HoldSeconds);
commit;
"@
  $output = $sql | & docker exec -i $Container psql -U postgres -d $Database `
    -At -v ON_ERROR_STOP=1 2>&1
  [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = ($output -join "`n")
  }
}

function Wait-TradeImportWorkerState {
  param(
    [Parameter(Mandatory = $true)][string]$ApplicationName,
    [Parameter(Mandatory = $true)][string]$WaitEventType,
    [Parameter(Mandatory = $true)][string]$WaitEvent,
    [int]$TimeoutSeconds = 60
  )

  if ($ApplicationName -notmatch '^equora_ti_[a-z0-9_]+$') {
    throw 'Trade-import worker application name is not allowlisted.'
  }
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  do {
    $state = Get-TradeImportScalar "select coalesce((select state || '|' || coalesce(wait_event_type,'') || '|' || coalesce(wait_event,'') from pg_stat_activity where application_name='$ApplicationName'),'missing');"
    if ($state -eq "active|$WaitEventType|$WaitEvent") {
      return $state
    }
    Start-Sleep -Milliseconds 100
  } while ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds)
  throw "Trade-import worker state was not observed for ${ApplicationName}: $state"
}

function Invoke-TradeImportRace {
  param(
    [Parameter(Mandatory = $true)][string]$Scenario,
    [Parameter(Mandatory = $true)][string]$FirstBatchId,
    [Parameter(Mandatory = $true)][string]$SecondBatchId,
    [Parameter(Mandatory = $true)][string]$FirstFileName,
    [Parameter(Mandatory = $true)][string]$SecondFileName,
    [Parameter(Mandatory = $true)][string]$Market,
    [Parameter(Mandatory = $true)][string]$SecondWaitEvent
  )

  $firstApplication = "equora_ti_${Scenario}_first"
  $secondApplication = "equora_ti_${Scenario}_second"
  $firstJob = $null
  $secondJob = $null
  try {
    $firstJob = Start-Job -ScriptBlock $worker -ArgumentList `
      $ContainerName,$TestDatabase,$FirstBatchId,$firstApplication,60,`
      $FirstFileName,$Market
    Wait-TradeImportWorkerState $firstApplication 'Timeout' 'PgSleep' | Out-Null

    $secondJob = Start-Job -ScriptBlock $worker -ArgumentList `
      $ContainerName,$TestDatabase,$SecondBatchId,$secondApplication,0,`
      $SecondFileName,$Market
    $observedWait = Wait-TradeImportWorkerState `
      $secondApplication 'Lock' $SecondWaitEvent

    $completedJobs = @(Wait-Job -Job @($firstJob,$secondJob) -Timeout 90)
    if ($completedJobs.Count -ne 2) {
      throw "Trade-import concurrency jobs timed out for $Scenario."
    }

    return [pscustomobject]@{
      First = Receive-Job -Job $firstJob
      Second = Receive-Job -Job $secondJob
      ObservedWait = $observedWait
    }
  } finally {
    foreach ($job in @($firstJob,$secondJob)) {
      if ($null -eq $job) {
        continue
      }
      if ($job.State -notin @('Completed','Failed','Stopped')) {
        Stop-Job -Job $job -ErrorAction SilentlyContinue
      }
      Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
    }
  }
}

$sourceRace = Invoke-TradeImportRace `
  'source_key' `
  'c1000000-0000-4000-8000-000000000020' `
  'c1000000-0000-4000-8000-000000000021' `
  'concurrency.csv' `
  'concurrency.csv' `
  'BTCUSDT' `
  'transactionid'
$combinedOutput = $sourceRace.First.Output + "`n" + $sourceRace.Second.Output
$importWinnerCount = ([regex]::Matches(
  $combinedOutput, '"importedCount"\s*:\s*1'
)).Count
$duplicateWinnerCount = ([regex]::Matches(
  $combinedOutput, '"duplicateCount"\s*:\s*1'
)).Count
if ($sourceRace.ObservedWait -ne 'active|Lock|transactionid' `
    -or $sourceRace.First.ExitCode -ne 0 `
    -or $sourceRace.Second.ExitCode -ne 0 `
    -or $importWinnerCount -ne 1 -or $duplicateWinnerCount -ne 1) {
  throw "Trade-import source-key race invalid.`nFirst: $($sourceRace.First.Output)`nSecond: $($sourceRace.Second.Output)"
}

$exactReplayRace = Invoke-TradeImportRace `
  'exact_replay' `
  'c1000000-0000-4000-8000-000000000030' `
  'c1000000-0000-4000-8000-000000000030' `
  'same-batch.csv' `
  'same-batch.csv' `
  'ETHUSDT' `
  'advisory'
$exactReplayOutput = `
  $exactReplayRace.First.Output + "`n" + $exactReplayRace.Second.Output
if ($exactReplayRace.ObservedWait -ne 'active|Lock|advisory' `
    -or $exactReplayRace.First.ExitCode -ne 0 `
    -or $exactReplayRace.Second.ExitCode -ne 0 `
    -or ([regex]::Matches(
      $exactReplayOutput,'"alreadyApplied"\s*:\s*false'
    )).Count -ne 1 `
    -or ([regex]::Matches(
      $exactReplayOutput,'"alreadyApplied"\s*:\s*true'
    )).Count -ne 1) {
  throw "Trade-import exact replay race invalid.`nFirst: $($exactReplayRace.First.Output)`nSecond: $($exactReplayRace.Second.Output)"
}

$mismatchRace = Invoke-TradeImportRace `
  'replay_mismatch' `
  'c1000000-0000-4000-8000-000000000040' `
  'c1000000-0000-4000-8000-000000000040' `
  'mismatch-winner.csv' `
  'mismatch-loser.csv' `
  'SOLUSDT' `
  'advisory'
if ($mismatchRace.ObservedWait -ne 'active|Lock|advisory' `
    -or $mismatchRace.First.ExitCode -ne 0 `
    -or $mismatchRace.Second.ExitCode -eq 0 `
    -or $mismatchRace.Second.Output -notmatch 'BATCH_REPLAY_MISMATCH') {
  throw "Trade-import replay mismatch race invalid.`nFirst: $($mismatchRace.First.Output)`nSecond: $($mismatchRace.Second.Output)"
}

$state = Get-TradeImportScalar @'
select
  (select count(*) from public.trade_import_batches
    where user_id='c1000000-0000-4000-8000-000000000001')::text
  || '|' ||
  (select sum(imported_count) from public.trade_import_batches
    where user_id='c1000000-0000-4000-8000-000000000001')::text
  || '|' ||
  (select sum(duplicate_count) from public.trade_import_batches
    where user_id='c1000000-0000-4000-8000-000000000001')::text
  || '|' ||
  (select count(*) from public.trades
    where user_id='c1000000-0000-4000-8000-000000000001')::text
  || '|' ||
  (select count(*) from public.trade_import_source_keys
    where user_id='c1000000-0000-4000-8000-000000000001' and status='active')::text
  || '|' ||
  (select count(*) from public.trade_import_source_keys source_key
    left join public.trades trade on trade.id=source_key.trade_id
    where source_key.user_id='c1000000-0000-4000-8000-000000000001'
      and source_key.status='active' and trade.id is null)::text
  || '|' ||
  (select count(*) from public.trades
    where id='c1000000-0000-4000-8000-000000000099')::text;
'@
if ($state -ne '4|3|1|3|3|0|0') {
  throw "Trade-import concurrency persisted state invalid: $state"
}

Write-Output 'Trade-import concurrency gate PASS: source-key transaction wait, exact replay advisory wait and changed replay mismatch observed; no orphan key, partial trade or client-supplied trade ID.'
