param(
  [string]$ContainerName = 'equora-v5762-trade-import-pinned',
  [string]$TestDatabase = 'equora_full_deployment_trade_import_v5762',
  [ValidateSet('PreInstall','PostInstall')][string]$Mode = 'PostInstall'
)

. (Join-Path $PSScriptRoot 'trade-import-hardening-test-lib.ps1')
Initialize-TradeImportTestContext $ContainerName $TestDatabase

function Invoke-TradeImportSupabaseAdminSqlText {
  param(
    [Parameter(Mandatory = $true)][string]$Sql,
    [Parameter(Mandatory = $true)][string]$Phase
  )

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $output = $Sql | & docker exec -i $ContainerName psql `
    -U supabase_admin -d $TestDatabase -v ON_ERROR_STOP=1 2>&1
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($exitCode -ne 0) {
    throw "$Phase failed: $($output -join [Environment]::NewLine)"
  }
  return $output
}

function Invoke-TradeImportDriftCase {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$ApplySql,
    [Parameter(Mandatory = $true)][string]$ProbeSql,
    [Parameter(Mandatory = $true)][string]$ExpectedCode,
    [Parameter(Mandatory = $true)][string]$RestoreSql,
    [switch]$PreservePersistence,
    [switch]$SuperuserMutation,
    [string]$InvariantSql
  )

  $applied = $false
  try {
    # A multi-statement failed setup must roll back as a unit, even before
    # the restoration flag can be set.
    $atomicSetup = 'begin;' + [Environment]::NewLine + $ApplySql + [Environment]::NewLine + 'commit;'
    if($SuperuserMutation){
      Invoke-TradeImportSupabaseAdminSqlText $atomicSetup "$Name drift setup" | Out-Null
    } else {
      Invoke-TradeImportSqlText $atomicSetup "$Name drift setup" | Out-Null
    }
    $applied = $true
    if($PreservePersistence){$beforeProbe=Get-TradeImportPersistenceSnapshot}
    Invoke-TradeImportSqlExpectFailure `
      $ProbeSql $ExpectedCode "$Name negative probe" | Out-Null
    if($PreservePersistence -and (Get-TradeImportPersistenceSnapshot) -ne $beforeProbe){
      throw "$Name changed persistence despite rejection."
    }
    if($InvariantSql -and (Get-TradeImportScalar $InvariantSql) -ne 'true'){
      throw "$Name invariant failed before fixture restoration."
    }
  }
  finally {
    if ($applied) {
      $atomicRestore = 'begin;' + [Environment]::NewLine + $RestoreSql + [Environment]::NewLine + 'commit;'
      if($SuperuserMutation){
        Invoke-TradeImportSupabaseAdminSqlText $atomicRestore "$Name drift restore" | Out-Null
      } else {
        Invoke-TradeImportSqlText $atomicRestore "$Name drift restore" | Out-Null
      }
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
$deployProbe = Expand-TradeImportV5762File `
  -Name 'deploy-v57.62.0-trade-import.sql'
$activationProbe = Expand-TradeImportV5762File `
  -Name 'activate-v57.62.0-trade-import.sql'
$expectedFingerprint =
  '460e008096b8f217e68d27f04c72b95b676d2b149daf49d5913d5a822cac628b'

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
  -Name 'Unknown same-version marker blocks activation' `
  -ApplySql @'
insert into equora_private.schema_migrations(migration_id,contract_fingerprint)
values ('equora_v57.62.0_unknown_activation_test_v1',repeat('2',64));
'@ `
  -ProbeSql $activationProbe `
  -ExpectedCode 'TRADE_IMPORT_ACTIVATION_UNKNOWN_MARKER' `
  -RestoreSql @'
delete from equora_private.schema_migrations
where migration_id='equora_v57.62.0_unknown_activation_test_v1';
'@ `
  -PreservePersistence

Invoke-TradeImportDriftCase `
  -Name 'Active gate blocks default-off redeploy' `
  -ApplySql @'
update public.equora_runtime_capability_gates
set enabled=true,activated_at=transaction_timestamp()
where capability_key='journal_file_import_persistence_v2'
  and contract_version='equora-broker-file-import-capability-v1';
'@ `
  -ProbeSql $deployProbe `
  -ExpectedCode 'TRADE_IMPORT_PREFLIGHT_GATE_ACTIVE' `
  -RestoreSql @'
update public.equora_runtime_capability_gates
set enabled=false,activated_at=null
where capability_key='journal_file_import_persistence_v2'
  and contract_version='equora-broker-file-import-capability-v1';
'@ `
  -PreservePersistence

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
  -Name 'Gate relation persistence' `
  -ApplySql 'alter table public.equora_runtime_capability_gates set unlogged;' `
  -ProbeSql $verifier `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_RELATION_SECURITY_INVALID' `
  -RestoreSql 'alter table public.equora_runtime_capability_gates set logged;' `
  -PreservePersistence

Invoke-TradeImportDriftCase `
  -Name 'Explicit text collation' `
  -ApplySql 'alter table public.journal_import_accounts alter column display_label type text collate "C" using display_label::text;' `
  -ProbeSql $verifier `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_COLUMN_SHAPE_INVALID' `
  -RestoreSql 'alter table public.journal_import_accounts alter column display_label type text collate "default" using display_label::text;' `
  -PreservePersistence

$functionBehaviorCases=@(
  @{Name='volatility';Apply='stable';Restore='volatile'},
  @{Name='parallel';Apply='parallel safe';Restore='parallel unsafe'},
  @{Name='strict';Apply='strict';Restore='called on null input'}
)
foreach($functionBehaviorCase in $functionBehaviorCases){
  Invoke-TradeImportDriftCase `
    -Name "Function behavior attribute: $($functionBehaviorCase.Name)" `
    -ApplySql "alter function public.equora_revert_import_v1(uuid) $($functionBehaviorCase.Apply);" `
    -ProbeSql $verifier `
    -ExpectedCode 'TRADE_IMPORT_VERIFY_FUNCTION_SECURITY_INVALID' `
    -RestoreSql "alter function public.equora_revert_import_v1(uuid) $($functionBehaviorCase.Restore);" `
    -PreservePersistence
}

# PostgreSQL permits LEAKPROOF mutation only to a superuser. The disposable
# Supabase image deliberately keeps the postgres login non-superuser, so this
# single catalog-drift setup and restoration use its local supabase_admin role.
Invoke-TradeImportDriftCase `
  -Name 'Function behavior attribute: leakproof' `
  -ApplySql 'alter function public.equora_revert_import_v1(uuid) leakproof;' `
  -ProbeSql $verifier `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_FUNCTION_SECURITY_INVALID' `
  -RestoreSql 'alter function public.equora_revert_import_v1(uuid) not leakproof;' `
  -PreservePersistence `
  -SuperuserMutation

Invoke-TradeImportDriftCase `
  -Name 'Revert bounded lock timeout configuration' `
  -ApplySql 'alter function public.equora_revert_import_v1(uuid) reset lock_timeout;' `
  -ProbeSql $verifier `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_FUNCTION_SECURITY_INVALID' `
  -RestoreSql "alter function public.equora_revert_import_v1(uuid) set lock_timeout to '3s';" `
  -PreservePersistence

Invoke-TradeImportDriftCase `
  -Name 'Account unexpected key constraint' `
  -ApplySql 'alter table public.journal_import_accounts add constraint equora_account_extra_unique unique(id);' `
  -ProbeSql $activationProbe `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_KEY_CONSTRAINT_SET_INVALID' `
  -RestoreSql 'alter table public.journal_import_accounts drop constraint equora_account_extra_unique;' `
  -PreservePersistence
Invoke-TradeImportDriftCase `
  -Name 'Account unexpected expression index' `
  -ApplySql 'create index equora_account_extra_index on public.journal_import_accounts((length(display_label)));' `
  -ProbeSql $activationProbe `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_ACCOUNT_INDEX_EFFECTS_INVALID' `
  -RestoreSql 'drop index public.equora_account_extra_index;' `
  -PreservePersistence
Invoke-TradeImportDriftCase `
  -Name 'Account unexpected trigger' `
  -ApplySql @'
create function public.equora_account_trigger_fixture() returns trigger
language plpgsql as $fixture$ begin return new; end; $fixture$;
create trigger equora_account_trigger_fixture before insert
on public.journal_import_accounts for each row
execute function public.equora_account_trigger_fixture();
'@ `
  -ProbeSql $activationProbe `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_ACCOUNT_RELATION_EFFECTS_INVALID' `
  -RestoreSql @'
drop trigger equora_account_trigger_fixture on public.journal_import_accounts;
drop function public.equora_account_trigger_fixture();
'@ `
  -PreservePersistence
Invoke-TradeImportDriftCase `
  -Name 'Account unexpected incoming cascade foreign key' `
  -ApplySql @'
create table public.equora_account_incoming_fk_fixture(
  user_id uuid not null,
  preset_key text not null,
  normalized_label text not null,
  constraint equora_account_incoming_fk_fixture_fkey
    foreign key(user_id,preset_key,normalized_label)
    references public.journal_import_accounts(user_id,preset_key,normalized_label)
    on update cascade on delete restrict
);
insert into public.equora_account_incoming_fk_fixture
select user_id,preset_key,normalized_label
from public.journal_import_accounts order by id limit 1;
do $fixture$
declare
  v_user_id uuid;
  v_preset_key text;
  v_old_label text;
  v_new_label text;
begin
  select user_id,preset_key,normalized_label
  into strict v_user_id,v_preset_key,v_old_label
  from public.equora_account_incoming_fk_fixture;
  v_new_label := v_old_label || '-cascade-control';
  update public.journal_import_accounts
  set normalized_label=v_new_label
  where user_id=v_user_id and preset_key=v_preset_key
    and normalized_label=v_old_label;
  if not exists (
    select 1 from public.equora_account_incoming_fk_fixture
    where user_id=v_user_id and preset_key=v_preset_key
      and normalized_label=v_new_label
  ) then raise exception 'TEST_ACCOUNT_INCOMING_FK_CASCADE_CONTROL_FAILED'; end if;
  update public.journal_import_accounts
  set normalized_label=v_old_label
  where user_id=v_user_id and preset_key=v_preset_key
    and normalized_label=v_new_label;
end;
$fixture$;
'@ `
  -ProbeSql $activationProbe `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_ACCOUNT_RELATION_EFFECTS_INVALID' `
  -RestoreSql 'drop table public.equora_account_incoming_fk_fixture;' `
  -PreservePersistence
Invoke-TradeImportDriftCase `
  -Name 'Account unexpected rule' `
  -ApplySql 'create rule equora_account_rule_fixture as on update to public.journal_import_accounts do also nothing;' `
  -ProbeSql $activationProbe `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_ACCOUNT_RELATION_EFFECTS_INVALID' `
  -RestoreSql 'drop rule equora_account_rule_fixture on public.journal_import_accounts;' `
  -PreservePersistence
Invoke-TradeImportDriftCase `
  -Name 'Account inherited child' `
  -ApplySql 'create table public.equora_account_inheritance_fixture() inherits(public.journal_import_accounts);' `
  -ProbeSql $activationProbe `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_ACCOUNT_RELATION_EFFECTS_INVALID' `
  -RestoreSql 'drop table public.equora_account_inheritance_fixture;' `
  -PreservePersistence
Invoke-TradeImportDriftCase `
  -Name 'Account unexpected statistics' `
  -ApplySql 'create statistics public.equora_account_statistics_fixture on user_id,preset_key from public.journal_import_accounts;' `
  -ProbeSql $activationProbe `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_ACCOUNT_STATISTICS_EFFECTS_INVALID' `
  -RestoreSql 'drop statistics public.equora_account_statistics_fixture;' `
  -PreservePersistence
Invoke-TradeImportDriftCase `
  -Name 'Unexpected logical publication membership' `
  -ApplySql 'create publication equora_trade_import_publication_fixture for table public.journal_import_accounts;' `
  -ProbeSql $activationProbe `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_PUBLICATION_EFFECTS_INVALID' `
  -RestoreSql 'drop publication equora_trade_import_publication_fixture;' `
  -PreservePersistence
Invoke-TradeImportDriftCase `
  -Name 'Unexpected FOR ALL TABLES publication membership' `
  -ApplySql 'create publication equora_trade_import_publication_all_fixture for all tables;' `
  -ProbeSql $activationProbe `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_PUBLICATION_EFFECTS_INVALID' `
  -RestoreSql 'drop publication equora_trade_import_publication_all_fixture;' `
  -SuperuserMutation `
  -PreservePersistence
Invoke-TradeImportDriftCase `
  -Name 'Unexpected FOR TABLES IN SCHEMA publication membership' `
  -ApplySql 'create publication equora_trade_import_publication_schema_fixture for tables in schema public;' `
  -ProbeSql $activationProbe `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_PUBLICATION_EFFECTS_INVALID' `
  -RestoreSql 'drop publication equora_trade_import_publication_schema_fixture;' `
  -SuperuserMutation `
  -PreservePersistence
Invoke-TradeImportDriftCase `
  -Name 'Authenticated role bypasses row security' `
  -ApplySql 'alter role authenticated bypassrls;' `
  -ProbeSql $activationProbe `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_AUTHENTICATED_ROLE_ATTRIBUTES_INVALID' `
  -RestoreSql 'alter role authenticated nobypassrls;' `
  -SuperuserMutation `
  -PreservePersistence
Invoke-TradeImportDriftCase `
  -Name 'Source-key unexpected trigger' `
  -ApplySql @'
create function public.equora_source_trigger_fixture() returns trigger
language plpgsql as $fixture$ begin return new; end; $fixture$;
create trigger equora_source_trigger_fixture before insert
on public.trade_import_source_keys for each row
execute function public.equora_source_trigger_fixture();
'@ `
  -ProbeSql $activationProbe `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_SOURCE_KEY_RELATION_EFFECTS_INVALID' `
  -RestoreSql @'
drop trigger equora_source_trigger_fixture on public.trade_import_source_keys;
drop function public.equora_source_trigger_fixture();
'@ `
  -PreservePersistence
Invoke-TradeImportDriftCase `
  -Name 'Source-key unexpected rule' `
  -ApplySql 'create rule equora_source_rule_fixture as on update to public.trade_import_source_keys do also nothing;' `
  -ProbeSql $activationProbe `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_SOURCE_KEY_RELATION_EFFECTS_INVALID' `
  -RestoreSql 'drop rule equora_source_rule_fixture on public.trade_import_source_keys;' `
  -PreservePersistence

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

Invoke-TradeImportDriftCase `
  -Name 'Trade ownership foreign key delete action' `
  -ApplySql @'
alter table public.trade_import_source_keys
drop constraint trade_import_source_keys_trade_owner_fkey;
alter table public.trade_import_source_keys
add constraint trade_import_source_keys_trade_owner_fkey
foreign key (user_id,trade_id)
references public.trades(user_id,id)
on delete set null (trade_id);
'@ `
  -ProbeSql $verifier `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_KEY_CONSTRAINT_SHAPE_INVALID' `
  -RestoreSql @'
alter table public.trade_import_source_keys
drop constraint trade_import_source_keys_trade_owner_fkey;
alter table public.trade_import_source_keys
add constraint trade_import_source_keys_trade_owner_fkey
foreign key (user_id,trade_id)
references public.trades(user_id,id)
on delete restrict;
'@

Invoke-TradeImportDriftCase `
  -Name 'Trade binding index uniqueness' `
  -ApplySql @'
drop index public.trade_import_source_keys_trade_idx;
create index trade_import_source_keys_trade_idx
on public.trade_import_source_keys(user_id,trade_id)
where trade_id is not null;
'@ `
  -ProbeSql $verifier `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_INDEX_SHAPE_INVALID' `
  -RestoreSql @'
drop index public.trade_import_source_keys_trade_idx;
create unique index trade_import_source_keys_trade_idx
on public.trade_import_source_keys(user_id,trade_id)
where trade_id is not null;
'@

Invoke-TradeImportDriftCase `
  -Name 'Disabled v2 trade binding trigger' `
  -ApplySql 'alter table public.trades disable trigger equora_enforce_v2_trade_batch_binding_v1;' `
  -ProbeSql $verifier `
  -ExpectedCode 'TRADE_IMPORT_VERIFY_BINDING_TRIGGER_INVALID' `
  -RestoreSql 'alter table public.trades enable trigger equora_enforce_v2_trade_batch_binding_v1;'

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
Invoke-TradeImportDriftCase -Name 'Authenticated binding trigger execute' -ApplySql @'
grant execute on function public.equora_enforce_v2_trade_batch_binding_v1() to authenticated;
'@ -ProbeSql $verifier -ExpectedCode 'TRADE_IMPORT_VERIFY_FUNCTION_PRIVILEGES_INVALID' -RestoreSql @'
revoke execute on function public.equora_enforce_v2_trade_batch_binding_v1() from authenticated;
'@

# Target-local effects must be rejected before any update.
$deactivationProbe=Expand-TradeImportV5762File -Name 'deactivate-v57.62.0-trade-import.sql'
# Prove the privileged UPDATE counterexample with a positive control, then
# prove the guarded script never invokes the function (sequence is nontransactional).
Set-TradeImportActivationState -Enabled $true
$activationCheck='equora_runtime_capability_gates_activation_check'
$activationDefinition=Get-TradeImportScalar "select pg_get_constraintdef(oid,false) from pg_constraint where conrelid='public.equora_runtime_capability_gates'::regclass and conname='$activationCheck';"
foreach($replaceKnown in @($false,$true)) {
  $constraintName='equora_gate_check_effect_fixture'
  $prepare=''
  $restoreKnown=''
  if($replaceKnown){
    $constraintName=$activationCheck
    $prepare="alter table public.equora_runtime_capability_gates drop constraint $activationCheck;"
    $restoreKnown="alter table public.equora_runtime_capability_gates add constraint $activationCheck $activationDefinition;"
  }
  $effectSetup=@'
create table public.equora_gate_check_effect_log(executor text);
create sequence public.equora_gate_check_calls;
create function public.equora_gate_check_effect_fixture(boolean) returns boolean
language plpgsql volatile as $fixture$
begin
  perform nextval('public.equora_gate_check_calls'::regclass);
  insert into public.equora_gate_check_effect_log(executor) values(current_user);
  return true;
end;
$fixture$;
'@ + [Environment]::NewLine + $prepare + [Environment]::NewLine + @"
alter table public.equora_runtime_capability_gates add constraint $constraintName
check(public.equora_gate_check_effect_fixture(enabled)) not valid;
savepoint gate_check_control;
update public.equora_runtime_capability_gates set enabled=false,activated_at=null
where capability_key='journal_file_import_persistence_v2'
and contract_version='equora-broker-file-import-capability-v1';
"@ + [Environment]::NewLine + @'
do $control$
begin
  if (select count(*) from public.equora_gate_check_effect_log where executor='postgres') <> 1
    or not (select is_called from public.equora_gate_check_calls) then
    raise exception 'TEST_GATE_CHECK_POSITIVE_CONTROL_FAILED';
  end if;
end;
$control$;
rollback to savepoint gate_check_control;
alter sequence public.equora_gate_check_calls restart with 1;
'@
  $effectRestore="alter table public.equora_runtime_capability_gates drop constraint $constraintName;" +
    $restoreKnown + ' drop function public.equora_gate_check_effect_fixture(boolean); drop table public.equora_gate_check_effect_log; drop sequence public.equora_gate_check_calls;'
  Invoke-TradeImportDriftCase -Name "Gate CHECK effect NOT VALID replaceKnown=$replaceKnown" `
    -ApplySql $effectSetup -ProbeSql $deactivationProbe `
    -ExpectedCode 'TRADE_IMPORT_DEACTIVATION_CHECK_EFFECTS_INVALID' `
    -RestoreSql $effectRestore -PreservePersistence `
    -InvariantSql 'select ((select count(*) from public.equora_gate_check_effect_log)=0 and not (select is_called from public.equora_gate_check_calls))::text;'
}
foreach($gateCheck in $checkCases | Where-Object {$_.Table -eq 'equora_runtime_capability_gates'}) {
  $name=$gateCheck.Name
  $definition=Get-TradeImportScalar "select pg_get_constraintdef(oid,false) from pg_constraint where conrelid='public.equora_runtime_capability_gates'::regclass and conname='$name';"
  Invoke-TradeImportDriftCase -Name "Gate same-name CHECK true: $name" `
    -ApplySql "alter table public.equora_runtime_capability_gates drop constraint $name; alter table public.equora_runtime_capability_gates add constraint $name check(true);" `
    -ProbeSql $deactivationProbe -ExpectedCode 'TRADE_IMPORT_DEACTIVATION_CHECK_EFFECTS_INVALID' `
    -RestoreSql "alter table public.equora_runtime_capability_gates drop constraint $name; alter table public.equora_runtime_capability_gates add constraint $name $definition;" -PreservePersistence
}
Invoke-TradeImportDriftCase -Name 'Gate additional validated CHECK' `
  -ApplySql 'alter table public.equora_runtime_capability_gates add constraint equora_extra_gate_check check(true);' `
  -ProbeSql $deactivationProbe -ExpectedCode 'TRADE_IMPORT_DEACTIVATION_CHECK_EFFECTS_INVALID' `
  -RestoreSql 'alter table public.equora_runtime_capability_gates drop constraint equora_extra_gate_check;' -PreservePersistence
Invoke-TradeImportDriftCase -Name 'Gate generated column' `
  -ApplySql 'alter table public.equora_runtime_capability_gates add column equora_generated_fixture integer generated always as (case when enabled then 1 else 0 end) stored;' `
  -ProbeSql $deactivationProbe -ExpectedCode 'TRADE_IMPORT_DEACTIVATION_TARGET_EFFECTS_INVALID' `
  -RestoreSql 'alter table public.equora_runtime_capability_gates drop column equora_generated_fixture;' -PreservePersistence
foreach($indexDefinition in @('(enabled)','((not enabled))','(enabled) where enabled')){
  Invoke-TradeImportDriftCase -Name "Gate unexpected index: $indexDefinition" `
    -ApplySql "create index equora_gate_index_fixture on public.equora_runtime_capability_gates $indexDefinition;" `
    -ProbeSql $deactivationProbe -ExpectedCode 'TRADE_IMPORT_DEACTIVATION_INDEX_EFFECTS_INVALID' `
    -RestoreSql 'drop index public.equora_gate_index_fixture;' -PreservePersistence
}
Invoke-TradeImportDriftCase -Name 'Gate FORCE RLS' `
  -ApplySql 'alter table public.equora_runtime_capability_gates force row level security;' `
  -ProbeSql $deactivationProbe -ExpectedCode 'TRADE_IMPORT_DEACTIVATION_TARGET_EFFECTS_INVALID' `
  -RestoreSql 'alter table public.equora_runtime_capability_gates no force row level security;' -PreservePersistence
# An off row preceding an on row must not produce a false already-disabled PASS.
Invoke-TradeImportDriftCase -Name 'Gate duplicate target rows' -ApplySql @'
alter table public.equora_runtime_capability_gates drop constraint equora_runtime_capability_gates_pkey;
update public.equora_runtime_capability_gates set enabled=false,activated_at=null;
insert into public.equora_runtime_capability_gates(capability_key,contract_version,enabled,activated_at)
select capability_key,contract_version,true,transaction_timestamp() from public.equora_runtime_capability_gates;
'@ -ProbeSql $deactivationProbe -ExpectedCode 'TRADE_IMPORT_DEACTIVATION_GATE_AMBIGUOUS' -RestoreSql @'
delete from public.equora_runtime_capability_gates where not enabled;
alter table public.equora_runtime_capability_gates add constraint equora_runtime_capability_gates_pkey primary key(capability_key,contract_version);
'@ -PreservePersistence
# Missing/known NOT VALID CHECKs and a missing PK are safe for off, not for activation.
foreach($knownNotValid in @($false,$true)){
  $prepared=$false
  try {
    $prepare="begin; alter table public.equora_runtime_capability_gates drop constraint $activationCheck; alter table public.equora_runtime_capability_gates drop constraint equora_runtime_capability_gates_pkey; update public.equora_runtime_capability_gates set enabled=true,activated_at=null;"
    if($knownNotValid){$prepare+=" alter table public.equora_runtime_capability_gates add constraint $activationCheck $activationDefinition not valid;"}
    Invoke-TradeImportSqlText ($prepare+' commit;') 'Inconsistent gate setup' | Out-Null
    $prepared=$true
    Invoke-TradeImportSqlExpectFailure (Expand-TradeImportV5762File -Name 'activate-v57.62.0-trade-import.sql') 'TRADE_IMPORT_VERIFY_' 'Activation still rejects incomplete target' | Out-Null
    Set-TradeImportActivationState -Enabled $false
  } finally {
    if($prepared){
      $restore="begin; update public.equora_runtime_capability_gates set enabled=false,activated_at=null;"
      if($knownNotValid){$restore+=" alter table public.equora_runtime_capability_gates drop constraint $activationCheck;"}
      $restore+=" alter table public.equora_runtime_capability_gates add constraint $activationCheck $activationDefinition; alter table public.equora_runtime_capability_gates add constraint equora_runtime_capability_gates_pkey primary key(capability_key,contract_version); commit;"
      Invoke-TradeImportSqlText $restore 'Inconsistent gate restoration' | Out-Null
    }
  }
}
Write-Output 'Gate target effects PASS: CHECK positive controls; zero sentinel writes and zero invocations on rejection; generated/index/FORCE RLS drift; ambiguous rows rejected; missing/known NOT VALID checks safely closed.'
# Real activation must reject additional executable index expressions, not
# merely rely on the operational off script to discover them afterward.
foreach($indexKind in @('expression','partial')) {
  $indexDefinition='((public.equora_activation_index_wrapper(enabled)))'
  if($indexKind -eq 'partial'){$indexDefinition='(enabled) where public.equora_activation_index_wrapper(enabled)'}
  $indexEffectSetup=@'
create table public.equora_activation_index_log(executor text);
create sequence public.equora_activation_index_calls;
create function public.equora_activation_index_effect(boolean) returns boolean
language plpgsql volatile as $fixture$
begin
  perform nextval('public.equora_activation_index_calls'::regclass);
  if $1 then
    insert into public.equora_activation_index_log(executor) values(current_user);
  end if;
  return $1;
end;
$fixture$;
create function public.equora_activation_index_wrapper(boolean) returns boolean
language sql immutable as $fixture$ select public.equora_activation_index_effect($1); $fixture$;
'@ + [Environment]::NewLine + "create index equora_activation_index_fixture on public.equora_runtime_capability_gates $indexDefinition;" + [Environment]::NewLine + @'
do $off_baseline$
begin
  if (select count(*) from public.equora_runtime_capability_gates) <> 1
    or not (select not enabled and activated_at is null from public.equora_runtime_capability_gates)
    or (select count(*) from public.equora_activation_index_log) <> 0 then
    raise exception 'TEST_ACTIVATION_INDEX_OFF_BASELINE_INVALID';
  end if;
end;
$off_baseline$;
savepoint activation_index_control;
update public.equora_runtime_capability_gates set enabled=true,activated_at=transaction_timestamp()
where capability_key='journal_file_import_persistence_v2'
and contract_version='equora-broker-file-import-capability-v1';
do $control$
begin
  if (select count(*) from public.equora_activation_index_log where executor='postgres') < 1
    or not (select is_called from public.equora_activation_index_calls) then
    raise exception 'TEST_ACTIVATION_INDEX_POSITIVE_CONTROL_FAILED';
  end if;
end;
$control$;
rollback to savepoint activation_index_control;
alter sequence public.equora_activation_index_calls restart with 1;
'@
  Invoke-TradeImportDriftCase -Name "Actual activation index effect: $indexKind" `
    -ApplySql $indexEffectSetup -ProbeSql $activationProbe `
    -ExpectedCode 'TRADE_IMPORT_VERIFY_GATE_INDEX_EFFECTS_INVALID' -PreservePersistence `
    -InvariantSql 'select ((select count(*) from public.equora_activation_index_log)=0 and not (select is_called from public.equora_activation_index_calls))::text;' `
    -RestoreSql @'
drop index public.equora_activation_index_fixture;
drop function public.equora_activation_index_wrapper(boolean);
drop function public.equora_activation_index_effect(boolean);
drop table public.equora_activation_index_log;
drop sequence public.equora_activation_index_calls;
'@
  Invoke-TradeImportSqlText $verifier 'Activation index fixture fully restored' | Out-Null
}
Write-Output 'Actual activation index effects PASS: IMMUTABLE/VOLATILE positive controls; expression and partial indexes rejected before invocation or mutation.'
# A constant predicate can be evaluated by SELECT planning. The generic
# persistence observer also reads the gate, so do not use it while this fixture
# exists. Relation-form COPY reads stored rows without planning a gate SELECT.
$beforeConstantFixture=Get-TradeImportPersistenceSnapshot
$gateCopySql='copy public.equora_runtime_capability_gates to stdout;'
$beforeConstantGate=Get-TradeImportScalar $gateCopySql
$constantFixtureApplied=$false
try {
  Invoke-TradeImportSqlText @'
begin;
create table public.equora_constant_index_log(executor text);
create sequence public.equora_constant_index_calls;
create function public.equora_constant_index_effect() returns boolean
language plpgsql volatile as $fixture$
begin
  perform nextval('public.equora_constant_index_calls'::regclass);
  insert into public.equora_constant_index_log values(current_user);
  return true;
end;
$fixture$;
create function public.equora_constant_index_wrapper() returns boolean
language sql immutable as $fixture$ select public.equora_constant_index_effect(); $fixture$;
create index equora_constant_index_fixture
on public.equora_runtime_capability_gates(capability_key)
where public.equora_constant_index_wrapper();
truncate public.equora_constant_index_log;
alter sequence public.equora_constant_index_calls restart with 1;
select count(*) from public.equora_runtime_capability_gates
where capability_key='journal_file_import_persistence_v2'
  and contract_version='equora-broker-file-import-capability-v1'
  and ((enabled and activated_at is not null) or (not enabled and activated_at is null));
do $control$
begin
  if not (select is_called from public.equora_constant_index_calls)
    or not exists (select 1 from public.equora_constant_index_log where executor='postgres') then
    raise exception 'TEST_CONSTANT_INDEX_PLANNING_CONTROL_FAILED';
  end if;
end;
$control$;
truncate public.equora_constant_index_log;
alter sequence public.equora_constant_index_calls restart with 1;
commit;
'@ 'Constant index planner fixture and positive control' | Out-Null
  $constantFixtureApplied=$true
  Invoke-TradeImportSqlExpectFailure $activationProbe 'TRADE_IMPORT_VERIFY_GATE_INDEX_EFFECTS_INVALID' 'Actual activation rejects constant index before gate planning' | Out-Null
  $constantInvariant='select (not (select is_called from public.equora_constant_index_calls) and not exists (select 1 from public.equora_constant_index_log))::text;'
  if((Get-TradeImportScalar $constantInvariant) -ne 'true'){
    throw 'Constant index was invoked before rejection.'
  }
  if((Get-TradeImportScalar $gateCopySql) -cne $beforeConstantGate){
    throw 'Constant index rejection changed stored gate rows.'
  }
  if((Get-TradeImportScalar $constantInvariant) -ne 'true'){
    throw 'Relation COPY observer invoked the constant index.'
  }
} finally {
  if($constantFixtureApplied){
    # Remove only test metadata and observers, never restore gate/financial rows.
    Invoke-TradeImportSqlText @'
begin;
drop index public.equora_constant_index_fixture;
drop function public.equora_constant_index_wrapper();
drop function public.equora_constant_index_effect();
drop table public.equora_constant_index_log;
drop sequence public.equora_constant_index_calls;
commit;
'@ 'Constant index fixture cleanup' | Out-Null
  }
}
if((Get-TradeImportPersistenceSnapshot) -cne $beforeConstantFixture){
  throw 'Constant index probe changed persistence across metadata-only cleanup.'
}
Invoke-TradeImportSqlText $verifier 'Constant index fixture fully restored' | Out-Null
Write-Output 'Constant index planner PASS: positive SELECT control; zero calls and writes before cleanup; stored gate COPY unchanged; full persistence unchanged after metadata-only cleanup.'

# Source-key data is also read by the real activation verifier. Keep the full
# persistence observer outside this constant-index fixture, as for the gate.
$beforeSourceFixture=Get-TradeImportPersistenceSnapshot
$sourceCopySql='copy public.trade_import_source_keys to stdout;'
$beforeSourceCopy=Get-TradeImportScalar $sourceCopySql
$beforeSourceGate=Get-TradeImportScalar $gateCopySql
$sourceFixtureApplied=$false
try {
  Invoke-TradeImportSqlText @'
begin;
create table public.equora_source_index_log(executor text);
create sequence public.equora_source_index_calls;
create function public.equora_source_index_effect() returns boolean
language plpgsql volatile as $fixture$
begin
  perform nextval('public.equora_source_index_calls'::regclass);
  insert into public.equora_source_index_log values(current_user);
  return true;
end;
$fixture$;
create function public.equora_source_index_wrapper() returns boolean
language sql immutable as $fixture$ select public.equora_source_index_effect(); $fixture$;
create index equora_source_index_fixture on public.trade_import_source_keys(id)
where public.equora_source_index_wrapper();
truncate public.equora_source_index_log;
alter sequence public.equora_source_index_calls restart with 1;
-- This is the actual data predicate used by the verifier, not a wrapper call.
select exists (
  select 1 from public.trade_import_source_keys
  where snapshot_digest is distinct from encode(
    pg_catalog.sha256(convert_to(trade_snapshot::text,'UTF8')),'hex')
);
do $control$
begin
  if not (select is_called from public.equora_source_index_calls)
    or not exists (select 1 from public.equora_source_index_log where executor='postgres') then
    raise exception 'TEST_SOURCE_INDEX_PLANNING_CONTROL_FAILED';
  end if;
end;
$control$;
truncate public.equora_source_index_log;
alter sequence public.equora_source_index_calls restart with 1;
commit;
'@ 'Source-key index planner fixture and positive control' | Out-Null
  $sourceFixtureApplied=$true
  Invoke-TradeImportSqlExpectFailure $activationProbe 'TRADE_IMPORT_VERIFY_SOURCE_KEY_INDEX_EFFECTS_INVALID' 'Actual activation rejects source-key index before digest planning' | Out-Null
  $sourceInvariant='select (not (select is_called from public.equora_source_index_calls) and not exists (select 1 from public.equora_source_index_log))::text;'
  if((Get-TradeImportScalar $sourceInvariant) -ne 'true'){
    throw 'Source-key index was invoked before rejection.'
  }
  if((Get-TradeImportScalar $sourceCopySql) -cne $beforeSourceCopy -or (Get-TradeImportScalar $gateCopySql) -cne $beforeSourceGate){
    throw 'Source-key index rejection changed stored source or gate rows.'
  }
  if((Get-TradeImportScalar $sourceInvariant) -ne 'true'){
    throw 'Relation COPY observer invoked the source-key index.'
  }
} finally {
  if($sourceFixtureApplied){
    Invoke-TradeImportSqlText @'
begin;
drop index public.equora_source_index_fixture;
drop function public.equora_source_index_wrapper();
drop function public.equora_source_index_effect();
drop table public.equora_source_index_log;
drop sequence public.equora_source_index_calls;
commit;
'@ 'Source-key index fixture metadata-only cleanup' | Out-Null
  }
}
if((Get-TradeImportPersistenceSnapshot) -cne $beforeSourceFixture){
  throw 'Source-key index probe changed persistence across metadata-only cleanup.'
}
Invoke-TradeImportSqlText $verifier 'Source-key index fixture fully restored' | Out-Null
foreach($sourceExpression in @('snapshot_digest','(length(snapshot_digest))')){
  Invoke-TradeImportDriftCase -Name "Source-key unexpected index: $sourceExpression" `
    -ApplySql "create index equora_source_extra_fixture on public.trade_import_source_keys($sourceExpression);" `
    -ProbeSql $activationProbe -ExpectedCode 'TRADE_IMPORT_VERIFY_SOURCE_KEY_INDEX_EFFECTS_INVALID' `
    -PreservePersistence -RestoreSql 'drop index public.equora_source_extra_fixture;'
}
$sourceIdentityDefinition=Get-TradeImportScalar "select pg_get_indexdef('public.trade_import_source_keys_active_identity_key'::regclass,0,false);"
$sourcePatternDefinition=$sourceIdentityDefinition.Replace('preset_key,','preset_key text_pattern_ops,')
if($sourcePatternDefinition -ceq $sourceIdentityDefinition){throw 'Source-key operator-class fixture construction failed.'}
Invoke-TradeImportDriftCase -Name 'Source-key nondefault operator class' `
  -ApplySql "drop index public.trade_import_source_keys_active_identity_key; $sourcePatternDefinition;" `
  -ProbeSql $activationProbe -ExpectedCode 'TRADE_IMPORT_VERIFY_SOURCE_KEY_INDEX_EFFECTS_INVALID' `
  -PreservePersistence -RestoreSql "drop index public.trade_import_source_keys_active_identity_key; $sourceIdentityDefinition;"
Invoke-TradeImportDriftCase -Name 'Source-key inherited child' `
  -ApplySql 'create table public.equora_source_inheritance_fixture() inherits(public.trade_import_source_keys);' `
  -ProbeSql $activationProbe -ExpectedCode 'TRADE_IMPORT_VERIFY_SOURCE_KEY_RELATION_EFFECTS_INVALID' `
  -PreservePersistence -RestoreSql 'drop table public.equora_source_inheritance_fixture;'
Invoke-TradeImportSqlText $verifier 'Source-key shape fixtures fully restored' | Out-Null
Write-Output 'Source-key index PASS: real digest-planning positive control; zero calls/writes before cleanup; source/gate COPY unchanged; full persistence unchanged after metadata-only cleanup; extra indexes, nondefault operator class and inheritance rejected.'

# Extended-statistics expressions are planned even without ANALYZE. Exercise
# the actual verifier query and operational off query on each affected target.
$sourceStatisticsControl=@'
select exists (
  select 1 from public.trade_import_source_keys
  where snapshot_digest is distinct from encode(
    pg_catalog.sha256(convert_to(trade_snapshot::text,'UTF8')),'hex')
);
'@
$gateStatisticsControl=@'
select count(*) from public.equora_runtime_capability_gates
where capability_key='journal_file_import_persistence_v2'
  and contract_version='equora-broker-file-import-capability-v1'
  and ((enabled and activated_at is not null) or (not enabled and activated_at is null));
'@
$offStatisticsControl=@'
select enabled, activated_at from public.equora_runtime_capability_gates
where capability_key='journal_file_import_persistence_v2'
  and contract_version='equora-broker-file-import-capability-v1' for update;
'@
$statisticsCases=@(
  @{Name='source_activation';Relation='trade_import_source_keys';Enabled=$false;
    Control=$sourceStatisticsControl;Probe=$activationProbe;
    Error='TRADE_IMPORT_VERIFY_SOURCE_KEY_STATISTICS_EFFECTS_INVALID'},
  @{Name='gate_activation';Relation='equora_runtime_capability_gates';Enabled=$false;
    Control=$gateStatisticsControl;Probe=$activationProbe;
    Error='TRADE_IMPORT_VERIFY_GATE_STATISTICS_EFFECTS_INVALID'},
  @{Name='gate_deactivation';Relation='equora_runtime_capability_gates';Enabled=$true;
    Control=$offStatisticsControl;Probe=$deactivationProbe;
    Error='TRADE_IMPORT_DEACTIVATION_STATISTICS_EFFECTS_INVALID'}
)
foreach($statisticsCase in $statisticsCases){
  Set-TradeImportActivationState -Enabled $statisticsCase.Enabled
  $beforeStatisticsFixture=Get-TradeImportPersistenceSnapshot
  $beforeStatisticsSource=Get-TradeImportScalar $sourceCopySql
  $beforeStatisticsGate=Get-TradeImportScalar $gateCopySql
  $statisticsApplied=$false
  try {
    $statisticsSetup=@'
begin;
create table public.equora_statistics_log(executor text);
create sequence public.equora_statistics_calls;
create function public.equora_statistics_effect() returns boolean
language plpgsql volatile as $fixture$
begin
  perform nextval('public.equora_statistics_calls'::regclass);
  insert into public.equora_statistics_log values(current_user);
  return true;
end;
$fixture$;
create function public.equora_statistics_wrapper() returns boolean
language sql immutable as $fixture$ select public.equora_statistics_effect(); $fixture$;
create statistics public.equora_statistics_fixture
on (public.equora_statistics_wrapper()) from public.__RELATION__;
truncate public.equora_statistics_log;
alter sequence public.equora_statistics_calls restart with 1;
__CONTROL__
do $control$
begin
  if not (select is_called from public.equora_statistics_calls)
    or not exists (select 1 from public.equora_statistics_log where executor='postgres') then
    raise exception 'TEST_STATISTICS_PLANNING_CONTROL_FAILED';
  end if;
end;
$control$;
truncate public.equora_statistics_log;
alter sequence public.equora_statistics_calls restart with 1;
commit;
'@
    $statisticsSetup=$statisticsSetup.Replace('__RELATION__',$statisticsCase.Relation).Replace('__CONTROL__',$statisticsCase.Control)
    Invoke-TradeImportSqlText $statisticsSetup "Statistics planning control: $($statisticsCase.Name)" | Out-Null
    $statisticsApplied=$true
    Invoke-TradeImportSqlExpectFailure $statisticsCase.Probe $statisticsCase.Error "Actual statistics rejection: $($statisticsCase.Name)" | Out-Null
    $statisticsInvariant='select (not (select is_called from public.equora_statistics_calls) and not exists (select 1 from public.equora_statistics_log))::text;'
    if((Get-TradeImportScalar $statisticsInvariant) -ne 'true'){
      throw "Statistics expression invoked before rejection: $($statisticsCase.Name)"
    }
    if((Get-TradeImportScalar $sourceCopySql) -cne $beforeStatisticsSource -or (Get-TradeImportScalar $gateCopySql) -cne $beforeStatisticsGate){
      throw "Statistics rejection changed stored source or gate rows: $($statisticsCase.Name)"
    }
    if((Get-TradeImportScalar $statisticsInvariant) -ne 'true'){
      throw 'Relation COPY observer invoked statistics expression.'
    }
  } finally {
    if($statisticsApplied){
      Invoke-TradeImportSqlText @'
begin;
drop statistics public.equora_statistics_fixture;
drop function public.equora_statistics_wrapper();
drop function public.equora_statistics_effect();
drop table public.equora_statistics_log;
drop sequence public.equora_statistics_calls;
commit;
'@ 'Statistics fixture metadata-only cleanup' | Out-Null
    }
  }
  if((Get-TradeImportPersistenceSnapshot) -cne $beforeStatisticsFixture){
    throw "Statistics fixture changed persistence across metadata-only cleanup: $($statisticsCase.Name)"
  }
  Invoke-TradeImportSqlText $verifier 'Statistics fixture fully restored' | Out-Null
  Write-Output "Statistics planner PASS: $($statisticsCase.Name); real query control without ANALYZE; zero calls/writes; source/gate COPY unchanged; full persistence unchanged after metadata-only cleanup."
}
Set-TradeImportActivationState -Enabled $false

# Replace existing columns rather than adding extra ones: type names, column
# counts and nullability alone must not accept generated columns or domains.
$keyCheck='equora_runtime_capability_gates_key_check'
$keyDefinition=Get-TradeImportScalar "select pg_get_constraintdef(oid,false) from pg_constraint where conrelid='public.equora_runtime_capability_gates'::regclass and conname='$keyCheck';"
if(-not $keyDefinition.StartsWith('CHECK (')){throw 'Missing original gate key CHECK.'}
foreach($columnKind in @('generated-key','timestamp-domain')) {
  $columnEffectSetup=@'
create table public.equora_column_effect_log(executor text);
create sequence public.equora_column_effect_calls;
create function public.equora_column_effect(boolean) returns boolean
language plpgsql volatile as $fixture$
begin
  perform nextval('public.equora_column_effect_calls'::regclass);
  if $1 then
    insert into public.equora_column_effect_log values(current_user);
  end if;
  return true;
end;
$fixture$;
'@
  if($columnKind -eq 'generated-key'){
    $columnEffectSetup += [Environment]::NewLine + @'
create function public.equora_generated_key(boolean) returns text
language sql immutable as $fixture$
  select 'journal_file_import_persistence_v2'::text where public.equora_column_effect($1);
$fixture$;
alter table public.equora_runtime_capability_gates
  drop constraint equora_runtime_capability_gates_pkey,
  drop constraint equora_runtime_capability_gates_key_check,
  drop column capability_key;
alter table public.equora_runtime_capability_gates add column capability_key text
  generated always as (public.equora_generated_key(enabled)) stored not null;
'@ + [Environment]::NewLine + "alter table public.equora_runtime_capability_gates add constraint $keyCheck $keyDefinition, add constraint equora_runtime_capability_gates_pkey primary key(capability_key,contract_version);"
    $columnEffectRestore=@'
alter table public.equora_runtime_capability_gates
  drop constraint equora_runtime_capability_gates_pkey,
  drop constraint equora_runtime_capability_gates_key_check,
  drop column capability_key;
alter table public.equora_runtime_capability_gates add column capability_key text
  not null default 'journal_file_import_persistence_v2';
alter table public.equora_runtime_capability_gates alter column capability_key drop default;
drop function public.equora_generated_key(boolean);
'@ + [Environment]::NewLine + "alter table public.equora_runtime_capability_gates add constraint $keyCheck $keyDefinition, add constraint equora_runtime_capability_gates_pkey primary key(capability_key,contract_version);"
  } else {
    $columnEffectSetup += [Environment]::NewLine + @'
create domain public.equora_timestamp_domain as timestamptz
  check(public.equora_column_effect(value is not null));
alter table public.equora_runtime_capability_gates alter column activated_at
  type public.equora_timestamp_domain using activated_at::public.equora_timestamp_domain;
'@
    $columnEffectRestore=@'
alter table public.equora_runtime_capability_gates alter column activated_at
  type timestamptz using activated_at::timestamptz;
drop domain public.equora_timestamp_domain;
'@
  }
  $columnEffectSetup += [Environment]::NewLine + @'
truncate public.equora_column_effect_log;
alter sequence public.equora_column_effect_calls restart with 1;
savepoint column_effect_control;
update public.equora_runtime_capability_gates
set enabled=true,activated_at=transaction_timestamp()
where capability_key='journal_file_import_persistence_v2'
  and contract_version='equora-broker-file-import-capability-v1';
do $control$
begin
  if not (select is_called from public.equora_column_effect_calls)
    or not exists (select 1 from public.equora_column_effect_log where executor='postgres') then
    raise exception 'TEST_COLUMN_EFFECT_POSITIVE_CONTROL_FAILED';
  end if;
end;
$control$;
rollback to savepoint column_effect_control;
alter sequence public.equora_column_effect_calls restart with 1;
'@
  $columnEffectRestore += [Environment]::NewLine + @'
drop function public.equora_column_effect(boolean);
drop table public.equora_column_effect_log;
drop sequence public.equora_column_effect_calls;
'@
  $columnCase=@{
    Name="Actual activation column effect: $columnKind"
    ApplySql=$columnEffectSetup
    ProbeSql=$activationProbe
    ExpectedCode='TRADE_IMPORT_VERIFY_COLUMN_SHAPE_INVALID'
    RestoreSql=$columnEffectRestore
    PreservePersistence=$true
    InvariantSql='select (not (select is_called from public.equora_column_effect_calls) and not exists (select 1 from public.equora_column_effect_log))::text;'
  }
  Invoke-TradeImportDriftCase @columnCase
  Invoke-TradeImportSqlText $verifier 'Column effect fixture fully restored' | Out-Null
}
# Also exercise the independent contract for additive legacy-table columns.
$additiveDomainCase=@{
  Name='Additive request digest domain'
  ApplySql='create domain public.equora_digest_domain as text check(true); alter table public.trade_import_batches alter column request_digest type public.equora_digest_domain using request_digest::public.equora_digest_domain;'
  ProbeSql=$activationProbe
  ExpectedCode='TRADE_IMPORT_VERIFY_ADDITIVE_COLUMNS_INVALID'
  RestoreSql='alter table public.trade_import_batches alter column request_digest type text using request_digest::text; drop domain public.equora_digest_domain;'
  PreservePersistence=$true
}
Invoke-TradeImportDriftCase @additiveDomainCase
Invoke-TradeImportSqlText $verifier 'Additive domain fixture fully restored' | Out-Null
Write-Output 'Column contracts PASS: existing generated key and timestamp domain rejected before calls or mutation; additive request-digest domain rejected; original contracts restored.'
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
Write-Output 'Trade-import post-install negative gate PASS: receipt, default-off redeploy, activation marker, relation persistence, collation, function behavior, RLS, index, FK, column ACL and PUBLIC execute drift; kill switch closes despite unrelated drift.'
