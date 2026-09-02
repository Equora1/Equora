\set ON_ERROR_STOP on

begin;
set local statement_timeout = '10s';

insert into auth.users(id,email,created_at,updated_at) values
  ('b1000000-0000-4000-8000-000000000001','owner-one@example.invalid',now(),now()),
  ('b2000000-0000-4000-8000-000000000002','owner-two@example.invalid',now(),now());

do $$
declare
  v_active_predicate text;
  v_active_unique boolean;
  v_active_key_count integer;
  v_active_columns text[];
  v_import_security_definer boolean;
  v_import_owner text;
  v_import_config text[];
begin
  select
    pg_get_expr(index_row.indpred,index_row.indrelid),
    index_row.indisunique,
    index_row.indnkeyatts,
    array(
      select pg_get_indexdef(index_row.indexrelid,column_number,true)
      from generate_series(1,index_row.indnkeyatts)
        as index_column(column_number)
      order by column_number
    )
  into
    v_active_predicate,
    v_active_unique,
    v_active_key_count,
    v_active_columns
  from pg_index index_row
  join pg_class relation_row on relation_row.oid=index_row.indexrelid
  join pg_namespace namespace_row on namespace_row.oid=relation_row.relnamespace
  where namespace_row.nspname='public'
    and relation_row.relname='trade_import_source_keys_active_identity_key';

  select procedure_row.prosecdef,owner_row.rolname,procedure_row.proconfig
  into v_import_security_definer,v_import_owner,v_import_config
  from pg_proc procedure_row
  join pg_roles owner_row on owner_row.oid=procedure_row.proowner
  where procedure_row.oid=(
    'public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure
  );

  if to_regclass('public.equora_runtime_capability_gates') is null
    or to_regclass('public.journal_import_accounts') is null
    or to_regclass('public.trade_import_source_keys') is null
    or v_active_predicate is null
    or v_active_predicate is distinct from '(status = ''active''::text)'
    or v_active_unique is distinct from true
    or v_active_key_count is distinct from 5
    or v_active_columns is distinct from array[
      'user_id','import_account_id','preset_key','source_kind','source_digest'
    ]::text[]
    or (
      select count(*) from pg_constraint
      where conrelid in (
        'public.journal_import_accounts'::regclass,
        'public.trade_import_source_keys'::regclass,
        'public.trades'::regclass,
        'public.trade_import_batches'::regclass
      ) and conname in (
        'journal_import_accounts_user_id_id_key',
        'trade_import_source_keys_account_owner_fkey',
        'trade_import_source_keys_batch_owner_fkey',
        'trade_import_source_keys_trade_owner_fkey',
        'trades_import_account_owner_fkey',
        'trade_import_batches_import_account_owner_fkey'
      )
    ) <> 6
    or exists (
      select 1 from pg_constraint
      where conrelid in (
        'public.journal_import_accounts'::regclass,
        'public.trade_import_source_keys'::regclass,
        'public.trades'::regclass,
        'public.trade_import_batches'::regclass
      ) and conname in (
        'journal_import_accounts_user_id_id_key',
        'trade_import_source_keys_account_owner_fkey',
        'trade_import_source_keys_batch_owner_fkey',
        'trade_import_source_keys_trade_owner_fkey',
        'trades_import_account_owner_fkey',
        'trade_import_batches_import_account_owner_fkey'
      ) and not convalidated
    )
  then raise exception 'TEST_CATALOG_CONTRACT_INVALID'; end if;

  if v_import_security_definer is distinct from true
    or v_import_owner is distinct from 'postgres'
    or not (
      coalesce(v_import_config,'{}'::text[]) @> array['search_path=""']
    )
  then raise exception 'TEST_RPC_SECURITY_CONTRACT_INVALID'; end if;

  if not exists (
      select 1
      from public.equora_runtime_capability_gates gate
      where gate.capability_key='journal_file_import_persistence_v2'
        and gate.contract_version='equora-broker-file-import-capability-v1'
        and not gate.enabled
        and gate.activated_at is null
    ) or not exists (
      select 1 from pg_class
      where oid='public.equora_runtime_capability_gates'::regclass
        and relrowsecurity
    ) or exists (
      select 1 from pg_policy
      where polrelid='public.equora_runtime_capability_gates'::regclass
    )
  then raise exception 'TEST_DATABASE_ACTIVATION_DEFAULT_INVALID'; end if;

  if not exists (
      select 1 from pg_class
      where oid='public.journal_import_accounts'::regclass and relrowsecurity
    ) or not exists (
      select 1 from pg_class
      where oid='public.trade_import_source_keys'::regclass and relrowsecurity
    ) or exists (
      select 1 from pg_policy
      where polrelid in (
        'public.journal_import_accounts'::regclass,
        'public.trade_import_source_keys'::regclass
      ) and polcmd <> 'r'
    )
  then raise exception 'TEST_RLS_POLICY_CONTRACT_INVALID'; end if;

  if not has_table_privilege('authenticated','public.journal_import_accounts','select')
    or not has_table_privilege('authenticated','public.trade_import_source_keys','select')
    or has_table_privilege('authenticated','public.journal_import_accounts','insert,update,delete')
    or has_table_privilege('authenticated','public.trade_import_source_keys','insert,update,delete')
    or has_table_privilege('authenticated','public.trade_import_batches','insert,update,delete')
    or has_table_privilege(
      'authenticated','public.equora_runtime_capability_gates',
      'select,insert,update,delete'
    )
    or has_table_privilege(
      'anon','public.equora_runtime_capability_gates',
      'select,insert,update,delete'
    )
  then raise exception 'TEST_TABLE_PRIVILEGE_BOUNDARY_INVALID'; end if;

  if has_function_privilege(
      'authenticated','public.equora_import_trades_v1(uuid,jsonb,jsonb)','execute'
    ) then raise exception 'TEST_LEGACY_IMPORT_EXECUTE_OPEN'; end if;
  if has_function_privilege(
      'authenticated','public.equora_upsert_import_account_v1(uuid,text,text,text)','execute'
    ) then raise exception 'TEST_ACCOUNT_UPSERT_EXECUTE_OPEN'; end if;
  if not has_function_privilege(
      'authenticated',
      'public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)','execute'
    ) or not has_function_privilege(
      'authenticated','public.equora_revert_import_v1(uuid)','execute'
    ) or has_function_privilege(
      'anon','public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)','execute'
    ) or has_function_privilege(
      'anon','public.equora_revert_import_v1(uuid)','execute'
    )
  then raise exception 'TEST_RPC_PRIVILEGE_BOUNDARY_INVALID'; end if;
end;
$$;

create function pg_temp.fixture_state()
returns text
language sql
stable
set search_path = ''
as $$
  select
    (select count(*) from public.journal_import_accounts)::text || '|' ||
    (select count(*) from public.trade_import_batches)::text || '|' ||
    (select count(*) from public.trades)::text || '|' ||
    (select count(*) from public.trade_import_source_keys)::text
$$;

create function pg_temp.fixture_snapshot()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
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
  )
$$;

create function pg_temp.single_import(
  p_batch_id uuid,
  p_import_account_id uuid,
  p_file_name text,
  p_preset text,
  p_trade_currency text,
  p_source_keys jsonb default '[]'::jsonb,
  p_source_row integer default 2,
  p_trade_row integer default 2,
  p_preview_status text default 'importable',
  p_created_at text default '2026-08-30T10:00:00.000Z',
  p_user_cost_profile_id text default null,
  p_account_label text default 'Primary Account'
)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select public.equora_import_trades_v2(
    p_batch_id,
    p_import_account_id,
    jsonb_build_object(
      'file_name',p_file_name,
      'preset_key',p_preset,
      'preset_label','Generic CSV',
      'account_label',p_account_label,
      'account_currency','EUR'
    ),
    jsonb_build_array(jsonb_build_object(
      'row_number',p_source_row,
      'preview_status',p_preview_status,
      'selected',true
    )),
    jsonb_build_array(jsonb_build_object(
      'row_number',p_trade_row,
      'trade',jsonb_build_object(
        'id','b1000000-0000-4000-8000-000000000099',
        'created_at',p_created_at,
        'market','BTCUSDT',
        'setup','Imported execution',
        'bias','long',
        'net_pnl','12.50',
        'position_size','0.0100',
        'account_currency',p_trade_currency,
        'broker_profile','generic',
        'account_template','spot',
        'user_cost_profile_id',p_user_cost_profile_id
      ),
      'tags',jsonb_build_array('CSV Import'),
      'source_keys',p_source_keys
    ))
  )
$$;

create function pg_temp.primary_import(p_file_name text)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select public.equora_import_trades_v2(
    'b1000000-0000-4000-8000-000000000010',
    null,
    jsonb_build_object(
      'file_name',p_file_name,
      'preset_key','generic',
      'preset_label','Generic CSV',
      'account_label','Primary Account',
      'account_currency','EUR',
      'created_at','1999-01-01T00:00:00Z'
    ),
    '[{"row_number":2,"preview_status":"importable","selected":true},{"row_number":3,"preview_status":"skip","selected":false},{"row_number":4,"preview_status":"check","selected":false}]'::jsonb,
    '[{"row_number":2,"trade":{"id":"b1000000-0000-4000-8000-000000000099","created_at":"2026-08-30T10:00:00.000Z","market":"BTCUSDT","setup":"Imported execution","bias":"long","net_pnl":"12.50","position_size":"0.0100","account_currency":" usd ","broker_profile":"generic","account_template":"spot"},"tags":["CSV Import"],"source_keys":[]}]'::jsonb
  )
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true
);
do $$
declare
  v_before text := pg_temp.fixture_state();
begin
  begin
    perform public.equora_import_trades_v2(
      'b1000000-0000-4000-8000-000000000009',null,
      '{"file_name":"disabled.csv","preset_key":"generic","preset_label":"Generic CSV","account_label":"Primary Account","account_currency":"EUR"}'::jsonb,
      '[{"row_number":2,"preview_status":"importable","selected":true}]'::jsonb,
      '[{"row_number":2,"trade":{"created_at":"2026-08-30T09:00:00.000Z","market":"BTCUSDT","setup":"Disabled import probe","bias":"long","net_pnl":"1.00","position_size":"0.0100","account_currency":"EUR","broker_profile":"generic","account_template":"spot"},"tags":["CSV Import"],"source_keys":[]}]'::jsonb
    );
    raise exception 'TEST_DISABLED_DIRECT_IMPORT_ACCEPTED';
  exception when others then
    if sqlerrm <> 'IMPORT_PERSISTENCE_DISABLED' then raise; end if;
  end;
  if pg_temp.fixture_state() is distinct from v_before
  then raise exception 'TEST_DISABLED_DIRECT_IMPORT_MUTATED'; end if;
end;
$$;
reset role;

update public.equora_runtime_capability_gates
set enabled=true,activated_at=clock_timestamp(),updated_at=clock_timestamp()
where capability_key='journal_file_import_persistence_v2'
  and contract_version='equora-broker-file-import-capability-v1';
do $$
begin
  if not exists (
    select 1 from public.equora_runtime_capability_gates gate
    where gate.capability_key='journal_file_import_persistence_v2'
      and gate.contract_version='equora-broker-file-import-capability-v1'
      and gate.enabled and gate.activated_at is not null
  ) then raise exception 'TEST_DATABASE_ACTIVATION_FAILED'; end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true
);

create temporary table fixture_results(name text primary key,result jsonb not null);
insert into fixture_results values ('initial',pg_temp.primary_import('primary.csv'));

do $$
declare
  v_result jsonb := (select result from fixture_results where name='initial');
  v_account_id uuid;
  v_trade_id uuid;
begin
  select import_account_id into v_account_id
  from public.trade_import_batches
  where id='b1000000-0000-4000-8000-000000000010';
  select id into v_trade_id
  from public.trades
  where import_batch_id='b1000000-0000-4000-8000-000000000010';

  if v_result->>'sourceRowCount' <> '3'
    or v_result->>'importedCount' <> '1'
    or v_result->>'duplicateCount' <> '0'
    or v_result->>'skippedCount' <> '1'
    or v_result->>'invalidCount' <> '1'
    or v_result->>'alreadyApplied' <> 'false'
    or jsonb_array_length(v_result->'importedIds') <> 1
    or v_account_id is null or v_trade_id is null
    or v_trade_id='b1000000-0000-4000-8000-000000000099'
    or (v_result->'importedIds'->>0)::uuid <> v_trade_id
    or not exists (
      select 1 from public.journal_import_accounts
      where id=v_account_id and user_id='b1000000-0000-4000-8000-000000000001'
        and account_currency='EUR'
    )
    or not exists (
      select 1 from public.trades
      where id=v_trade_id and account_currency='USD'
        and created_at='2026-08-30T10:00:00.000Z'
        and import_account_id=v_account_id
    )
    or not exists (
      select 1 from public.trade_import_batches
      where id='b1000000-0000-4000-8000-000000000010'
        and created_at=transaction_timestamp()
        and source_row_count=3 and imported_count=1
        and skipped_count=1 and invalid_count=1
        and source_manifest_digest=encode(pg_catalog.sha256(
          convert_to(source_manifest::text,'UTF8')
        ),'hex')
        and length(request_digest)=64
    )
    or not exists (
      select 1 from public.trade_import_source_keys
      where batch_id='b1000000-0000-4000-8000-000000000010'
        and trade_id=v_trade_id and status='active'
        and source_kind='value_fingerprint_v1'
    )
  then raise exception 'TEST_ATOMIC_IMPORT_STATE_INVALID: %',v_result; end if;
end;
$$;

do $$
declare v_before text := pg_temp.fixture_state();
begin
  begin
    perform pg_temp.single_import(
      'b1000000-0000-4000-8000-000000000020',null,'invalid-currency.csv',
      'generic','BTC'
    );
    raise exception 'TEST_INVALID_CURRENCY_ACCEPTED';
  exception when others then
    if sqlerrm='TEST_INVALID_CURRENCY_ACCEPTED'
      or sqlerrm not like '%INVALID_TRADE_CURRENCY%'
    then raise; end if;
  end;
  if pg_temp.fixture_state() is distinct from v_before
  then raise exception 'TEST_INVALID_CURRENCY_LEFT_EFFECTS'; end if;
end;
$$;

do $$
declare v_before text := pg_temp.fixture_state();
begin
  begin
    perform pg_temp.single_import(
      'b1000000-0000-4000-8000-000000000021',null,'missing-id.csv',
      'ctrader-history','USD','[]'::jsonb
    );
    raise exception 'TEST_REQUIRED_PROVIDER_ID_ACCEPTED';
  exception when others then
    if sqlerrm='TEST_REQUIRED_PROVIDER_ID_ACCEPTED'
      or sqlerrm not like '%REQUIRED_PROVIDER_IDENTITY_MISSING%'
    then raise; end if;
  end;
  if pg_temp.fixture_state() is distinct from v_before
  then raise exception 'TEST_REQUIRED_PROVIDER_ID_LEFT_EFFECTS'; end if;
end;
$$;

do $$
declare v_before text := pg_temp.fixture_state();
begin
  begin
    perform pg_temp.single_import(
      'b1000000-0000-4000-8000-000000000022',null,'forbidden-id.csv',
      'generic','USD',
      '[{"kind":"provider_identity_v1","identityKind":"deal_id","identityValue":"42"}]'::jsonb
    );
    raise exception 'TEST_FORBIDDEN_PROVIDER_ID_ACCEPTED';
  exception when others then
    if sqlerrm='TEST_FORBIDDEN_PROVIDER_ID_ACCEPTED'
      or sqlerrm not like '%PROVIDER_IDENTITY_NOT_ALLOWED%'
    then raise; end if;
  end;
  if pg_temp.fixture_state() is distinct from v_before
  then raise exception 'TEST_FORBIDDEN_PROVIDER_ID_LEFT_EFFECTS'; end if;
end;
$$;

do $$
declare v_before text := pg_temp.fixture_state();
begin
  begin
    perform pg_temp.single_import(
      'b1000000-0000-4000-8000-000000000023',null,'manifest.csv',
      'generic','USD','[]'::jsonb,2,3
    );
    raise exception 'TEST_SOURCE_MANIFEST_MISMATCH_ACCEPTED';
  exception when others then
    if sqlerrm='TEST_SOURCE_MANIFEST_MISMATCH_ACCEPTED'
      or sqlerrm not like '%SOURCE_MANIFEST_MISMATCH%'
    then raise; end if;
  end;
  if pg_temp.fixture_state() is distinct from v_before
  then raise exception 'TEST_SOURCE_MANIFEST_MISMATCH_LEFT_EFFECTS'; end if;
end;
$$;

do $$
declare v_before text := pg_temp.fixture_state();
begin
  begin
    perform pg_temp.single_import(
      'b1000000-0000-4000-8000-000000000024',null,'malformed.csv',
      'generic','USD','[]'::jsonb,2,2,'importable','not-a-date'
    );
    raise exception 'TEST_MALFORMED_TRADE_ACCEPTED';
  exception when others then
    if sqlerrm='TEST_MALFORMED_TRADE_ACCEPTED'
      or sqlstate <> '22007'
    then raise; end if;
  end;
  if pg_temp.fixture_state() is distinct from v_before
  then raise exception 'TEST_MALFORMED_TRADE_LEFT_EFFECTS'; end if;
end;
$$;

do $$
declare v_before jsonb := pg_temp.fixture_snapshot();
begin
  begin
    perform pg_temp.single_import(
      'b1000000-0000-4000-8000-000000000025',null,'downstream-failure.csv',
      'generic','USD','[]'::jsonb,2,2,'importable',
      '2026-08-30T10:00:00.000Z','not-a-uuid','Rollback Account'
    );
    raise exception 'TEST_DOWNSTREAM_FAILURE_ACCEPTED';
  exception when others then
    if sqlerrm='TEST_DOWNSTREAM_FAILURE_ACCEPTED'
      or sqlstate <> '22P02'
      or sqlerrm not like '%invalid input syntax for type uuid%'
    then raise; end if;
  end;
  if pg_temp.fixture_snapshot() is distinct from v_before
  then raise exception 'TEST_POST_RESERVATION_ROLLBACK_FAILED'; end if;
end;
$$;

insert into fixture_results values ('replay',pg_temp.primary_import('primary.csv'));
do $$
declare
  v_initial jsonb := (select result from fixture_results where name='initial');
  v_replay jsonb := (select result from fixture_results where name='replay');
begin
  if v_replay->>'alreadyApplied' <> 'true'
    or v_replay->>'importedCount' <> '1'
    or v_replay->'importedIds' is distinct from v_initial->'importedIds'
    or pg_temp.fixture_state() <> '1|1|1|1'
  then raise exception 'TEST_EXACT_REPLAY_INVALID: %',v_replay; end if;
end;
$$;

do $$
declare v_before text := pg_temp.fixture_state();
begin
  begin
    perform pg_temp.primary_import('changed.csv');
    raise exception 'TEST_CHANGED_REPLAY_ACCEPTED';
  exception when others then
    if sqlerrm='TEST_CHANGED_REPLAY_ACCEPTED'
      or sqlerrm not like '%BATCH_REPLAY_MISMATCH%'
    then raise; end if;
  end;
  if pg_temp.fixture_state() is distinct from v_before
  then raise exception 'TEST_CHANGED_REPLAY_LEFT_EFFECTS'; end if;
end;
$$;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true
);
do $$
begin
  if (select count(*) from public.journal_import_accounts) <> 1
    or (select count(*) from public.trade_import_source_keys) <> 1
    or (select count(*) from public.trade_import_batches) <> 1
    or (select count(*) from public.trades) <> 1
  then raise exception 'TEST_OWNER_RLS_READ_INVALID'; end if;

  begin
    perform public.equora_import_trades_v1(
      gen_random_uuid(),'{}'::jsonb,'[]'::jsonb
    );
    raise exception 'TEST_LEGACY_IMPORT_EXECUTE_OPEN';
  exception when insufficient_privilege then null; end;
  begin
    perform public.equora_upsert_import_account_v1(
      null,'generic','Bypass Account','EUR'
    );
    raise exception 'TEST_ACCOUNT_UPSERT_EXECUTE_OPEN';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.trade_import_batches(id,user_id)
    values (gen_random_uuid(),'b1000000-0000-4000-8000-000000000001');
    raise exception 'TEST_DIRECT_BATCH_WRITE_OPEN';
  exception when insufficient_privilege then null; end;
end;
$$;
select set_config(
  'request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true
);
do $$
begin
  if (select count(*) from public.journal_import_accounts) <> 0
    or (select count(*) from public.trade_import_source_keys) <> 0
    or (select count(*) from public.trade_import_batches) <> 0
    or (select count(*) from public.trades) <> 0
  then raise exception 'TEST_CROSS_TENANT_RLS_READ_OPEN'; end if;
end;
$$;
reset role;

select set_config(
  'request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true
);

do $$
declare
  v_account_id uuid := (
    select import_account_id from public.trade_import_batches
    where id='b1000000-0000-4000-8000-000000000010'
  );
  v_result jsonb;
begin
  v_result := pg_temp.single_import(
    'b1000000-0000-4000-8000-000000000030',v_account_id,
    'duplicate.csv','generic','USD'
  );
  if v_result->>'importedCount' <> '0'
    or v_result->>'duplicateCount' <> '1'
    or jsonb_array_length(v_result->'importedIds') <> 0
    or pg_temp.fixture_state() <> '1|2|1|1'
  then raise exception 'TEST_DUPLICATE_IMPORT_INVALID: %',v_result; end if;
end;
$$;

select set_config(
  'request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true
);
do $$
declare
  v_before text := pg_temp.fixture_state();
  v_account_id uuid := (
    select import_account_id from public.trade_import_batches
    where id='b1000000-0000-4000-8000-000000000010'
  );
begin
  begin
    perform pg_temp.primary_import('primary.csv');
    raise exception 'TEST_CROSS_USER_BATCH_REPLAY_ACCEPTED';
  exception when others then
    if sqlerrm='TEST_CROSS_USER_BATCH_REPLAY_ACCEPTED'
      or sqlerrm not like '%NOT_FOUND_OR_FORBIDDEN%'
    then raise; end if;
  end;
  begin
    perform pg_temp.single_import(
      'b2000000-0000-4000-8000-000000000040',v_account_id,
      'cross-account.csv','generic','USD'
    );
    raise exception 'TEST_CROSS_USER_ACCOUNT_ACCEPTED';
  exception when others then
    if sqlerrm='TEST_CROSS_USER_ACCOUNT_ACCEPTED'
      or sqlerrm not like '%NOT_FOUND_OR_FORBIDDEN%'
    then raise; end if;
  end;
  if pg_temp.fixture_state() is distinct from v_before
  then raise exception 'TEST_CROSS_USER_IMPORT_LEFT_EFFECTS'; end if;
end;
$$;
do $$
begin
  begin
    perform public.equora_revert_import_v1(
      'b1000000-0000-4000-8000-000000000010'
    );
    raise exception 'TEST_CROSS_USER_REVERT_ACCEPTED';
  exception when others then
    if sqlerrm='TEST_CROSS_USER_REVERT_ACCEPTED'
      or sqlerrm not like '%NOT_FOUND_OR_FORBIDDEN%'
    then raise; end if;
  end;
end;
$$;

select set_config(
  'request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true
);
insert into public.trade_media(
  id,trade_id,user_id,storage_path,public_url,file_name,mime_type,byte_size
)
select
  'b1000000-0000-4000-8000-000000000060',trade_row.id,trade_row.user_id,
  'b1000000-0000-4000-8000-000000000001/trades/revert-proof.png','',
  'revert-proof.png','image/png',128
from public.trades trade_row
where trade_row.import_batch_id='b1000000-0000-4000-8000-000000000010';
insert into fixture_results values (
  'revert',
  public.equora_revert_import_v1('b1000000-0000-4000-8000-000000000010')
);
insert into fixture_results values (
  'revert-replay',
  public.equora_revert_import_v1('b1000000-0000-4000-8000-000000000010')
);

do $$
declare
  v_account_id uuid := (
    select import_account_id from public.trade_import_batches
    where id='b1000000-0000-4000-8000-000000000010'
  );
  v_revert jsonb := (select result from fixture_results where name='revert');
  v_revert_replay jsonb := (
    select result from fixture_results where name='revert-replay'
  );
  v_reimport jsonb;
begin
  if v_revert->>'reverted' <> 'true'
    or v_revert->>'deletedCount' <> '1'
    or v_revert->'storagePaths' <> jsonb_build_array(
      'b1000000-0000-4000-8000-000000000001/trades/revert-proof.png'
    )
    or v_revert_replay->>'alreadyReverted' <> 'true'
    or not exists (
      select 1 from public.media_cleanup_outbox
      where user_id='b1000000-0000-4000-8000-000000000001'
        and bucket='equora-media'
        and storage_path=
          'b1000000-0000-4000-8000-000000000001/trades/revert-proof.png'
        and completed_at is null
    )
    or not exists (
      select 1 from public.trade_import_source_keys
      where batch_id='b1000000-0000-4000-8000-000000000010'
        and status='reverted' and trade_id is null and reverted_at is not null
    )
    or not exists (
      select 1 from public.trade_import_batches
      where id='b1000000-0000-4000-8000-000000000010'
        and status='reverted' and reverted_at is not null
    )
  then raise exception 'TEST_REVERT_STATE_INVALID: %, %',v_revert,v_revert_replay; end if;

  v_reimport := pg_temp.single_import(
    'b1000000-0000-4000-8000-000000000031',v_account_id,
    'reimport.csv','generic','USD'
  );
  if v_reimport->>'importedCount' <> '1'
    or v_reimport->>'duplicateCount' <> '0'
    or pg_temp.fixture_state() <> '1|3|1|2'
    or (select count(*) from public.trade_import_source_keys where status='active') <> 1
    or exists (
      select 1 from public.trade_import_source_keys
      where status='active' and trade_id is null
    )
  then raise exception 'TEST_REIMPORT_AFTER_TOMBSTONE_INVALID: %',v_reimport; end if;
end;
$$;

do $$
declare
  v_same_identity jsonb := '[{"kind":"provider_identity_v1","identityKind":"deal_id","identityValue":"abc-42"}]'::jsonb;
  v_first jsonb;
  v_same_changed_trade jsonb;
  v_other_identity jsonb;
  v_other_account jsonb;
begin
  v_first := pg_temp.single_import(
    'b1000000-0000-4000-8000-000000000070',null,'ctrader-first.csv',
    'ctrader-history','USD',
    '[{"kind":"provider_identity_v1","identityKind":" DEAL_ID ","identityValue":" AbC-42 "}]'::jsonb
  );
  v_same_changed_trade := pg_temp.single_import(
    'b1000000-0000-4000-8000-000000000071',null,'ctrader-same-id.csv',
    'ctrader-history','USD',v_same_identity,2,2,'importable',
    '2026-08-30T11:00:00.000Z'
  );
  v_other_identity := pg_temp.single_import(
    'b1000000-0000-4000-8000-000000000072',null,'ctrader-other-id.csv',
    'ctrader-history','USD',
    '[{"kind":"provider_identity_v1","identityKind":"deal_id","identityValue":"abc-43"}]'::jsonb
  );
  v_other_account := pg_temp.single_import(
    'b1000000-0000-4000-8000-000000000073',null,'ctrader-other-account.csv',
    'ctrader-history','USD',v_same_identity,2,2,'importable',
    '2026-08-30T10:00:00.000Z',null,'Secondary Account'
  );

  if v_first->>'importedCount' <> '1'
    or v_same_changed_trade->>'duplicateCount' <> '1'
    or v_same_changed_trade->>'importedCount' <> '0'
    or v_other_identity->>'importedCount' <> '1'
    or v_other_account->>'importedCount' <> '1'
    or (
      select count(*) from public.trade_import_source_keys
      where user_id='b1000000-0000-4000-8000-000000000001'
        and preset_key='ctrader-history'
        and source_kind='provider_identity_v1'
        and source_digest=encode(pg_catalog.sha256(convert_to(
          jsonb_build_array(
            'equora-provider-source-v1','deal_id','abc-42'
          )::text,'UTF8'
        )),'hex')
    ) <> 2
    or (
      select count(distinct import_account_id)
      from public.trade_import_source_keys
      where user_id='b1000000-0000-4000-8000-000000000001'
        and preset_key='ctrader-history'
    ) <> 2
  then raise exception 'TEST_CTRADER_PROVIDER_IDENTITY_INVALID: %, %, %, %',
    v_first,v_same_changed_trade,v_other_identity,v_other_account;
  end if;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true
);
do $$
declare
  v_import jsonb;
  v_revert jsonb;
begin
  v_import := public.equora_import_trades_v2(
    'b2000000-0000-4000-8000-000000000080',null,
    '{"file_name":"authenticated.csv","preset_key":"ctrader-history","preset_label":"cTrader Account History","account_label":"Primary Account","account_currency":"USD"}'::jsonb,
    '[{"row_number":2,"preview_status":"importable","selected":true}]'::jsonb,
    '[{"row_number":2,"trade":{"created_at":"2026-08-30T10:00:00.000Z","market":"BTCUSDT","setup":"Authenticated import","bias":"long","net_pnl":"12.50","position_size":"0.0100","account_currency":"USD","broker_profile":"ctrader","account_template":"spot"},"tags":["CSV Import"],"source_keys":[{"kind":"provider_identity_v1","identityKind":"deal_id","identityValue":"abc-42"}]}]'::jsonb
  );
  if v_import->>'importedCount' <> '1'
    or v_import->>'alreadyApplied' <> 'false'
  then raise exception 'TEST_AUTHENTICATED_IMPORT_FAILED: %',v_import; end if;

  v_revert := public.equora_revert_import_v1(
    'b2000000-0000-4000-8000-000000000080'
  );
  if v_revert->>'reverted' <> 'true'
    or v_revert->>'deletedCount' <> '1'
  then raise exception 'TEST_AUTHENTICATED_REVERT_FAILED: %',v_revert; end if;
end;
$$;
reset role;

do $$
begin
  if not exists (
      select 1 from public.trade_import_batches
      where id='b2000000-0000-4000-8000-000000000080'
        and user_id='b2000000-0000-4000-8000-000000000002'
        and status='reverted'
    ) or not exists (
      select 1 from public.trade_import_source_keys
      where batch_id='b2000000-0000-4000-8000-000000000080'
        and user_id='b2000000-0000-4000-8000-000000000002'
        and source_kind='provider_identity_v1'
        and source_digest=encode(pg_catalog.sha256(convert_to(
          jsonb_build_array(
            'equora-provider-source-v1','deal_id','abc-42'
          )::text,'UTF8'
        )),'hex')
        and status='reverted' and trade_id is null
    ) or exists (
      select 1 from public.trades
      where import_batch_id='b2000000-0000-4000-8000-000000000080'
    )
  then raise exception 'TEST_AUTHENTICATED_PERSISTENCE_INVALID'; end if;
end;
$$;

insert into fixture_results values (
  'pre-disable-snapshot',pg_temp.fixture_snapshot()
);
update public.equora_runtime_capability_gates
set enabled=false,activated_at=null,updated_at=clock_timestamp()
where capability_key='journal_file_import_persistence_v2'
  and contract_version='equora-broker-file-import-capability-v1';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub','b2000000-0000-4000-8000-000000000002',true
);
do $$
begin
  begin
    perform public.equora_import_trades_v2(
      'b2000000-0000-4000-8000-000000000081',null,
      '{"file_name":"disabled-again.csv","preset_key":"generic","preset_label":"Generic CSV","account_label":"Primary Account","account_currency":"EUR"}'::jsonb,
      '[{"row_number":2,"preview_status":"importable","selected":true}]'::jsonb,
      '[{"row_number":2,"trade":{"created_at":"2026-08-30T11:00:00.000Z","market":"ETHUSDT","setup":"Disabled import probe","bias":"long","net_pnl":"1.00","position_size":"0.0100","account_currency":"EUR","broker_profile":"generic","account_template":"spot"},"tags":["CSV Import"],"source_keys":[]}]'::jsonb
    );
    raise exception 'TEST_REVOKED_ACTIVATION_IMPORT_ACCEPTED';
  exception when others then
    if sqlerrm <> 'IMPORT_PERSISTENCE_DISABLED' then raise; end if;
  end;
end;
$$;
reset role;

do $$
begin
  if pg_temp.fixture_snapshot() is distinct from (
      select result from fixture_results where name='pre-disable-snapshot'
    ) or exists (
      select 1 from public.trade_import_batches
      where id='b2000000-0000-4000-8000-000000000081'
    ) or not exists (
      select 1 from public.equora_runtime_capability_gates gate
      where gate.capability_key='journal_file_import_persistence_v2'
        and gate.contract_version='equora-broker-file-import-capability-v1'
        and not gate.enabled and gate.activated_at is null
    )
  then raise exception 'TEST_REVOKED_ACTIVATION_STATE_INVALID'; end if;
end;
$$;

rollback;
\echo 'Trade-import integration fixture PASS'
