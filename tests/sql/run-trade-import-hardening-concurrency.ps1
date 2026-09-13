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
    [string]$SecondWaitEvent,[switch]$ExpectTimeout,[switch]$SecondOwnTransaction,
    [string]$FirstAfterBarrierSql,[switch]$SecondCompletesBeforeRelease
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
    if($SecondCompletesBeforeRelease){
      if($null -eq (Wait-Job -Job $secondJob -Timeout 8)){throw 'Compatible worker blocked before first release.'}
      $observed='completed-before-release'
    } else {
      $observed=Wait-TradeImportWorkerState $secondApplication $SecondWaitEvent
    }
    if($ExpectTimeout){
      if($null -eq (Wait-Job -Job $secondJob -Timeout 8)){
        throw "Expected lock timeout did not finish: $Scenario"
      }
    }
    if($FirstAfterBarrierSql){$first.StandardInput.WriteLine($FirstAfterBarrierSql)}
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

# Hold the existing account row so the real mixed import pauses after taking
# its early ROW EXCLUSIVE lock on trades but before it can inspect the duplicate
# source key. Start a revert of the duplicate's original batch while paused.
# The revert must wait on trades; after release, the actual import processes the
# duplicate first, creates the second trade and commits without a deadlock.
$mixedBatchId='c1000000-0000-4000-8000-000000000082'
$mixedImport=@'
begin;
set local statement_timeout='30s';
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select public.equora_import_trades_v2(
 'c1000000-0000-4000-8000-000000000082',
 'c1000000-0000-4000-8000-000000000011',
 '{"file_name":"mixed-provider.csv","preset_key":"ctrader-history","preset_label":"Concurrency CSV","account_label":"Concurrency Account","account_currency":"EUR"}'::jsonb,
 '[{"row_number":2,"preview_status":"importable","selected":true},{"row_number":3,"preview_status":"importable","selected":true}]'::jsonb,
 '[{"row_number":2,"trade":{"created_at":"2026-08-30T10:00:00.000Z","market":"BTCUSDT","setup":"Imported execution","bias":"long","net_pnl":"12.50","position_size":"0.0100","account_currency":"USD","broker_profile":"generic","account_template":"spot"},"tags":["CSV Import"],"source_keys":[{"kind":"provider_identity_v1","identityKind":"deal_id","identityValue":"concurrency-42"}]},{"row_number":3,"trade":{"created_at":"2026-08-30T10:01:00.000Z","market":"ETHUSDT","setup":"Imported execution","bias":"long","net_pnl":"13.50","position_size":"0.0200","account_currency":"USD","broker_profile":"generic","account_template":"spot"},"tags":["CSV Import"],"source_keys":[{"kind":"provider_identity_v1","identityKind":"deal_id","identityValue":"concurrency-43"}]}]'::jsonb
);
commit;
'@
$mixedRevert=@'
begin;
set local statement_timeout='30s';
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.equora_revert_import_v1('c1000000-0000-4000-8000-000000000020');
rollback;
'@
$accountBlocker=$null
$mixedImportJob=$null
$mixedRevertJob=$null
try {
  $startInfo=New-Object Diagnostics.ProcessStartInfo
  $startInfo.FileName=(Get-Command docker -ErrorAction Stop).Source
  $startInfo.Arguments="exec -i $ContainerName psql -U postgres -d $TestDatabase -At -v ON_ERROR_STOP=1"
  $startInfo.UseShellExecute=$false
  $startInfo.CreateNoWindow=$true
  $startInfo.RedirectStandardInput=$true
  $startInfo.RedirectStandardOutput=$true
  $startInfo.RedirectStandardError=$true
  $accountBlocker=New-Object Diagnostics.Process
  $accountBlocker.StartInfo=$startInfo
  if(-not $accountBlocker.Start()){throw 'Mixed-import account blocker failed to start.'}
  $blockerError=$accountBlocker.StandardError.ReadToEndAsync()
  $accountBlocker.StandardInput.WriteLine("set application_name='equora_ti_mixed_account_block';")
  $accountBlocker.StandardInput.WriteLine("begin; set local statement_timeout='30s';")
  $accountBlocker.StandardInput.WriteLine("select id from public.journal_import_accounts where id='c1000000-0000-4000-8000-000000000011' for update;")
  $accountBlocker.StandardInput.WriteLine('\echo EQUORA_ACCOUNT_BLOCK_READY')
  $accountBlocker.StandardInput.Flush()
  do {
    $lineTask=$accountBlocker.StandardOutput.ReadLineAsync()
    if(-not $lineTask.Wait(30000)){throw 'Mixed-import account blocker readiness timeout.'}
    $blockerLine=$lineTask.Result
    if($null -eq $blockerLine){throw "Mixed-import account blocker failed: $($blockerError.GetAwaiter().GetResult())"}
  } while($blockerLine -ne 'EQUORA_ACCOUNT_BLOCK_READY')

  $mixedImportJob=Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,'equora_ti_mixed_import',$mixedImport
  [void](Wait-TradeImportWorkerState 'equora_ti_mixed_import' 'transactionid')
  $earlyTradeLock=Get-TradeImportScalar @"
select exists (
  select 1 from pg_catalog.pg_locks lock_row
  join pg_catalog.pg_stat_activity activity on activity.pid=lock_row.pid
  where activity.application_name='equora_ti_mixed_import'
    and lock_row.relation='public.trades'::regclass
    and lock_row.mode='RowExclusiveLock' and lock_row.granted
)::text;
"@
  if($earlyTradeLock -ne 'true'){
    throw 'Mixed import reached the account wait without the early trades writer lock.'
  }

  $mixedRevertJob=Start-Job -ScriptBlock $worker -ArgumentList $ContainerName,$TestDatabase,'equora_ti_mixed_revert',$mixedRevert
  [void](Wait-TradeImportWorkerState 'equora_ti_mixed_revert' 'relation')
  $accountBlocker.StandardInput.WriteLine('commit;')
  $accountBlocker.StandardInput.Close()
  if(-not $accountBlocker.WaitForExit(10000)){throw 'Mixed-import account blocker commit timed out.'}
  if($accountBlocker.ExitCode -ne 0){throw "Mixed-import account blocker commit failed: $($blockerError.GetAwaiter().GetResult())"}
  if($null -eq (Wait-Job -Job $mixedImportJob -Timeout 30)){throw 'Mixed import timed out.'}
  if($null -eq (Wait-Job -Job $mixedRevertJob -Timeout 30)){throw 'Mixed revert timed out.'}
  $mixedImportResult=Receive-Job -Job $mixedImportJob
  $mixedRevertResult=Receive-Job -Job $mixedRevertJob
  if($mixedImportResult.ExitCode -ne 0 -or $mixedImportResult.Output -notmatch '"duplicateCount"\s*:\s*1' -or $mixedImportResult.Output -notmatch '"importedCount"\s*:\s*1'){
    throw "Mixed duplicate/new import failed: $($mixedImportResult.Output)"
  }
  if($mixedRevertResult.ExitCode -ne 0 -or $mixedRevertResult.Output -notmatch '"deletedCount"\s*:\s*1'){
    throw "Mixed import/original revert failed: $($mixedRevertResult.Output)"
  }
} finally {
  if($null -ne $accountBlocker){
    if(-not $accountBlocker.HasExited){
      try{$accountBlocker.StandardInput.WriteLine('rollback;');$accountBlocker.StandardInput.Close()}catch{}
      if(-not $accountBlocker.WaitForExit(5000)){$accountBlocker.Kill()}
    }
    $accountBlocker.Dispose()
  }
  foreach($job in @($mixedImportJob,$mixedRevertJob)){
    if($null -ne $job){
      if($job.State -notin @('Completed','Failed','Stopped')){Stop-Job $job -ErrorAction SilentlyContinue}
      Remove-Job $job -Force -ErrorAction SilentlyContinue
    }
  }
}
if((Get-TradeImportScalar "select count(*)::text from public.trades where import_batch_id='$mixedBatchId';") -ne '1'){
  throw 'Mixed provider race did not preserve its one newly imported trade.'
}
Invoke-TradeImportSqlText @'
delete from public.trade_import_source_keys where batch_id='c1000000-0000-4000-8000-000000000082';
delete from public.trades where import_batch_id='c1000000-0000-4000-8000-000000000082';
delete from public.trade_import_batches where id='c1000000-0000-4000-8000-000000000082';
'@ 'Mixed provider/revert race cleanup' | Out-Null
Write-Output 'Provider duplicate/new import versus revert PASS: the real import held its trades writer lock before the account/source path; revert waited before source-key lock; both completed without deadlock.'

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
$gate=Invoke-TradeImportRace 'gate_deactivate' (New-TradeImportWorkerSql 'c1000000-0000-4000-8000-000000000050' 'gate-race.csv' 'XRPUSDT') $deactivation 'relation' -SecondOwnTransaction
if($gate.Second.ExitCode -ne 0){throw "Gate deactivation race failed: $($gate.Second.Output)"}
if((Get-TradeImportScalar "select (not enabled and activated_at is null)::text from public.equora_runtime_capability_gates where capability_key='journal_file_import_persistence_v2' and contract_version='equora-broker-file-import-capability-v1';") -ne 'true'){
  throw 'Gate did not close after admitted transaction committed.'
}
# Reproduce the activation row-lock -> UPDATE order while off is competing.
$activationRowLock="select enabled from public.equora_runtime_capability_gates where capability_key='journal_file_import_persistence_v2' and contract_version='equora-broker-file-import-capability-v1' for update;"
$activationUpdate="update public.equora_runtime_capability_gates set enabled=true,activated_at=transaction_timestamp() where capability_key='journal_file_import_persistence_v2' and contract_version='equora-broker-file-import-capability-v1';"
$activationRace=Invoke-TradeImportRace 'activation_then_off' $activationRowLock $deactivation 'relation' -SecondOwnTransaction -FirstAfterBarrierSql $activationUpdate
if($activationRace.Second.ExitCode -ne 0){throw "Activation/off lock-order race failed: $($activationRace.Second.Output)"}
# DDL acquired first must be visible to the post-lock effect guard.
$beforeDdl=Get-TradeImportPersistenceSnapshot
try {
  $ddlRace=Invoke-TradeImportRace 'ddl_then_off' 'alter table public.equora_runtime_capability_gates add constraint equora_gate_ddl_fixture check(true);' $deactivation 'relation' -SecondOwnTransaction
  if($ddlRace.Second.ExitCode -eq 0 -or $ddlRace.Second.Output -notmatch 'TRADE_IMPORT_DEACTIVATION_CHECK_EFFECTS_INVALID'){
    throw "Concurrent DDL escaped the off guard: $($ddlRace.Second.Output)"
  }
  if((Get-TradeImportPersistenceSnapshot) -ne $beforeDdl){throw 'Rejected DDL/off race changed persistence.'}
} finally {
  Invoke-TradeImportSqlText 'alter table public.equora_runtime_capability_gates drop constraint if exists equora_gate_ddl_fixture;' 'Concurrent DDL restoration' | Out-Null
}
# Execute the actual off body under the harness-owned transaction; the barrier
# replaces only its transaction boundaries and suppresses its COMMITTED echo.
$offBody=[regex]::Replace($deactivation,'(?m)^begin;\r?$','')
$offBody=[regex]::Replace($offBody,'(?m)^commit;\r?$','')
$offBody=[regex]::Replace($offBody,'(?m)^\\echo .*COMMITTED.*\r?$','')
if($offBody -eq $deactivation -or $offBody -match '(?m)^commit;\r?$'){throw 'Off-body transaction extraction failed.'}
$lateDdl="set local lock_timeout='3s'; alter table public.equora_runtime_capability_gates add constraint equora_gate_late_ddl_fixture check(true);"
$offThenDdl=Invoke-TradeImportRace 'off_then_ddl' $offBody $lateDdl 'relation' -ExpectTimeout
if($offThenDdl.Second.ExitCode -eq 0 -or $offThenDdl.Second.Output -notmatch 'lock timeout'){
  throw "Off failed to hold target DDL lock until commit: $($offThenDdl.Second.Output)"
}
if((Get-TradeImportScalar "select count(*) from pg_constraint where conrelid='public.equora_runtime_capability_gates'::regclass and conname='equora_gate_late_ddl_fixture';") -ne '0'){
  throw 'Timed-out target DDL left a constraint.'
}
if((Get-TradeImportScalar "select count(*)=1 and bool_and(not enabled and activated_at is null) from public.equora_runtime_capability_gates;") -ne 't'){
  throw 'Gate state invalid after lock-order races.'
}
$activation=Expand-TradeImportV5762File -Name 'activate-v57.62.0-trade-import.sql'
$activationBody=[regex]::Replace($activation,'(?m)^begin;\r?$','')
$activationBody=[regex]::Replace($activationBody,'(?m)^commit;\r?$','')
$activationBody=[regex]::Replace($activationBody,'(?m)^\\echo .*COMMITTED.*\r?$','')
if($activationBody -eq $activation -or $activationBody -match '(?m)^commit;\r?$'){throw 'Activation-body transaction extraction failed.'}
$schemaPatch=Expand-TradeImportV5762File -Name 'schema-patch-v57.62.0-trade-import-hardening.sql'
$concurrentMarkerId='equora_v57.62.0_concurrent_marker_fixture'
foreach($markerTarget in @(
  @{Name='marker_then_patch';Probe=$schemaPatch;Error='TRADE_IMPORT_PATCH_UNKNOWN_MARKER'},
  @{Name='marker_then_activate';Probe=$activation;Error='TRADE_IMPORT_ACTIVATION_UNKNOWN_MARKER'}
)){
  Set-TradeImportActivationState -Enabled $false
  $beforeMarkerRace=Get-TradeImportPersistenceSnapshot
  try {
    $markerWriter="insert into equora_private.schema_migrations(migration_id,contract_fingerprint) values('$concurrentMarkerId','ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');"
    $markerRace=Invoke-TradeImportRace $markerTarget.Name $markerWriter `
      $markerTarget.Probe 'relation' -SecondOwnTransaction
    if($markerRace.Second.ExitCode -eq 0 -or $markerRace.Second.Output -notmatch $markerTarget.Error){
      throw "Concurrent marker escaped $($markerTarget.Name): $($markerRace.Second.Output)"
    }
  } finally {
    Invoke-TradeImportSqlText "delete from equora_private.schema_migrations where migration_id='$concurrentMarkerId';" 'Concurrent marker cleanup' | Out-Null
  }
  if((Get-TradeImportPersistenceSnapshot) -cne $beforeMarkerRace){
    throw "Rejected $($markerTarget.Name) changed persistence after fixture cleanup."
  }
}
Write-Output 'Migration-marker concurrency PASS: patch and activation wait for a concurrent receipt writer, reject the committed unknown v57.62 marker and preserve persistence.'
$beforeActivationDdl=Get-TradeImportPersistenceSnapshot
try {
  $activationDdl=Invoke-TradeImportRace 'ddl_then_activate' 'create index equora_gate_activation_ddl_fixture on public.equora_runtime_capability_gates(enabled);' $activation 'relation' -SecondOwnTransaction
  if($activationDdl.Second.ExitCode -eq 0 -or $activationDdl.Second.Output -notmatch 'TRADE_IMPORT_VERIFY_GATE_INDEX_EFFECTS_INVALID'){
    throw "Concurrent DDL escaped activation verification: $($activationDdl.Second.Output)"
  }
  if((Get-TradeImportPersistenceSnapshot) -ne $beforeActivationDdl){throw 'Rejected DDL/activation race changed persistence.'}
} finally {
  Invoke-TradeImportSqlText 'drop index if exists public.equora_gate_activation_ddl_fixture;' 'Activation DDL restoration' | Out-Null
}
$lateActivationDdl="set local lock_timeout='3s'; create index equora_gate_activation_late_ddl_fixture on public.equora_runtime_capability_gates(enabled);"
$activationThenDdl=Invoke-TradeImportRace 'activate_then_ddl' $activationBody $lateActivationDdl 'relation' -ExpectTimeout
if($activationThenDdl.Second.ExitCode -eq 0 -or $activationThenDdl.Second.Output -notmatch 'lock timeout'){
  throw "Activation failed to hold target DDL lock until commit: $($activationThenDdl.Second.Output)"
}
if((Get-TradeImportScalar "select to_regclass('public.equora_gate_activation_late_ddl_fixture') is null;") -ne 't'){
  throw 'Timed-out activation DDL left an index.'
}
foreach($accountTimeout in @($false,$true)){
  $beforeAccountDdl=Get-TradeImportPersistenceSnapshot
  $accountScenario=if($accountTimeout){'account_ddl_first_timeout'}else{'account_ddl_first_visible'}
  try {
    $accountDdl=Invoke-TradeImportRace $accountScenario `
      'create index equora_account_ddl_fixture on public.journal_import_accounts(display_label);' `
      $activation 'relation' -SecondOwnTransaction -ExpectTimeout:$accountTimeout
    $accountError=if($accountTimeout){'lock timeout'}else{'TRADE_IMPORT_VERIFY_ACCOUNT_INDEX_EFFECTS_INVALID'}
    if($accountDdl.Second.ExitCode -eq 0 -or $accountDdl.Second.Output -notmatch $accountError){
      throw "Account DDL before activation was not rejected: $($accountDdl.Second.Output)"
    }
    if((Get-TradeImportPersistenceSnapshot) -cne $beforeAccountDdl){
      throw 'Rejected account DDL/activation changed persistence.'
    }
  } finally {
    Invoke-TradeImportSqlText 'drop index if exists public.equora_account_ddl_fixture;' 'Account concurrent DDL cleanup' | Out-Null
  }
  Set-TradeImportActivationState -Enabled $false
}
$lateAccountDdl="set local lock_timeout='3s'; create index equora_account_late_ddl_fixture on public.journal_import_accounts(display_label);"
try {
  $accountAfter=Invoke-TradeImportRace 'activate_account_ddl_late' `
    $activationBody $lateAccountDdl 'relation' -ExpectTimeout
  if($accountAfter.Second.ExitCode -eq 0 -or $accountAfter.Second.Output -notmatch 'lock timeout'){
    throw "Activation failed to hold account DDL lock until commit: $($accountAfter.Second.Output)"
  }
  if((Get-TradeImportScalar "select to_regclass('public.equora_account_late_ddl_fixture') is null;") -ne 't'){
    throw 'Timed-out account DDL left an index.'
  }
} finally {
  Invoke-TradeImportSqlText 'drop index if exists public.equora_account_late_ddl_fixture;' 'Account late DDL cleanup' | Out-Null
}
Set-TradeImportActivationState -Enabled $false
$accountWriter=Invoke-TradeImportRace 'account_writer_compatible' `
  'lock table only public.journal_import_accounts in row exclusive mode;' `
  $activation '' -SecondOwnTransaction -SecondCompletesBeforeRelease
if($accountWriter.Second.ExitCode -ne 0 -or $accountWriter.ObservedWait -ne 'completed-before-release'){
  throw "Account writer lock unnecessarily blocked activation: $($accountWriter.Second.Output)"
}
Set-TradeImportActivationState -Enabled $false
$incomingAccountFk=@'
create table public.equora_account_fk_race_fixture(
  user_id uuid not null,
  preset_key text not null,
  normalized_label text not null,
  constraint equora_account_fk_race_fixture_fkey
    foreign key(user_id,preset_key,normalized_label)
    references public.journal_import_accounts(user_id,preset_key,normalized_label)
    on update cascade on delete restrict
);
'@
try {
  $incomingFirst=Invoke-TradeImportRace 'account_fk_ddl_first' `
    $incomingAccountFk $activation 'relation' -SecondOwnTransaction
  if($incomingFirst.Second.ExitCode -eq 0 -or `
      $incomingFirst.Second.Output -notmatch 'TRADE_IMPORT_VERIFY_ACCOUNT_RELATION_EFFECTS_INVALID'){
    throw "Incoming account FK before activation was not rejected: $($incomingFirst.Second.Output)"
  }
} finally {
  Invoke-TradeImportSqlText 'drop table if exists public.equora_account_fk_race_fixture;' 'Incoming account FK first cleanup' | Out-Null
}
Set-TradeImportActivationState -Enabled $false
Invoke-TradeImportSqlText @'
create table public.equora_account_fk_race_fixture(
  user_id uuid not null,
  preset_key text not null,
  normalized_label text not null
);
'@ 'Late incoming account FK table setup' | Out-Null
try {
  $lateIncomingAccountFk=@'
set lock_timeout='3s';
alter table public.equora_account_fk_race_fixture
add constraint equora_account_fk_race_fixture_fkey
foreign key(user_id,preset_key,normalized_label)
references public.journal_import_accounts(user_id,preset_key,normalized_label)
on update cascade on delete restrict;
'@
  $incomingAfter=Invoke-TradeImportRace 'activate_account_fk_ddl_late' `
    $activationBody $lateIncomingAccountFk 'relation' `
    -ExpectTimeout -SecondOwnTransaction
  if($incomingAfter.Second.ExitCode -eq 0 -or `
      $incomingAfter.Second.Output -notmatch 'lock timeout'){
    throw "Activation failed to block a late incoming account FK: $($incomingAfter.Second.Output)"
  }
  if((Get-TradeImportScalar "select count(*)::text from pg_constraint where conname='equora_account_fk_race_fixture_fkey';") -ne '0'){
    throw 'Timed-out incoming account FK left constraint metadata.'
  }
} finally {
  Invoke-TradeImportSqlText 'drop table if exists public.equora_account_fk_race_fixture;' 'Late incoming account FK cleanup' | Out-Null
}
Set-TradeImportActivationState -Enabled $false
Write-Output 'Incoming account FK concurrency PASS: prior cascade trigger inventory rejected; activation-first lock blocked late FK metadata.'
try {
  $publicationFirst=Invoke-TradeImportRace 'publication_ddl_first' `
    'create publication equora_trade_import_publication_fixture for table public.journal_import_accounts;' `
    $activation 'relation' -SecondOwnTransaction
  if($publicationFirst.Second.ExitCode -eq 0 -or `
      $publicationFirst.Second.Output -notmatch 'TRADE_IMPORT_VERIFY_PUBLICATION_EFFECTS_INVALID'){
    throw "Publication membership before activation was not rejected: $($publicationFirst.Second.Output)"
  }
} finally {
  Invoke-TradeImportSqlText 'drop publication if exists equora_trade_import_publication_fixture;' 'Publication-first cleanup' | Out-Null
}
Set-TradeImportActivationState -Enabled $false
Invoke-TradeImportSqlText 'create publication equora_trade_import_publication_fixture;' 'Late publication setup' | Out-Null
try {
  $publicationAfter=Invoke-TradeImportRace 'activate_publication_ddl_late' `
    $activationBody `
    "set lock_timeout='3s'; alter publication equora_trade_import_publication_fixture add table public.journal_import_accounts;" `
    'relation' -ExpectTimeout -SecondOwnTransaction
  if($publicationAfter.Second.ExitCode -eq 0 -or `
      $publicationAfter.Second.Output -notmatch 'lock timeout'){
    throw "Activation failed to block late publication membership: $($publicationAfter.Second.Output)"
  }
  if((Get-TradeImportScalar "select count(*)::text from pg_publication_tables where pubname='equora_trade_import_publication_fixture';") -ne '0'){
    throw 'Timed-out publication membership left catalog metadata.'
  }
} finally {
  Invoke-TradeImportSqlText 'drop publication if exists equora_trade_import_publication_fixture;' 'Late publication cleanup' | Out-Null
}
Set-TradeImportActivationState -Enabled $false
Write-Output 'Publication concurrency PASS: relation-bound membership was rejected before activation and serialized after activation.'
$actualActivationOff=Invoke-TradeImportRace 'actual_activate_then_off' $activationBody $deactivation 'relation' -SecondOwnTransaction
if($actualActivationOff.Second.ExitCode -ne 0){throw "Actual activation/off race failed: $($actualActivationOff.Second.Output)"}
$actualOffActivation=Invoke-TradeImportRace 'actual_off_then_activate' $offBody $activation 'relation' -SecondOwnTransaction
if($actualOffActivation.Second.ExitCode -ne 0){throw "Actual off/activation race failed: $($actualOffActivation.Second.Output)"}
Set-TradeImportActivationState -Enabled $false
Write-Output 'Activation concurrency PASS: actual activation/off scripts in both orders, DDL before activation rejected, DDL after activation timed out.'
# Source-key DDL must be checked after a bounded wait, or reject atomically
# on timeout. These are actual activation scripts, not reproduced lock SQL.
foreach($sourceTimeout in @($false,$true)){
  $beforeSourceDdl=Get-TradeImportPersistenceSnapshot
  $sourceScenario=if($sourceTimeout){'source_ddl_first_timeout'}else{'source_ddl_first_visible'}
  try {
    $sourceDdl=Invoke-TradeImportRace $sourceScenario `
      'create index equora_source_ddl_fixture on public.trade_import_source_keys(snapshot_digest);' `
      $activation 'relation' -SecondOwnTransaction -ExpectTimeout:$sourceTimeout
    $sourceError=if($sourceTimeout){'lock timeout'}else{'TRADE_IMPORT_VERIFY_SOURCE_KEY_INDEX_EFFECTS_INVALID'}
    if($sourceDdl.Second.ExitCode -eq 0 -or $sourceDdl.Second.Output -notmatch $sourceError){
      throw "Source-key DDL before activation was not rejected: $($sourceDdl.Second.Output)"
    }
    if((Get-TradeImportPersistenceSnapshot) -cne $beforeSourceDdl){throw 'Rejected source-key DDL/activation changed persistence.'}
  } finally {
    Invoke-TradeImportSqlText 'drop index if exists public.equora_source_ddl_fixture;' 'Source-key concurrent DDL cleanup' | Out-Null
  }
  Set-TradeImportActivationState -Enabled $true
  Set-TradeImportActivationState -Enabled $false
}
foreach($sourceConcurrent in @($false,$true)){
  $concurrentToken=if($sourceConcurrent){'concurrently '}else{''}
  $lateSourceScenario=if($sourceConcurrent){'activate_source_ddl_concurrent'}else{'activate_source_ddl_ordinary'}
  $lateSourceDdl="set lock_timeout='3s'; set statement_timeout='30s'; create index ${concurrentToken}equora_source_late_ddl_fixture on public.trade_import_source_keys(snapshot_digest);"
  try {
    $sourceAfter=Invoke-TradeImportRace $lateSourceScenario `
      $activationBody $lateSourceDdl 'relation' -ExpectTimeout -SecondOwnTransaction
    if($sourceAfter.Second.ExitCode -eq 0 -or $sourceAfter.Second.Output -notmatch 'lock timeout'){
      throw "Activation failed to hold source-key DDL lock until commit: $($sourceAfter.Second.Output)"
    }
    if((Get-TradeImportScalar "select to_regclass('public.equora_source_late_ddl_fixture') is null;") -ne 't'){
      throw 'Timed-out source-key DDL left an index.'
    }
  } finally {
    Invoke-TradeImportSqlText 'drop index if exists public.equora_source_late_ddl_fixture;' 'Source-key late DDL cleanup' | Out-Null
  }
  Set-TradeImportActivationState -Enabled $false
}
$sourceWriter=Invoke-TradeImportRace 'source_writer_compatible' `
  'lock table only public.trade_import_source_keys in row exclusive mode;' `
  $activation '' -SecondOwnTransaction -SecondCompletesBeforeRelease
if($sourceWriter.Second.ExitCode -ne 0 -or $sourceWriter.ObservedWait -ne 'completed-before-release'){
  throw "Source-key writer lock unnecessarily blocked activation: $($sourceWriter.Second.Output)"
}
Set-TradeImportActivationState -Enabled $false
Write-Output 'Source-key concurrency PASS: DDL before activation rejected; lock timeout rolled back and retry succeeded; ordinary/concurrent DDL after activation blocked until commit; ROW EXCLUSIVE remains compatible.'
# CREATE STATISTICS takes a relation DDL lock too. Use harmless column-only
# statistics here so full persistence observers cannot execute fixture code.
$statisticsRaces=@(
  @{Name='account_statistics';Relation='journal_import_accounts';Columns='user_id,preset_key';
    Enabled=$false;Probe=$activation;Body=$activationBody;ExpectedEnabled='true';
    Error='TRADE_IMPORT_VERIFY_ACCOUNT_STATISTICS_EFFECTS_INVALID'},
  @{Name='source_statistics';Relation='trade_import_source_keys';Columns='user_id,import_account_id';
    Enabled=$false;Probe=$activation;Body=$activationBody;ExpectedEnabled='true';
    Error='TRADE_IMPORT_VERIFY_SOURCE_KEY_STATISTICS_EFFECTS_INVALID'},
  @{Name='gate_on_statistics';Relation='equora_runtime_capability_gates';Columns='capability_key,contract_version';
    Enabled=$false;Probe=$activation;Body=$activationBody;ExpectedEnabled='true';
    Error='TRADE_IMPORT_VERIFY_GATE_STATISTICS_EFFECTS_INVALID'},
  @{Name='gate_off_statistics';Relation='equora_runtime_capability_gates';Columns='capability_key,contract_version';
    Enabled=$true;Probe=$deactivation;Body=$offBody;ExpectedEnabled='false';
    Error='TRADE_IMPORT_DEACTIVATION_STATISTICS_EFFECTS_INVALID'}
)
foreach($statisticsRace in $statisticsRaces){
  Set-TradeImportActivationState -Enabled $statisticsRace.Enabled
  $beforeStatisticsDdl=Get-TradeImportPersistenceSnapshot
  $statisticsDdl="create statistics public.equora_statistics_ddl_fixture on $($statisticsRace.Columns) from public.$($statisticsRace.Relation);"
  try {
    $statisticsFirst=Invoke-TradeImportRace ($statisticsRace.Name+'_first') $statisticsDdl $statisticsRace.Probe 'relation' -SecondOwnTransaction
    if($statisticsFirst.Second.ExitCode -eq 0 -or $statisticsFirst.Second.Output -notmatch $statisticsRace.Error){
      throw "Earlier statistics DDL escaped target guard: $($statisticsFirst.Second.Output)"
    }
    if((Get-TradeImportPersistenceSnapshot) -cne $beforeStatisticsDdl){
      throw 'Rejected earlier statistics DDL changed persistence.'
    }
  } finally {
    Invoke-TradeImportSqlText 'drop statistics if exists public.equora_statistics_ddl_fixture;' 'Earlier statistics DDL cleanup' | Out-Null
  }
  Invoke-TradeImportSqlText $statisticsRace.Probe 'Actual transition retry after statistics cleanup' | Out-Null
  Set-TradeImportActivationState -Enabled $statisticsRace.Enabled
  try {
    $statisticsLate=Invoke-TradeImportRace ($statisticsRace.Name+'_late') $statisticsRace.Body ("set local lock_timeout='3s'; "+$statisticsDdl) 'relation' -ExpectTimeout
    if($statisticsLate.Second.ExitCode -eq 0 -or $statisticsLate.Second.Output -notmatch 'lock timeout'){
      throw "Target failed to hold statistics DDL lock until commit: $($statisticsLate.Second.Output)"
    }
    if((Get-TradeImportScalar "select count(*) from pg_statistic_ext where stxname='equora_statistics_ddl_fixture';") -ne '0'){
      throw 'Timed-out statistics DDL left metadata.'
    }
    if((Get-TradeImportScalar "select enabled::text from public.equora_runtime_capability_gates where capability_key='journal_file_import_persistence_v2' and contract_version='equora-broker-file-import-capability-v1';") -cne $statisticsRace.ExpectedEnabled){
      throw 'Actual transition did not commit expected state after statistics DDL timeout.'
    }
  } finally {
    Invoke-TradeImportSqlText 'drop statistics if exists public.equora_statistics_ddl_fixture;' 'Late statistics DDL cleanup' | Out-Null
  }
  Set-TradeImportActivationState -Enabled $false
  Write-Output "Statistics concurrency PASS: $($statisticsRace.Name); prior DDL rejected without persistence change; actual retry; late DDL blocked until COMMIT and timed out without metadata."
}

# Build a real two-trade v2 batch. A writer takes the higher-ID row first and,
# only after the competing revert is observed, requests the lower-ID row. The
# revert must still be waiting on its table lock and must not hold either row.
Set-TradeImportActivationState -Enabled $true
$multiTradeBatchId='c1000000-0000-4000-8000-000000000080'
$multiTradeImport=@'
begin;
set local statement_timeout='30s';
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select public.equora_import_trades_v2(
 'c1000000-0000-4000-8000-000000000080',
 'c1000000-0000-4000-8000-000000000010',
 '{"file_name":"multi-lock.csv","preset_key":"generic","preset_label":"Generic CSV","account_label":"Concurrency Account","account_currency":"EUR"}'::jsonb,
 '[{"row_number":2,"preview_status":"importable","selected":true},{"row_number":3,"preview_status":"importable","selected":true}]'::jsonb,
 '[{"row_number":2,"trade":{"id":"c1000000-0000-4000-8000-000000000091","created_at":"2026-08-30T12:00:00.000Z","market":"LOCKLOW","setup":"Lock order low","bias":"long","net_pnl":"1.00","position_size":"1","account_currency":"EUR","broker_profile":"generic","account_template":"spot"},"tags":["CSV Import"],"source_keys":[]},{"row_number":3,"trade":{"id":"c1000000-0000-4000-8000-000000000092","created_at":"2026-08-30T12:01:00.000Z","market":"LOCKHIGH","setup":"Lock order high","bias":"long","net_pnl":"2.00","position_size":"1","account_currency":"EUR","broker_profile":"generic","account_template":"spot"},"tags":["CSV Import"],"source_keys":[]}]'::jsonb
);
commit;
'@
Invoke-TradeImportSqlText $multiTradeImport 'Two-trade lock-order fixture' | Out-Null
if((Get-TradeImportScalar "select count(*)::text from public.trades where import_batch_id='$multiTradeBatchId';") -ne '2'){
  throw 'Two-trade lock-order fixture did not create exactly two trades.'
}
$multiWriterHigh=@'
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
update public.trades set net_pnl=net_pnl
where id=(select id from public.trades
  where import_batch_id='c1000000-0000-4000-8000-000000000080'
  order by id desc limit 1);
'@
$multiWriterLow=@'
update public.trades set net_pnl=net_pnl
where id=(select id from public.trades
  where import_batch_id='c1000000-0000-4000-8000-000000000080'
  order by id asc limit 1);
'@
$multiTradeRevert=@'
begin;
set local statement_timeout='30s';
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.equora_revert_import_v1('c1000000-0000-4000-8000-000000000080');
rollback;
'@
$multiTradeRace=Invoke-TradeImportRace `
  'multi_trade_writer_then_revert' $multiWriterHigh $multiTradeRevert `
  'relation' -SecondOwnTransaction -FirstAfterBarrierSql $multiWriterLow
if($multiTradeRace.Second.ExitCode -ne 0 -or `
    $multiTradeRace.Second.Output -notmatch '"deletedCount"\s*:\s*2'){
  throw "Multi-trade writer/revert race failed: $($multiTradeRace.Second.Output)"
}
if((Get-TradeImportScalar "select count(*)::text from public.trades where import_batch_id='$multiTradeBatchId';") -ne '2'){
  throw 'Multi-trade writer/revert rollback probe changed the live fixture.'
}
Invoke-TradeImportSqlText @'
delete from public.trade_import_source_keys
where batch_id='c1000000-0000-4000-8000-000000000080';
delete from public.trades
where import_batch_id='c1000000-0000-4000-8000-000000000080';
delete from public.trade_import_batches
where id='c1000000-0000-4000-8000-000000000080';
'@ 'Two-trade lock-order fixture cleanup' | Out-Null
Set-TradeImportActivationState -Enabled $false
Write-Output 'Multi-trade binding/revert concurrency PASS: conflicting table lock precedes every revert row lock; inverse high/low writer order completed without deadlock; rollback state preserved.'

# Deterministically model legacy RPCs that take a trade row with FOR UPDATE
# before their later UPDATE/DELETE requests ROW EXCLUSIVE on the table. Revert
# must wait for its EXCLUSIVE table lock before it can hold any trade row, so
# the first worker's real write-lock upgrade completes without a deadlock.
$tradeRowBeforeBatchLock=@'
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select id from public.trades
where import_batch_id='c1000000-0000-4000-8000-000000000020'
for update;
'@
$tradeWriteAfterRowLock=@'
update public.trades set net_pnl=net_pnl
where import_batch_id='c1000000-0000-4000-8000-000000000020';
'@
$boundTradeRevert=@'
begin;
set local statement_timeout='30s';
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select public.equora_revert_import_v1('c1000000-0000-4000-8000-000000000020');
rollback;
'@
$lockOrderRace=Invoke-TradeImportRace `
  'rowlock_then_write_revert_order' $tradeRowBeforeBatchLock $boundTradeRevert `
  'relation' -SecondOwnTransaction `
  -FirstAfterBarrierSql $tradeWriteAfterRowLock
if($lockOrderRace.Second.ExitCode -ne 0 -or `
    $lockOrderRace.Second.Output -notmatch '"deletedCount"\s*:\s*1'){
  throw "Rowlock/write/revert order race failed: $($lockOrderRace.Second.Output)"
}

# A permitted journal-field update of a v2-bound trade takes its trade row and
# then KEY SHARE on the batch. The real revert must serialize at the table gate,
# then succeed inside a rolled-back probe; the live fixture remains unchanged.
$boundTradeUpdate=@'
select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
update public.trades set net_pnl=net_pnl
where import_batch_id='c1000000-0000-4000-8000-000000000020';
'@
$bindingRevertRace=Invoke-TradeImportRace `
  'binding_update_then_revert' $boundTradeUpdate $boundTradeRevert `
  'relation' -SecondOwnTransaction
if($bindingRevertRace.Second.ExitCode -ne 0 -or `
    $bindingRevertRace.Second.Output -notmatch '"deletedCount"\s*:\s*1'){
  throw "Bound-trade update/revert race failed: $($bindingRevertRace.Second.Output)"
}
if((Get-TradeImportScalar @'
select count(*)::text
from public.trades trade_row
join public.trade_import_source_keys source_key_row
  on source_key_row.user_id=trade_row.user_id
  and source_key_row.trade_id=trade_row.id
  and source_key_row.import_account_id=trade_row.import_account_id
  and source_key_row.batch_id=trade_row.import_batch_id
  and source_key_row.status='active'
where trade_row.import_batch_id='c1000000-0000-4000-8000-000000000020';
'@) -ne '1'){
  throw 'Bound-trade update/revert race changed the live binding.'
}
$revertTimeoutBlocker='lock table only public.trades in row exclusive mode;'
$revertTimeoutRace=Invoke-TradeImportRace `
  'revert_table_lock_timeout' $revertTimeoutBlocker $boundTradeRevert `
  'relation' -ExpectTimeout -SecondOwnTransaction
if($revertTimeoutRace.Second.ExitCode -eq 0 -or `
    $revertTimeoutRace.Second.Output -notmatch 'lock timeout'){
  throw "Revert table-lock timeout was not enforced: $($revertTimeoutRace.Second.Output)"
}
$revertRetry=Invoke-TradeImportSqlText $boundTradeRevert 'Revert retry after table-lock timeout'
if(($revertRetry -join [Environment]::NewLine) -notmatch '"deletedCount"\s*:\s*1'){
  throw 'Revert retry after table-lock timeout did not succeed.'
}
if((Get-TradeImportScalar "select count(*)::text from public.trades where import_batch_id='c1000000-0000-4000-8000-000000000020';") -ne '1'){
  throw 'Revert timeout/retry rollback probe changed the live fixture.'
}
Write-Output 'Binding/revert concurrency PASS: EXCLUSIVE revert gate precedes every row lock, rowlock-then-write RPC shape completes without deadlock, timeout is bounded and retryable, and live binding is unchanged.'

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
Write-Output 'Trade-import concurrency gate PASS: bounded barrier, account-serialized provider identity, exact replay, changed replay, lock timeout/rollback/retry, globally serialized one- and multi-trade binding/revert paths, gate/deactivation, activation lock order, DDL-before-off rejection and off-before-DDL timeout.'
