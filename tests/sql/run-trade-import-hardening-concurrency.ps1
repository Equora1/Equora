param(
  [string]$ContainerName = 'equora-v5762-trade-import-pinned',
  [string]$TestDatabase = 'equora_full_deployment_trade_import_v5762'
)

. (Join-Path $PSScriptRoot 'trade-import-hardening-test-lib.ps1')
Initialize-TradeImportTestContext $ContainerName $TestDatabase

$setupSql = @'
insert into auth.users(id,email,created_at,updated_at)
values ('c1000000-0000-4000-8000-000000000001','concurrency@example.invalid',now(),now());
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',false);
select public.equora_upsert_import_account_v1(
 'c1000000-0000-4000-8000-000000000010','generic','Concurrency Account','EUR');
select public.equora_upsert_import_account_v1(
 'c1000000-0000-4000-8000-000000000011','ctrader-history','Concurrency Account','EUR');
'@
Invoke-TradeImportSqlText $setupSql 'Trade-import concurrency setup' | Out-Null

function New-TradeImportWorkerSql {
  param([string]$BatchId,[string]$FileName,[string]$Market,[string]$Preset='generic')
  $accountId='c1000000-0000-4000-8000-000000000010'
  $sourceKeys='[]'
  if($Preset -eq 'ctrader-history') {
    $accountId='c1000000-0000-4000-8000-000000000011'
    $sourceKeys='[{"kind":"provider_identity_v1","identityKind":"deal_id","identityValue":"concurrency-42"}]'
  }
  return @"
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select public.equora_import_trades_v2(
 '$BatchId','$accountId',
 '{"file_name":"$FileName","preset_key":"$Preset","preset_label":"Concurrency CSV","account_label":"Concurrency Account","account_currency":"EUR"}'::jsonb,
 '[{"row_number":2,"preview_status":"importable","selected":true}]'::jsonb,
 '[{"row_number":2,"trade":{"id":"c1000000-0000-4000-8000-000000000099","created_at":"2026-08-30T10:00:00.000Z","market":"$Market","setup":"Imported execution","bias":"long","net_pnl":"12.50","position_size":"0.0100","account_currency":"USD","broker_profile":"generic","account_template":"spot"},"tags":["CSV Import"],"source_keys":$sourceKeys}]'::jsonb
);
"@
}

$worker = {
  param($Container,$Database,$ApplicationName,$Sql)
  $payload="set application_name='$ApplicationName';" + [Environment]::NewLine + $Sql
  $output=$payload | & docker exec -i $Container psql -U postgres -d $Database -At -v ON_ERROR_STOP=1 2>&1
  [pscustomobject]@{ExitCode=$LASTEXITCODE;Output=($output -join [Environment]::NewLine)}
}

function Wait-TradeImportWorkerState {
  param([string]$ApplicationName,[string]$WaitEvent,[int]$TimeoutMilliseconds=2200)
  if($ApplicationName -notmatch '^equora_ti_[a-z0-9_]+$'){throw 'Invalid fixture application name.'}
  $timer=[Diagnostics.Stopwatch]::StartNew()
  do {
    $state=Get-TradeImportScalar "select coalesce((select state||'|'||coalesce(wait_event_type,'')||'|'||coalesce(wait_event,'') from pg_stat_activity where application_name='$ApplicationName'),'missing');"
    if($state -eq "active|Lock|$WaitEvent"){return $state}
    Start-Sleep -Milliseconds 25
  } while($timer.ElapsedMilliseconds -lt $TimeoutMilliseconds)
  throw "Bounded lock observation failed for $($ApplicationName): $state"
}

function Invoke-TradeImportRace {
  param(
    [string]$Scenario,[string]$FirstSql,[string]$SecondSql,
    [string]$SecondWaitEvent,[switch]$ExpectTimeout,[switch]$SecondOwnTransaction
  )
  $firstApplication="equora_ti_$($Scenario)_first"
  $secondApplication="equora_ti_$($Scenario)_second"
  $first=$null
  $secondJob=$null
  try {
    # Persistent local psql stdin is the release barrier; no fixed sleep
    # determines success. Commit follows the observed competing lock.
    $startInfo=New-Object Diagnostics.ProcessStartInfo
    $startInfo.FileName=(Get-Command docker -ErrorAction Stop).Source
    $startInfo.Arguments="exec -i $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1"
    $startInfo.UseShellExecute=$false
    $startInfo.CreateNoWindow=$true
    $startInfo.RedirectStandardInput=$true
    $startInfo.RedirectStandardOutput=$true
    $startInfo.RedirectStandardError=$true
    $first=New-Object Diagnostics.Process
    $first.StartInfo=$startInfo
    if(-not $first.Start()){throw 'First fixture worker failed to start.'}
    $stderr=$first.StandardError.ReadToEndAsync()
    $first.StandardInput.WriteLine("set application_name='$firstApplication';")
    $first.StandardInput.WriteLine("begin; set local statement_timeout='30s'; set local idle_in_transaction_session_timeout='30s';")
    $first.StandardInput.WriteLine($FirstSql)
    $first.StandardInput.WriteLine('\echo EQUORA_FIRST_READY')
    $first.StandardInput.Flush()
    $firstLines=New-Object 'Collections.Generic.List[string]'
    do {
      $read=$first.StandardOutput.ReadLineAsync()
      if(-not $read.Wait(30000)){throw 'First fixture readiness timeout.'}
      $line=$read.Result
      if($null -eq $line){throw "First fixture failed before barrier: $($stderr.GetAwaiter().GetResult())"}
      $firstLines.Add($line)
    } while($line -ne 'EQUORA_FIRST_READY')
    if(-not $SecondOwnTransaction){
      $SecondSql="begin; set local statement_timeout='30s';" + [Environment]::NewLine + $SecondSql + [Environment]::NewLine + 'commit;'
    }
    $secondJob=Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,$secondApplication,$SecondSql
    $observed=Wait-TradeImportWorkerState $secondApplication $SecondWaitEvent
    if($ExpectTimeout){
      if($null -eq (Wait-Job -Job $secondJob -Timeout 8)){throw 'Expected lock timeout did not finish.'}
    }
    $first.StandardInput.WriteLine('commit;')
    $first.StandardInput.Close()
    if(-not $first.WaitForExit(10000)){throw 'First fixture commit timed out.'}
    $firstError=$stderr.GetAwaiter().GetResult()
    if($first.ExitCode -ne 0){throw "First fixture commit failed: $firstError"}
    if($null -eq (Wait-Job -Job $secondJob -Timeout 30)){throw 'Second fixture timed out.'}
    $second=Receive-Job -Job $secondJob
    return [pscustomobject]@{
      FirstOutput=($firstLines -join [Environment]::NewLine)
      Second=$second
      ObservedWait=$observed
    }
  } finally {
    if($null -ne $first){
      if(-not $first.HasExited){
        try { $first.StandardInput.WriteLine('rollback;'); $first.StandardInput.Close() } catch {}
        if(-not $first.WaitForExit(5000)){ $first.Kill() }
      }
      $first.Dispose()
    }
    if($null -ne $secondJob){
      if($secondJob.State -notin @('Completed','Failed','Stopped')){Stop-Job $secondJob -ErrorAction SilentlyContinue}
      Remove-Job $secondJob -Force -ErrorAction SilentlyContinue
    }
  }
}

$sourceRace=Invoke-TradeImportRace 'source_key' (New-TradeImportWorkerSql 'c1000000-0000-4000-8000-000000000020' 'source.csv' 'BTCUSDT' 'ctrader-history') (New-TradeImportWorkerSql 'c1000000-0000-4000-8000-000000000021' 'source.csv' 'BTCUSDT' 'ctrader-history') 'transactionid'
# Same-account locking serializes the full RPC before unique reservation.
# This proves the RPC result, not that the wait itself is index-level.
if($sourceRace.Second.ExitCode -ne 0 -or $sourceRace.FirstOutput -notmatch '"importedCount"\s*:\s*1' -or $sourceRace.Second.Output -notmatch '"duplicateCount"\s*:\s*1'){
  throw "Provider-identity race failed: $($sourceRace.Second.Output)"
}
$replaySql=New-TradeImportWorkerSql 'c1000000-0000-4000-8000-000000000030' 'replay.csv' 'ETHUSDT'
$replay=Invoke-TradeImportRace 'exact_replay' $replaySql $replaySql 'advisory'
if($replay.Second.ExitCode -ne 0 -or $replay.Second.Output -notmatch '"alreadyApplied"\s*:\s*true'){
  throw "Exact replay failed: $($replay.Second.Output)"
}
$mismatch=Invoke-TradeImportRace 'replay_mismatch' (New-TradeImportWorkerSql 'c1000000-0000-4000-8000-000000000040' 'first.csv' 'SOLUSDT') (New-TradeImportWorkerSql 'c1000000-0000-4000-8000-000000000040' 'changed.csv' 'SOLUSDT') 'advisory'
if($mismatch.Second.ExitCode -eq 0 -or $mismatch.Second.Output -notmatch 'BATCH_REPLAY_MISMATCH'){
  throw "Changed replay did not fail atomically: $($mismatch.Second.Output)"
}
$retrySql=New-TradeImportWorkerSql 'c1000000-0000-4000-8000-000000000061' 'timeout-retry.csv' 'ADAUSDT'
$timeout=Invoke-TradeImportRace 'lock_timeout' (New-TradeImportWorkerSql 'c1000000-0000-4000-8000-000000000060' 'timeout-first.csv' 'ADAUSDT') $retrySql 'transactionid' -ExpectTimeout
if($timeout.Second.ExitCode -eq 0 -or $timeout.Second.Output -notmatch 'lock timeout'){
  throw "Expected lock-timeout failure missing: $($timeout.Second.Output)"
}
if((Get-TradeImportScalar "select count(*) from public.trade_import_batches where id='c1000000-0000-4000-8000-000000000061';") -ne '0'){
  throw 'Lock-timeout left a partial batch.'
}
Invoke-TradeImportSqlText ("begin; set local statement_timeout='30s';" + [Environment]::NewLine + $retrySql + [Environment]::NewLine + 'commit;') 'Successful retry after lock timeout' | Out-Null
$deactivation=Expand-TradeImportV5762File -Name 'deactivate-v57.62.0-trade-import.sql'
$gate=Invoke-TradeImportRace 'gate_deactivate' (New-TradeImportWorkerSql 'c1000000-0000-4000-8000-000000000050' 'gate-race.csv' 'XRPUSDT') $deactivation 'transactionid' -SecondOwnTransaction
if($gate.Second.ExitCode -ne 0){throw "Gate deactivation race failed: $($gate.Second.Output)"}
if((Get-TradeImportScalar "select (not enabled and activated_at is null)::text from public.equora_runtime_capability_gates where capability_key='journal_file_import_persistence_v2' and contract_version='equora-broker-file-import-capability-v1';") -ne 'true'){
  throw 'Gate did not close after admitted transaction committed.'
}
$state=Get-TradeImportScalar @'
select
 (select count(*) from public.trade_import_batches where user_id='c1000000-0000-4000-8000-000000000001')::text||'|'||
 (select sum(imported_count) from public.trade_import_batches where user_id='c1000000-0000-4000-8000-000000000001')::text||'|'||
 (select sum(duplicate_count) from public.trade_import_batches where user_id='c1000000-0000-4000-8000-000000000001')::text||'|'||
 (select count(*) from public.trades where user_id='c1000000-0000-4000-8000-000000000001')::text||'|'||
 (select count(*) from public.trade_import_source_keys where user_id='c1000000-0000-4000-8000-000000000001' and status='active')::text||'|'||
 (select count(*) from public.trade_import_source_keys where user_id='c1000000-0000-4000-8000-000000000001' and status='active' and trade_id is null)::text||'|'||
 (select count(*) from public.trades where id='c1000000-0000-4000-8000-000000000099')::text;
'@
if($state -ne '7|6|1|6|6|0|0'){throw "Trade-import concurrency state invalid: $state"}
Write-Output 'Trade-import concurrency gate PASS: bounded barrier, account-serialized provider identity, exact replay, changed replay, lock timeout/rollback/retry and gate/deactivation.'
