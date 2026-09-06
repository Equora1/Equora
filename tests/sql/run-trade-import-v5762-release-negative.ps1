param(
  [string]$ContainerName = 'equora-v5762-trade-import-pinned',
  [string]$TestDatabase = 'equora_full_deployment_trade_import_v5762',
  [ValidateSet('PreInstall','PostInstall')][string]$Mode = 'PostInstall'
)

. (Join-Path $PSScriptRoot 'trade-import-hardening-test-lib.ps1')
Initialize-TradeImportTestContext $ContainerName $TestDatabase

function Invoke-TradeImportDriftCase {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$ApplySql,
    [Parameter(Mandatory = $true)][string]$ProbeSql,
    [Parameter(Mandatory = $true)][string]$ExpectedCode,
    [Parameter(Mandatory = $true)][string]$RestoreSql
  )

  $applied = $false
  try {
    # A multi-statement failed setup must roll back as a unit, even before
    # the restoration flag can be set.
    $atomicSetup = 'begin;' + [Environment]::NewLine + $ApplySql + [Environment]::NewLine + 'commit;'
    Invoke-TradeImportSqlText $atomicSetup "$Name drift setup" | Out-Null
    $applied = $true
    Invoke-TradeImportSqlExpectFailure `
      $ProbeSql $ExpectedCode "$Name negative probe" | Out-Null
  }
  finally {
    if ($applied) {
      $atomicRestore = 'begin;' + [Environment]::NewLine + $RestoreSql + [Environment]::NewLine + 'commit;'
      Invoke-TradeImportSqlText $atomicRestore "$Name drift restore" | Out-Null
    }
  }
}

$preflight = Expand-TradeImportV5762File `
  -Name 'preflight-v57.62.0-trade-import.sql'

if ($Mode -eq 'PreInstall') {
  Invoke-TradeImportDriftCase `
    -Name 'Partial markerless state' `
    -ApplySql 'create table public.journal_import_accounts(id integer);' `
    -ProbeSql $preflight `
    -ExpectedCode 'TRADE_IMPORT_PREFLIGHT_PARTIAL_STATE' `
    -RestoreSql 'drop table public.journal_import_accounts;'
  Write-Output 'Trade-import pre-install negative gate PASS: partial markerless state rejected and restored.'
  exit 0
}

$verifier = Expand-TradeImportV5762File `
  -Name 'verify-v57.62.0-trade-import.sql'
$expectedFingerprint =
  '014731e263ec2f0ffc9b0e16962b5d5574516a0c975a1713580740fa3bc6413d'

# Reject weakened conditions independently, restoring after every probe.
$searchPathProbe="begin read only; set local search_path = public, pg_catalog;" + [Environment]::NewLine + $verifier + [Environment]::NewLine + @'
do $search_path_probe$
begin
  if current_setting('search_path') is distinct from 'public, pg_catalog' then
    raise exception 'TEST_VERIFIER_SEARCH_PATH_LEAK';
  end if;
end;
$search_path_probe$;
rollback;
'@
Invoke-TradeImportSqlText $searchPathProbe 'Verifier preserves caller search_path' | Out-Null
Invoke-TradeImportSqlText $verifier 'Before CHECK drift cases' | Out-Null
$checkCases=@(
  @{Table='equora_runtime_capability_gates';Name='equora_runtime_capability_gates_activation_check'},
  @{Table='equora_runtime_capability_gates';Name='equora_runtime_capability_gates_contract_check'},
  @{Table='equora_runtime_capability_gates';Name='equora_runtime_capability_gates_key_check'},
  @{Table='journal_import_accounts';Name='journal_import_accounts_currency_check'},
  @{Table='journal_import_accounts';Name='journal_import_accounts_display_label_check'},
  @{Table='journal_import_accounts';Name='journal_import_accounts_normalized_label_check'},
  @{Table='journal_import_accounts';Name='journal_import_accounts_preset_key_check'},
  @{Table='trade_import_batches';Name='trade_import_batches_v2_state_check'},
  @{Table='trade_import_source_keys';Name='trade_import_source_keys_digest_check'},
  @{Table='trade_import_source_keys';Name='trade_import_source_keys_kind_check'},
  @{Table='trade_import_source_keys';Name='trade_import_source_keys_lifecycle_check'},
  @{Table='trade_import_source_keys';Name='trade_import_source_keys_snapshot_check'},
  @{Table='trade_import_source_keys';Name='trade_import_source_keys_status_check'}
)
if($checkCases.Count -ne 13){throw 'Expected exactly 13 CHECK drift cases.'}
foreach($checkCase in $checkCases) {
  $table=$checkCase.Table
  $name=$checkCase.Name
  $definition=Get-TradeImportScalar "select pg_get_constraintdef(oid,false) from pg_constraint where conrelid='public.$table'::regclass and conname='$name' and contype='c';"
  if(-not $definition.StartsWith('CHECK (')){throw "Missing original CHECK: $name"}
  $drop="alter table public.$table drop constraint $name;"
  $restore="$drop alter table public.$table add constraint $name $definition;"
  $caseArgs=@{
    Name="CHECK true: $name"
    ApplySql="$drop alter table public.$table add constraint $name check(true);"
    ProbeSql=$verifier
    ExpectedCode='TRADE_IMPORT_VERIFY_CHECK_CONSTRAINT_SHAPE_INVALID'
    RestoreSql=$restore
  }
  Invoke-TradeImportDriftCase @caseArgs
  Invoke-TradeImportSqlText $verifier "Restored CHECK: $name" | Out-Null
  if($name -in @('trade_import_batches_v2_state_check','trade_import_source_keys_snapshot_check')) {
    $weakened=$definition.Replace(' IS TRUE','')
    if($weakened -eq $definition){throw "IS TRUE weakening did not change $name"}
    $caseArgs.Name="CHECK NULL weakening: $name"
    $caseArgs.ApplySql="$drop alter table public.$table add constraint $name $weakened;"
    Invoke-TradeImportDriftCase @caseArgs
    Invoke-TradeImportSqlText $verifier "Restored NULL CHECK: $name" | Out-Null
  }
  if($name -eq 'journal_import_accounts_currency_check') {
    foreach($suffix in @('NOT VALID','NO INHERIT')) {
      $caseArgs.Name="CHECK metadata $suffix"
      $caseArgs.ApplySql="$drop alter table public.$table add constraint $name $definition $suffix;"
      Invoke-TradeImportDriftCase @caseArgs
      Invoke-TradeImportSqlText $verifier "Restored CHECK metadata $suffix" | Out-Null
    }
    $caseArgs.Name='CHECK case-sensitive currency literal'
    if((Get-TradeImportScalar "select count(*) from public.journal_import_accounts where account_currency='GBP';") -ne '0'){
      throw 'Currency case fixture requires no GBP accounts.'
    }
    $weakened=$definition.Replace("'GBP'","'gbp'")
    $caseArgs.ApplySql="$drop alter table public.$table add constraint $name $weakened;"
    Invoke-TradeImportDriftCase @caseArgs
    Invoke-TradeImportSqlText $verifier 'Restored CHECK currency literal' | Out-Null
    $caseArgs.Name='CHECK actual inheritance'
    $caseArgs.ApplySql="create table public.equora_check_parent_fixture(account_currency text constraint $name $definition); alter table public.$table inherit public.equora_check_parent_fixture;"
    $caseArgs.RestoreSql="alter table public.$table no inherit public.equora_check_parent_fixture; drop table public.equora_check_parent_fixture;"
    Invoke-TradeImportDriftCase @caseArgs
    Invoke-TradeImportSqlText $verifier 'Restored inherited CHECK' | Out-Null
  }
}
$extraCheck=@{
  Name='Unexpected additional CHECK'
  ApplySql='alter table public.journal_import_accounts add constraint equora_extra_check_fixture check(true);'
  ProbeSql=$verifier
  ExpectedCode='TRADE_IMPORT_VERIFY_CHECK_CONSTRAINT_SET_INVALID'
  RestoreSql='alter table public.journal_import_accounts drop constraint equora_extra_check_fixture;'
}
Invoke-TradeImportDriftCase @extraCheck
Invoke-TradeImportSqlText $verifier 'Restored exact CHECK inventory' | Out-Null
$sortDrift=@{
  Name='Index DESC ordering'
  ApplySql='drop index public.journal_import_accounts_user_created_idx; create index journal_import_accounts_user_created_idx on public.journal_import_accounts(user_id,created_at asc);'
  ProbeSql=$verifier
  ExpectedCode='TRADE_IMPORT_VERIFY_INDEX_SHAPE_INVALID'
  RestoreSql='drop index public.journal_import_accounts_user_created_idx; create index journal_import_accounts_user_created_idx on public.journal_import_accounts(user_id,created_at desc);'
}
Invoke-TradeImportDriftCase @sortDrift
Invoke-TradeImportSqlText $verifier 'Restored index ordering' | Out-Null
Write-Output 'CHECK drift PASS: 13 true replacements, two NULL weakenings, validity, no-inherit, actual inheritance, case-sensitive literal, extra CHECK; index DESC drift rejected.'

Invoke-TradeImportDriftCase `
  -Name 'Migration fingerprint' `
  -ApplySql @"
update equora_private.schema_migrations
set contract_fingerprint=repeat('0',64)
where migration_id='equora_v57.62.0_trade_import_persistence_v1';
"@ `
  -ProbeSql $preflight `
  -ExpectedCode 'TRADE_IMPORT_PREFLIGHT_MARKER_DRIFT' `
  -RestoreSql @"
update equora_private.schema_migrations
set contract_fingerprint='$expectedFingerprint'
where migration_id='equora_v57.62.0_trade_import_persistence_v1';
"@

Invoke-TradeImportDriftCase `
  -Name 'Unknown same-version marker' `
  -ApplySql @'
insert into equora_private.schema_migrations(migration_id,contract_fingerprint)
values ('equora_v57.62.0_unknown_test_v1',repeat('1',64));
'@ `
  -ProbeSql $preflight `
  -ExpectedCode 'TRADE_IMPORT_PREFLIGHT_UNKNOWN_MARKER' `
  -RestoreSql @'
delete from equora_private.schema_migrations
where migration_id='equora_v57.62.0_unknown_test_v1';
'@

Invoke-TradeImportDriftCase `
  -Name 'RLS policy' `
  -ApplySql @'
alter policy "users can read own journal import accounts"
on public.journal_import_accounts using (true);
'@ `
  -ProbeSql $verifier `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_RLS_POLICIES_INVALID' `
  -RestoreSql @'
alter policy "users can read own journal import accounts"
on public.journal_import_accounts using ((select auth.uid()) = user_id);
'@

Invoke-TradeImportDriftCase `
  -Name 'Active identity index' `
  -ApplySql @'
drop index public.trade_import_source_keys_active_identity_key;
create index trade_import_source_keys_active_identity_key
on public.trade_import_source_keys(
  user_id,import_account_id,preset_key,source_kind,source_digest
) where status='active';
'@ `
  -ProbeSql $verifier `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_INDEX_SHAPE_INVALID' `
  -RestoreSql @'
drop index public.trade_import_source_keys_active_identity_key;
create unique index trade_import_source_keys_active_identity_key
on public.trade_import_source_keys(
  user_id,import_account_id,preset_key,source_kind,source_digest
) where status='active';
'@

Invoke-TradeImportDriftCase `
  -Name 'Batch ownership foreign key' `
  -ApplySql @'
alter table public.trade_import_source_keys
drop constraint trade_import_source_keys_batch_owner_fkey;
alter table public.trade_import_source_keys
add constraint trade_import_source_keys_batch_owner_fkey
foreign key (batch_id) references public.trade_import_batches(id)
on delete cascade;
'@ `
  -ProbeSql $verifier `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_KEY_CONSTRAINT_SHAPE_INVALID' `
  -RestoreSql @'
alter table public.trade_import_source_keys
drop constraint trade_import_source_keys_batch_owner_fkey;
alter table public.trade_import_source_keys
add constraint trade_import_source_keys_batch_owner_fkey
foreign key (user_id,batch_id)
references public.trade_import_batches(user_id,id)
on delete cascade;
'@

Invoke-TradeImportSqlText $verifier 'Post-negative verifier restoration' | Out-Null
Invoke-TradeImportDriftCase -Name 'Financial snapshot column ACL' -ApplySql @'
grant select(trade_snapshot) on public.trade_import_source_keys to service_role;
'@ -ProbeSql $verifier -ExpectedCode 'TRADE_IMPORT_VERIFY_COLUMN_ACL_INVALID' -RestoreSql @'
revoke select(trade_snapshot) on public.trade_import_source_keys from service_role;
'@
Invoke-TradeImportDriftCase -Name 'PUBLIC revert execute' -ApplySql @'
grant execute on function public.equora_revert_import_v1(uuid) to public;
'@ -ProbeSql $verifier -ExpectedCode 'TRADE_IMPORT_VERIFY_FUNCTION_ACL_SHAPE_INVALID' -RestoreSql @'
revoke execute on function public.equora_revert_import_v1(uuid) from public;
'@

# Target-local effects must be rejected before any update.
$deactivationProbe=Expand-TradeImportV5762File -Name 'deactivate-v57.62.0-trade-import.sql'
Invoke-TradeImportDriftCase -Name 'Internal gate cascade trigger' -ApplySql @'
alter table public.equora_runtime_capability_gates
add constraint equora_gate_effect_fixture_unique unique(capability_key,contract_version,enabled);
create table public.equora_gate_effect_fixture(
 capability_key text, contract_version text, enabled boolean,
 foreign key(capability_key,contract_version,enabled)
 references public.equora_runtime_capability_gates(capability_key,contract_version,enabled)
 on update cascade
);
'@ -ProbeSql $deactivationProbe -ExpectedCode 'TRADE_IMPORT_DEACTIVATION_TARGET_EFFECTS_INVALID' -RestoreSql @'
drop table public.equora_gate_effect_fixture;
alter table public.equora_runtime_capability_gates drop constraint equora_gate_effect_fixture_unique;
'@
Invoke-TradeImportDriftCase -Name 'Inherited gate child' -ApplySql @'
create table public.equora_gate_inheritance_fixture()
inherits(public.equora_runtime_capability_gates);
'@ -ProbeSql $deactivationProbe -ExpectedCode 'TRADE_IMPORT_DEACTIVATION_TARGET_EFFECTS_INVALID' -RestoreSql @'
drop table public.equora_gate_inheritance_fixture;
'@
# Unrelated ACL drift must not prevent closing; restore its test grant afterward.
Set-TradeImportActivationState -Enabled $true
try {
  Invoke-TradeImportSqlText 'grant select on public.equora_runtime_capability_gates to service_role;' 'Kill-switch drift setup' | Out-Null
  Invoke-TradeImportSqlExpectFailure $verifier 'TRADE_IMPORT_VERIFY_TABLE_PRIVILEGES_INVALID' 'Confirm preexisting drift' | Out-Null
  Set-TradeImportActivationState -Enabled $false
  $closed=Get-TradeImportScalar "select (not enabled and activated_at is null)::text from public.equora_runtime_capability_gates where capability_key='journal_file_import_persistence_v2' and contract_version='equora-broker-file-import-capability-v1';"
  if($closed -ne 'true'){throw 'Drift prevented the kill switch from closing.'}
} finally {
  Invoke-TradeImportSqlText 'revoke select on public.equora_runtime_capability_gates from service_role;' 'Kill-switch drift restoration' | Out-Null
  Set-TradeImportActivationState -Enabled $false
}
Invoke-TradeImportSqlText $verifier 'Final negative-case restoration' | Out-Null
Write-Output 'Trade-import post-install negative gate PASS: receipt, RLS, index, FK, column ACL and PUBLIC execute drift; kill switch closes despite unrelated drift.'
