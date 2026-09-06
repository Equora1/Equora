-- Read-only semantic verifier for the v57.62.0 file-import persistence layer.
-- This file intentionally contains no transaction boundary so preflight,
-- postflight and activation scripts can bind it to their own transaction.

do $equora_v5762_verify$
declare
  v_migration_id constant text :=
    'equora_v57.62.0_trade_import_persistence_v1';
  v_contract_fingerprint constant text :=
    '014731e263ec2f0ffc9b0e16962b5d5574516a0c975a1713580740fa3bc6413d';
begin
  if current_user <> 'postgres' then
    raise exception 'TRADE_IMPORT_VERIFY_EXECUTOR_INVALID';
  end if;

  if not exists (
    select 1
    from equora_private.schema_migrations
    where migration_id = v_migration_id
      and contract_fingerprint = v_contract_fingerprint
  ) then
    raise exception 'TRADE_IMPORT_VERIFY_MIGRATION_RECEIPT_INVALID';
  end if;

  if (
    select count(*)
    from (values
      ('equora_v57.61.0_broker_capture_v1',
        '492ebad5496806ad60425abd58e9801c58a58b421e38392d54e6082d7fa2b083'),
      ('equora_v57.61.0_g1_capture_control_v1',
        'c133d5e0c987e7f927963db4465ef5ab2f6f4c174cfdc96a3ed1cffb5cd62be5'),
      ('equora_v57.61.0_g1_lane_authority_v1',
        '6be313155e81e0f14c48d0c71301e28a75b792a90e49542bc49ffe638f56c68d'),
      ('equora_v57.61.0_g1_activation_authority_v1',
        'b074a756a015b34a7e3da804f3d3955100a40f9a6391855a75c1e415cbbb2abb'),
      ('equora_v57.61.0_g1_scheduler_control_v2',
        '87158546782b900817d3f36501a2e43b5619906a2f07636d0cb1167b042e5ab7'),
      ('equora_v57.61.0_g1_runtime_deployment_v1',
        '892f1587e8e37937a538dad1239ec931d43bd1f65d2f224d56ab7b9356f89e96'),
      ('equora_v57.61.0_broker_provider_rls_v1',
        'd72047ce5e28e1400869a9abdcdad650a4f1b3b11e1e1b7cb07a9b37157eca47')
    ) expected(migration_id, contract_fingerprint)
    join equora_private.schema_migrations actual
      using (migration_id, contract_fingerprint)
  ) <> 7 then
    raise exception 'TRADE_IMPORT_VERIFY_V5761_BASE_INVALID';
  end if;
  if (
    select count(*)
    from equora_private.schema_migrations
    where migration_id like 'equora_v57.61.0%'
  ) <> 7 then
    raise exception 'TRADE_IMPORT_VERIFY_V5761_BASE_INVALID';
  end if;

  if (
    select count(*)
    from pg_class relation_row
    join pg_namespace namespace_row
      on namespace_row.oid = relation_row.relnamespace
    join pg_roles owner_row on owner_row.oid = relation_row.relowner
    where namespace_row.nspname = 'public'
      and relation_row.relname in (
        'equora_runtime_capability_gates',
        'journal_import_accounts',
        'trade_import_source_keys'
      )
      and relation_row.relkind = 'r'
      and relation_row.relrowsecurity
      and not relation_row.relforcerowsecurity
      and owner_row.rolname = 'postgres'
  ) <> 3 then
    raise exception 'TRADE_IMPORT_VERIFY_RELATION_SECURITY_INVALID';
  end if;

  if (
    select count(*)
    from (values
      ('trades', 'import_account_id', 'uuid'),
      ('trade_import_batches', 'import_account_id', 'uuid'),
      ('trade_import_batches', 'request_digest', 'text'),
      ('trade_import_batches', 'source_manifest', 'jsonb'),
      ('trade_import_batches', 'source_manifest_digest', 'text'),
      ('trade_import_batches', 'source_row_count', 'integer'),
      ('trade_import_batches', 'invalid_count', 'integer')
    ) expected(table_name, column_name, data_type)
    join information_schema.columns actual
      on actual.table_schema = 'public'
      and actual.table_name = expected.table_name
      and actual.column_name = expected.column_name
      and actual.data_type = expected.data_type
      and actual.is_nullable = 'YES'
  ) <> 7 then
    raise exception 'TRADE_IMPORT_VERIFY_ADDITIVE_COLUMNS_INVALID';
  end if;

  if (
    select count(*)
    from (values
      ('journal_import_accounts', 'journal_import_accounts_pkey', 'p'),
      ('journal_import_accounts', 'journal_import_accounts_user_id_id_key', 'u'),
      ('journal_import_accounts', 'journal_import_accounts_namespace_key', 'u'),
      ('trades', 'trades_import_account_owner_fkey', 'f'),
      ('trade_import_batches', 'trade_import_batches_import_account_owner_fkey', 'f'),
      ('trade_import_source_keys', 'trade_import_source_keys_pkey', 'p'),
      ('trade_import_source_keys', 'trade_import_source_keys_account_owner_fkey', 'f'),
      ('trade_import_source_keys', 'trade_import_source_keys_batch_owner_fkey', 'f'),
      ('trade_import_source_keys', 'trade_import_source_keys_trade_owner_fkey', 'f')
    ) expected(table_name, constraint_name, constraint_type)
    join pg_constraint actual
      on actual.conrelid = format('public.%I', expected.table_name)::regclass
      and actual.conname = expected.constraint_name
      and actual.contype::text = expected.constraint_type
      and actual.convalidated
  ) <> 9 then
    raise exception 'TRADE_IMPORT_VERIFY_CONSTRAINTS_INVALID';
  end if;

  if (
    select count(*)
    from (values
      ('trade_import_source_keys_active_identity_key'),
      ('journal_import_accounts_user_created_idx'),
      ('trades_import_account_idx'),
      ('trade_import_batches_import_account_idx'),
      ('trade_import_source_keys_account_created_idx'),
      ('trade_import_source_keys_batch_idx'),
      ('trade_import_source_keys_trade_idx')
    ) expected(index_name)
    join pg_class index_relation
      on index_relation.oid = format('public.%I', expected.index_name)::regclass
    join pg_index index_row on index_row.indexrelid = index_relation.oid
    where index_row.indisvalid and index_row.indisready
  ) <> 7 then
    raise exception 'TRADE_IMPORT_VERIFY_INDEXES_INVALID';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and (
        (
          tablename = 'journal_import_accounts'
          and policyname = 'users can read own journal import accounts'
        ) or (
          tablename = 'trade_import_source_keys'
          and policyname = 'users can read own trade import source keys'
        )
      )
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
      and qual like '%auth.uid()%user_id%'
  ) <> 2 or exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'equora_runtime_capability_gates',
        'journal_import_accounts',
        'trade_import_source_keys'
      )
      and policyname not in (
        'users can read own journal import accounts',
        'users can read own trade import source keys'
      )
  ) then
    raise exception 'TRADE_IMPORT_VERIFY_RLS_POLICIES_INVALID';
  end if;

  if has_table_privilege(
      'anon', 'public.journal_import_accounts', 'select'
    ) or not has_table_privilege(
      'authenticated', 'public.journal_import_accounts', 'select'
    ) or has_table_privilege(
      'authenticated', 'public.journal_import_accounts', 'insert'
    ) or has_table_privilege(
      'service_role', 'public.journal_import_accounts', 'select'
    ) or has_table_privilege(
      'anon', 'public.trade_import_source_keys', 'select'
    ) or not has_table_privilege(
      'authenticated', 'public.trade_import_source_keys', 'select'
    ) or has_table_privilege(
      'authenticated', 'public.trade_import_source_keys', 'insert'
    ) or has_table_privilege(
      'service_role', 'public.trade_import_source_keys', 'select'
    ) or has_table_privilege(
      'anon', 'public.equora_runtime_capability_gates', 'select'
    ) or has_table_privilege(
      'authenticated', 'public.equora_runtime_capability_gates', 'select'
    ) or has_table_privilege(
      'service_role', 'public.equora_runtime_capability_gates', 'select'
    ) then
    raise exception 'TRADE_IMPORT_VERIFY_TABLE_PRIVILEGES_INVALID';
  end if;

  if (
    select count(*)
    from (values
      ('public.equora_upsert_import_account_v1(uuid,text,text,text)'),
      ('public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)'),
      ('public.equora_revert_import_v1(uuid)')
    ) expected(signature)
    join pg_proc procedure_row
      on procedure_row.oid = expected.signature::regprocedure
    join pg_namespace namespace_row
      on namespace_row.oid = procedure_row.pronamespace
    join pg_roles owner_row on owner_row.oid = procedure_row.proowner
    join pg_language language_row on language_row.oid = procedure_row.prolang
    where namespace_row.nspname = 'public'
      and owner_row.rolname = 'postgres'
      and language_row.lanname = 'plpgsql'
      and procedure_row.prosecdef
      and procedure_row.prorettype = 'jsonb'::regtype
      and case expected.signature
        when 'public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)'
        then procedure_row.proconfig @> array[
          'search_path=""', 'lock_timeout=3s', 'TimeZone=UTC'
        ]::text[]
          and procedure_row.proconfig <@ array[
            'search_path=""', 'lock_timeout=3s', 'TimeZone=UTC'
          ]::text[]
        else procedure_row.proconfig @> array['search_path=""']::text[]
          and procedure_row.proconfig <@ array['search_path=""']::text[]
      end
  ) <> 3 then
    raise exception 'TRADE_IMPORT_VERIFY_FUNCTION_SECURITY_INVALID';
  end if;

  if position(
      'IMPORT_PERSISTENCE_DISABLED' in (
        select prosrc from pg_proc
        where oid =
          'public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure
      )
    ) = 0 or position(
      'journal_file_import_persistence_v2' in (
        select prosrc from pg_proc
        where oid =
          'public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure
      )
    ) = 0 then
    raise exception 'TRADE_IMPORT_VERIFY_DATABASE_GATE_GUARD_MISSING';
  end if;

  if has_function_privilege(
      'anon',
      'public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)',
      'execute'
    ) or not has_function_privilege(
      'authenticated',
      'public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)',
      'execute'
    ) or has_function_privilege(
      'service_role',
      'public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)',
      'execute'
    ) or has_function_privilege(
      'authenticated',
      'public.equora_upsert_import_account_v1(uuid,text,text,text)',
      'execute'
    ) or has_function_privilege(
      'authenticated',
      'public.equora_import_trades_v1(uuid,jsonb,jsonb)',
      'execute'
    ) or not has_function_privilege(
      'authenticated',
      'public.equora_revert_import_v1(uuid)',
      'execute'
    ) then
    raise exception 'TRADE_IMPORT_VERIFY_FUNCTION_PRIVILEGES_INVALID';
  end if;

  if (
    select count(*)
    from public.equora_runtime_capability_gates
    where capability_key = 'journal_file_import_persistence_v2'
      and contract_version = 'equora-broker-file-import-capability-v1'
      and (
        (enabled and activated_at is not null)
        or (not enabled and activated_at is null)
      )
  ) <> 1 then
    raise exception 'TRADE_IMPORT_VERIFY_ACTIVATION_STATE_INVALID';
  end if;
end;
$equora_v5762_verify$;

do $equora_v5762_verify_strict$
declare
  v_previous_search_path text := pg_catalog.current_setting('search_path');
begin
  -- Deterministic deparsing and built-in resolution, scoped to this transaction.
  perform pg_catalog.set_config('search_path','pg_catalog',true);
  -- Column privileges do not appear in relation ACLs.
  if exists (
    select 1 from pg_catalog.pg_attribute attribute_row
    join pg_catalog.pg_class relation_row on relation_row.oid=attribute_row.attrelid
    cross join lateral aclexplode(attribute_row.attacl) acl_row
    where relation_row.oid in (
      'public.equora_runtime_capability_gates'::regclass,
      'public.journal_import_accounts'::regclass,
      'public.trade_import_source_keys'::regclass
    ) and acl_row.grantee <> relation_row.relowner
  ) then raise exception 'TRADE_IMPORT_VERIFY_COLUMN_ACL_INVALID'; end if;
  if exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.equora_runtime_capability_gates'::regclass
  ) or exists (
    select 1 from pg_catalog.pg_rewrite
    where ev_class = 'public.equora_runtime_capability_gates'::regclass
  ) or exists (
    select 1 from pg_catalog.pg_inherits
    where inhparent='public.equora_runtime_capability_gates'::regclass
      or inhrelid='public.equora_runtime_capability_gates'::regclass
  ) then raise exception 'TRADE_IMPORT_VERIFY_GATE_EFFECTS_INVALID'; end if;
  -- Bind every column of the three new relations, not merely their names.
  if (
    select count(*)
    from (values
      ('equora_runtime_capability_gates','capability_key','text','NO'),
      ('equora_runtime_capability_gates','contract_version','text','NO'),
      ('equora_runtime_capability_gates','enabled','boolean','NO'),
      ('equora_runtime_capability_gates','activated_at','timestamp with time zone','YES'),
      ('equora_runtime_capability_gates','updated_at','timestamp with time zone','NO'),
      ('journal_import_accounts','id','uuid','NO'),
      ('journal_import_accounts','user_id','uuid','NO'),
      ('journal_import_accounts','preset_key','text','NO'),
      ('journal_import_accounts','display_label','text','NO'),
      ('journal_import_accounts','normalized_label','text','NO'),
      ('journal_import_accounts','account_currency','text','NO'),
      ('journal_import_accounts','created_at','timestamp with time zone','NO'),
      ('journal_import_accounts','updated_at','timestamp with time zone','NO'),
      ('trade_import_source_keys','id','uuid','NO'),
      ('trade_import_source_keys','user_id','uuid','NO'),
      ('trade_import_source_keys','import_account_id','uuid','NO'),
      ('trade_import_source_keys','preset_key','text','NO'),
      ('trade_import_source_keys','source_kind','text','NO'),
      ('trade_import_source_keys','source_digest','text','NO'),
      ('trade_import_source_keys','trade_snapshot','jsonb','NO'),
      ('trade_import_source_keys','snapshot_digest','text','NO'),
      ('trade_import_source_keys','batch_id','uuid','NO'),
      ('trade_import_source_keys','trade_id','uuid','YES'),
      ('trade_import_source_keys','status','text','NO'),
      ('trade_import_source_keys','created_at','timestamp with time zone','NO'),
      ('trade_import_source_keys','reverted_at','timestamp with time zone','YES')
    ) expected(table_name,column_name,data_type,is_nullable)
    join information_schema.columns actual
      on actual.table_schema = 'public'
      and actual.table_name = expected.table_name
      and actual.column_name = expected.column_name
      and actual.data_type = expected.data_type
      and actual.is_nullable = expected.is_nullable
  ) <> 26 or (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'equora_runtime_capability_gates',
        'journal_import_accounts',
        'trade_import_source_keys'
      )
  ) <> 26 then
    raise exception 'TRADE_IMPORT_VERIFY_COLUMN_SHAPE_INVALID';
  end if;

  if (
    select count(*)
    from (values
      ('equora_runtime_capability_gates','enabled','false'),
      ('equora_runtime_capability_gates','updated_at','now()'),
      ('journal_import_accounts','id','gen_random_uuid()'),
      ('journal_import_accounts','created_at','now()'),
      ('journal_import_accounts','updated_at','now()'),
      ('trade_import_source_keys','id','gen_random_uuid()'),
      ('trade_import_source_keys','status','''active''::text'),
      ('trade_import_source_keys','created_at','now()')
    ) expected(table_name,column_name,default_expression)
    join pg_catalog.pg_class relation_row
      on relation_row.oid = format('public.%I',expected.table_name)::regclass
    join pg_catalog.pg_attribute attribute_row
      on attribute_row.attrelid = relation_row.oid
      and attribute_row.attname = expected.column_name
    join pg_catalog.pg_attrdef default_row
      on default_row.adrelid = relation_row.oid
      and default_row.adnum = attribute_row.attnum
      and lower(regexp_replace(
        pg_get_expr(default_row.adbin,default_row.adrelid),
        '[[:space:]]+','','g'
      )) = expected.default_expression
  ) <> 8 then
    raise exception 'TRADE_IMPORT_VERIFY_COLUMN_DEFAULT_INVALID';
  end if;

  -- Bind key columns, referenced relations/columns and delete semantics.
  if (
    select count(*)
    from (values
      ('equora_runtime_capability_gates','equora_runtime_capability_gates_pkey','p',
        array['capability_key','contract_version']::text[],null::text,
        array[]::text[],null::text),
      ('journal_import_accounts','journal_import_accounts_pkey','p',
        array['id']::text[],null,array[]::text[],null),
      ('journal_import_accounts','journal_import_accounts_user_id_fkey','f',
        array['user_id']::text[],'auth.users',array['id']::text[],'c'),
      ('journal_import_accounts','journal_import_accounts_user_id_id_key','u',
        array['user_id','id']::text[],null,array[]::text[],null),
      ('journal_import_accounts','journal_import_accounts_namespace_key','u',
        array['user_id','preset_key','normalized_label']::text[],
        null,array[]::text[],null),
      ('trades','trades_user_id_id_key','u',
        array['user_id','id']::text[],null,array[]::text[],null),
      ('trades','trades_import_account_owner_fkey','f',
        array['user_id','import_account_id']::text[],
        'public.journal_import_accounts',array['user_id','id']::text[],'r'),
      ('trade_import_batches','trade_import_batches_user_id_id_key','u',
        array['user_id','id']::text[],null,array[]::text[],null),
      ('trade_import_batches','trade_import_batches_import_account_owner_fkey','f',
        array['user_id','import_account_id']::text[],
        'public.journal_import_accounts',array['user_id','id']::text[],'r'),
      ('trade_import_source_keys','trade_import_source_keys_pkey','p',
        array['id']::text[],null,array[]::text[],null),
      ('trade_import_source_keys','trade_import_source_keys_user_id_fkey','f',
        array['user_id']::text[],'auth.users',array['id']::text[],'c'),
      ('trade_import_source_keys','trade_import_source_keys_account_owner_fkey','f',
        array['user_id','import_account_id']::text[],
        'public.journal_import_accounts',array['user_id','id']::text[],'r'),
      ('trade_import_source_keys','trade_import_source_keys_batch_owner_fkey','f',
        array['user_id','batch_id']::text[],
        'public.trade_import_batches',array['user_id','id']::text[],'c'),
      ('trade_import_source_keys','trade_import_source_keys_trade_owner_fkey','f',
        array['user_id','trade_id']::text[],
        'public.trades',array['user_id','id']::text[],'n')
    ) expected(
      table_name,constraint_name,constraint_type,local_columns,
      foreign_table,foreign_columns,delete_action
    )
    join pg_catalog.pg_constraint actual
      on actual.conrelid = format('public.%I',expected.table_name)::regclass
      and actual.conname = expected.constraint_name
      and actual.contype::text = expected.constraint_type
      and actual.convalidated
      and not actual.condeferrable and not actual.condeferred
      and actual.confrelid = coalesce(
        to_regclass(expected.foreign_table)::oid,0::oid
      )
      and (
        expected.foreign_table is null
        or (actual.confdeltype::text = expected.delete_action
          and actual.confupdtype = 'a' and actual.confmatchtype = 's')
      )
    cross join lateral (
      select coalesce(array_agg(attribute_row.attname::text order by key_row.ordinality),
        array[]::text[]) as columns
      from unnest(coalesce(actual.conkey,array[]::smallint[]))
        with ordinality key_row(attnum,ordinality)
      join pg_catalog.pg_attribute attribute_row
        on attribute_row.attrelid = actual.conrelid
        and attribute_row.attnum = key_row.attnum
    ) local_shape
    cross join lateral (
      select coalesce(array_agg(attribute_row.attname::text order by key_row.ordinality),
        array[]::text[]) as columns
      from unnest(coalesce(actual.confkey,array[]::smallint[]))
        with ordinality key_row(attnum,ordinality)
      join pg_catalog.pg_attribute attribute_row
        on attribute_row.attrelid = actual.confrelid
        and attribute_row.attnum = key_row.attnum
    ) foreign_shape
    where local_shape.columns = expected.local_columns
      and foreign_shape.columns = expected.foreign_columns
  ) <> 14 then
    raise exception 'TRADE_IMPORT_VERIFY_KEY_CONSTRAINT_SHAPE_INVALID';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    cross join lateral (
      select coalesce(array_agg(attribute_row.attname::text order by key_row.ordinality),
        array[]::text[]) as columns
      from unnest(coalesce(
        constraint_row.confdelsetcols,array[]::smallint[]
      )) with ordinality key_row(attnum,ordinality)
      join pg_catalog.pg_attribute attribute_row
        on attribute_row.attrelid = constraint_row.conrelid
        and attribute_row.attnum = key_row.attnum
    ) delete_shape
    where constraint_row.conrelid =
      'public.trade_import_source_keys'::regclass
      and constraint_row.conname =
        'trade_import_source_keys_trade_owner_fkey'
      and delete_shape.columns = array['trade_id']::text[]
  ) then
    raise exception 'TRADE_IMPORT_VERIFY_FK_DELETE_COLUMNS_INVALID';
  end if;

  -- Exact PostgreSQL 17 definitions, captured from the reviewed fresh schema.
  -- Preserve case, literals and grouping; token/whitespace stripping is unsafe.
  if (select count(*) from pg_catalog.pg_constraint
      where contype='c' and conrelid in (
        'public.equora_runtime_capability_gates'::regclass,
        'public.journal_import_accounts'::regclass,
        'public.trade_import_source_keys'::regclass
      )) <> 12 then
    raise exception 'TRADE_IMPORT_VERIFY_CHECK_CONSTRAINT_SET_INVALID';
  end if;
  if (
    select count(distinct actual.oid)
    from (values
      ('equora_runtime_capability_gates','equora_runtime_capability_gates_activation_check',
        $checkdef$CHECK (((enabled AND (activated_at IS NOT NULL)) OR ((NOT enabled) AND (activated_at IS NULL))))$checkdef$),
      ('equora_runtime_capability_gates','equora_runtime_capability_gates_contract_check',
        $checkdef$CHECK (((char_length(contract_version) >= 3) AND (char_length(contract_version) <= 120)))$checkdef$),
      ('equora_runtime_capability_gates','equora_runtime_capability_gates_key_check',
        $checkdef$CHECK (((char_length(capability_key) >= 3) AND (char_length(capability_key) <= 80)))$checkdef$),
      ('journal_import_accounts','journal_import_accounts_currency_check',
        $checkdef$CHECK ((account_currency = ANY (ARRAY['EUR'::text, 'USD'::text, 'GBP'::text, 'USDT'::text, 'USDC'::text])))$checkdef$),
      ('journal_import_accounts','journal_import_accounts_display_label_check',
        $checkdef$CHECK (((char_length(display_label) >= 3) AND (char_length(display_label) <= 60)))$checkdef$),
      ('journal_import_accounts','journal_import_accounts_normalized_label_check',
        $checkdef$CHECK (((char_length(normalized_label) >= 3) AND (char_length(normalized_label) <= 60)))$checkdef$),
      ('journal_import_accounts','journal_import_accounts_preset_key_check',
        $checkdef$CHECK ((preset_key = ANY (ARRAY['generic'::text, 'metatrader4-history'::text, 'ctrader-history'::text, 'mexc-futures'::text, 'mexc-spot'::text, 'binance-futures'::text, 'bybit-futures'::text, 'okx-futures'::text, 'kraken-spot'::text])))$checkdef$),
      ('trade_import_batches','trade_import_batches_v2_state_check',
        $checkdef$CHECK (((import_account_id IS NULL) OR (((request_digest ~ '^[0-9a-f]{64}$'::text) AND (source_manifest_digest ~ '^[0-9a-f]{64}$'::text) AND (jsonb_typeof(source_manifest) = 'array'::text) AND ((source_row_count >= 1) AND (source_row_count <= 5000)) AND (imported_count >= 0) AND (duplicate_count >= 0) AND (skipped_count >= 0) AND (invalid_count >= 0) AND (((status = 'processing'::text) AND (reverted_at IS NULL) AND (imported_count = 0) AND (duplicate_count = 0) AND ((skipped_count + invalid_count) <= source_row_count)) OR ((status = 'active'::text) AND (reverted_at IS NULL) AND ((((imported_count + duplicate_count) + skipped_count) + invalid_count) = source_row_count)) OR ((status = 'reverted'::text) AND (reverted_at IS NOT NULL) AND ((((imported_count + duplicate_count) + skipped_count) + invalid_count) = source_row_count)))) IS TRUE)))$checkdef$),
      ('trade_import_source_keys','trade_import_source_keys_digest_check',
        $checkdef$CHECK ((source_digest ~ '^[0-9a-f]{64}$'::text))$checkdef$),
      ('trade_import_source_keys','trade_import_source_keys_kind_check',
        $checkdef$CHECK ((source_kind = ANY (ARRAY['provider_identity_v1'::text, 'request_row_v1'::text])))$checkdef$),
      ('trade_import_source_keys','trade_import_source_keys_lifecycle_check',
        $checkdef$CHECK ((((status = 'active'::text) AND (reverted_at IS NULL)) OR ((status = 'reverted'::text) AND (reverted_at IS NOT NULL) AND (trade_id IS NULL))))$checkdef$),
      ('trade_import_source_keys','trade_import_source_keys_snapshot_check',
        $checkdef$CHECK ((((jsonb_typeof(trade_snapshot) = 'object'::text) AND ((trade_snapshot ->> 'schemaVersion'::text) = 'equora-trade-import-financial-snapshot-v1'::text) AND (snapshot_digest ~ '^[0-9a-f]{64}$'::text)) IS TRUE))$checkdef$),
      ('trade_import_source_keys','trade_import_source_keys_status_check',
        $checkdef$CHECK ((status = ANY (ARRAY['active'::text, 'reverted'::text])))$checkdef$)
    ) expected(table_name,constraint_name,definition)
    join pg_catalog.pg_constraint actual
      on actual.conrelid = format('public.%I',expected.table_name)::regclass
      and actual.conname = expected.constraint_name
      and actual.contype = 'c'
      and actual.convalidated and actual.conislocal
      and actual.coninhcount = 0 and not actual.connoinherit
      and pg_catalog.pg_get_constraintdef(actual.oid,false) = expected.definition
  ) <> 13 then
    raise exception 'TRADE_IMPORT_VERIFY_CHECK_CONSTRAINT_SHAPE_INVALID';
  end if;

  if (
    select count(*)
    from (values
      ('trade_import_source_keys_active_identity_key','trade_import_source_keys',true,
        array['user_id','import_account_id','preset_key','source_kind','source_digest']::text[],
        array[0,0,0,0,0]::smallint[],'(status = ''active''::text)'),
      ('journal_import_accounts_user_created_idx','journal_import_accounts',false,
        array['user_id','created_at']::text[],array[0,3]::smallint[],''),
      ('trades_import_account_idx','trades',false,
        array['user_id','import_account_id']::text[],array[0,0]::smallint[],''),
      ('trade_import_batches_import_account_idx','trade_import_batches',false,
        array['user_id','import_account_id','created_at']::text[],array[0,0,3]::smallint[],''),
      ('trade_import_source_keys_account_created_idx','trade_import_source_keys',false,
        array['user_id','import_account_id','created_at']::text[],array[0,0,3]::smallint[],''),
      ('trade_import_source_keys_batch_idx','trade_import_source_keys',false,
        array['user_id','batch_id']::text[],array[0,0]::smallint[],''),
      ('trade_import_source_keys_trade_idx','trade_import_source_keys',false,
        array['user_id','trade_id']::text[],array[0,0]::smallint[],'(trade_id IS NOT NULL)')
    ) expected(index_name,table_name,is_unique,key_expressions,key_options,predicate)
    join pg_catalog.pg_class index_relation
      on index_relation.oid = format('public.%I',expected.index_name)::regclass
    join pg_catalog.pg_am access_method
      on access_method.oid = index_relation.relam and access_method.amname = 'btree'
    join pg_catalog.pg_index index_row
      on index_row.indexrelid = index_relation.oid
      and index_row.indrelid = format('public.%I',expected.table_name)::regclass
      and index_row.indisvalid and index_row.indisready
      and index_row.indisunique = expected.is_unique
      and index_row.indnatts = index_row.indnkeyatts
      and index_row.indexprs is null
    cross join lateral (
      select array_agg(pg_catalog.pg_get_indexdef(
        index_row.indexrelid,key_number,true
      ) order by key_number) as expressions
      from generate_series(1,index_row.indnkeyatts) key_number
    ) index_shape
    where index_shape.expressions = expected.key_expressions
      -- Column-only pg_get_indexdef omits DESC/NULLS order. Bind indoption too.
      and array(select unnest(index_row.indoption)) = expected.key_options
      and coalesce(pg_catalog.pg_get_expr(
        index_row.indpred,index_row.indrelid
      ),'') = expected.predicate
  ) <> 7 then
    raise exception 'TRADE_IMPORT_VERIFY_INDEX_SHAPE_INVALID';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_policy policy_row
    join pg_catalog.pg_class relation_row
      on relation_row.oid = policy_row.polrelid
    where relation_row.relnamespace = 'public'::regnamespace
      and (
        (relation_row.relname = 'journal_import_accounts'
          and policy_row.polname =
            'users can read own journal import accounts')
        or (relation_row.relname = 'trade_import_source_keys'
          and policy_row.polname =
            'users can read own trade import source keys')
      )
      and policy_row.polpermissive
      and policy_row.polcmd = 'r'
      and policy_row.polroles = array[
        (select oid from pg_catalog.pg_roles where rolname='authenticated')
      ]::oid[]
      and policy_row.polwithcheck is null
      and regexp_replace(lower(
        pg_get_expr(policy_row.polqual,policy_row.polrelid)
      ),'[[:space:]()]','','g') in (
        'selectauth.uidasuid=user_id',
        'auth.uid=user_id'
      )
  ) <> 2 or (
    select count(*)
    from pg_catalog.pg_policy policy_row
    where policy_row.polrelid in (
      'public.equora_runtime_capability_gates'::regclass,
      'public.journal_import_accounts'::regclass,
      'public.trade_import_source_keys'::regclass
    )
  ) <> 2 then
    raise exception 'TRADE_IMPORT_VERIFY_RLS_POLICY_SHAPE_INVALID';
  end if;

  -- Only authenticated SELECT is allowed outside the owner on readable tables.
  if exists (
    select 1
    from pg_catalog.pg_class relation_row
    cross join lateral aclexplode(coalesce(
      relation_row.relacl,acldefault('r',relation_row.relowner)
    )) acl_row
    left join pg_catalog.pg_roles grantee_row
      on grantee_row.oid = acl_row.grantee
    where relation_row.oid in (
      'public.equora_runtime_capability_gates'::regclass,
      'public.journal_import_accounts'::regclass,
      'public.trade_import_source_keys'::regclass
    )
      and acl_row.grantee <> relation_row.relowner
      and not (
        relation_row.oid in (
          'public.journal_import_accounts'::regclass,
          'public.trade_import_source_keys'::regclass
        )
        and coalesce(grantee_row.rolname, '') = 'authenticated'
        and acl_row.privilege_type = 'SELECT'
        and not acl_row.is_grantable
      )
  ) or (
    select count(*)
    from pg_catalog.pg_class relation_row
    cross join lateral aclexplode(coalesce(
      relation_row.relacl,acldefault('r',relation_row.relowner)
    )) acl_row
    join pg_catalog.pg_roles grantee_row on grantee_row.oid = acl_row.grantee
    where relation_row.oid in (
      'public.journal_import_accounts'::regclass,
      'public.trade_import_source_keys'::regclass
    )
      and acl_row.grantee <> relation_row.relowner
      and grantee_row.rolname = 'authenticated'
      and acl_row.privilege_type = 'SELECT'
      and not acl_row.is_grantable
  ) <> 2 then
    raise exception 'TRADE_IMPORT_VERIFY_TABLE_ACL_SHAPE_INVALID';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure_row
    cross join lateral aclexplode(coalesce(
      procedure_row.proacl,acldefault('f',procedure_row.proowner)
    )) acl_row
    left join pg_catalog.pg_roles grantee_row
      on grantee_row.oid = acl_row.grantee
    where procedure_row.oid in (
      'public.equora_upsert_import_account_v1(uuid,text,text,text)'::regprocedure,
      'public.equora_import_trades_v1(uuid,jsonb,jsonb)'::regprocedure,
      'public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure,
      'public.equora_revert_import_v1(uuid)'::regprocedure
    )
      and acl_row.grantee <> procedure_row.proowner
      and not (
        procedure_row.oid in (
          'public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure,
          'public.equora_revert_import_v1(uuid)'::regprocedure
        )
        and coalesce(grantee_row.rolname, '') = 'authenticated'
        and acl_row.privilege_type = 'EXECUTE'
        and not acl_row.is_grantable
      )
  ) or (
    select count(*)
    from pg_catalog.pg_proc procedure_row
    cross join lateral aclexplode(coalesce(
      procedure_row.proacl,acldefault('f',procedure_row.proowner)
    )) acl_row
    join pg_catalog.pg_roles grantee_row on grantee_row.oid = acl_row.grantee
    where procedure_row.oid in (
      'public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure,
      'public.equora_revert_import_v1(uuid)'::regprocedure
    )
      and acl_row.grantee <> procedure_row.proowner
      and grantee_row.rolname = 'authenticated'
      and acl_row.privilege_type = 'EXECUTE'
      and not acl_row.is_grantable
  ) <> 2 then
    raise exception 'TRADE_IMPORT_VERIFY_FUNCTION_ACL_SHAPE_INVALID';
  end if;

  -- Exact LF-canonical function bodies bind executable guards, not mere tokens.
  -- Regenerate only from the reviewed candidate and re-freeze the full snapshot.
  if (
    select count(*)
    from (values
      ('public.equora_upsert_import_account_v1(uuid,text,text,text)','1a8cd9940cdfb3ec99975ae8c7a1ab341ad7abcd6476c7b0cbd8e8d73894ef09'),
      ('public.equora_import_trades_v2(uuid,uuid,jsonb,jsonb,jsonb)','8680f7935faeff128a71c07b986407463a0c9ff4d987e13f49aeea422c821f8c'),
      ('public.equora_revert_import_v1(uuid)','5b2c3e725f72b2905771d4a5e1e8cc4d4c7d6ae0ab988c0f720b4e39e9e0e0e9')
    ) expected(signature, body_sha256)
    join pg_catalog.pg_proc actual on actual.oid=expected.signature::regprocedure
    where encode(pg_catalog.sha256(convert_to(
      replace(actual.prosrc, chr(13)||chr(10), chr(10)), 'UTF8'
    )), 'hex') = expected.body_sha256
  ) <> 3 then raise exception 'TRADE_IMPORT_VERIFY_FUNCTION_BODY_INVALID'; end if;

  if exists (
      select 1
      from public.trade_import_source_keys
      where snapshot_digest is distinct from encode(
        pg_catalog.sha256(convert_to(trade_snapshot::text,'UTF8')),'hex'
      )
    ) or exists (
      select 1
      from public.trade_import_batches
      where import_account_id is not null
        and source_manifest_digest is distinct from encode(
          pg_catalog.sha256(convert_to(source_manifest::text,'UTF8')),'hex'
        )
    ) then
    raise exception 'TRADE_IMPORT_VERIFY_PERSISTED_DIGEST_INVALID';
  end if;
  perform pg_catalog.set_config('search_path',v_previous_search_path,true);
end;
$equora_v5762_verify_strict$;
