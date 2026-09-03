-- Equora local schema candidate: stable file-import accounts and atomic dedupe.
-- DO NOT APPLY to Production. This artifact is intentionally absent from
-- deploy-v57.61.0.sql and requires its own preflight, migration, postflight,
-- rollback/recovery review and explicit Supabase authorization.

begin;

-- This database gate is the authoritative persistence boundary. Installing or
-- re-applying the candidate never activates imports. Activation requires a
-- separate, explicit administrative statement after migration approval.
create table if not exists public.equora_runtime_capability_gates (
  capability_key text not null,
  contract_version text not null,
  enabled boolean not null default false,
  activated_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint equora_runtime_capability_gates_pkey
    primary key (capability_key, contract_version),
  constraint equora_runtime_capability_gates_key_check
    check (char_length(capability_key) between 3 and 80),
  constraint equora_runtime_capability_gates_contract_check
    check (char_length(contract_version) between 3 and 120),
  constraint equora_runtime_capability_gates_activation_check
    check (
      (enabled and activated_at is not null)
      or (not enabled and activated_at is null)
    )
);

insert into public.equora_runtime_capability_gates (
  capability_key, contract_version, enabled, activated_at
) values (
  'journal_file_import_persistence_v2',
  'equora-broker-file-import-capability-v1',
  false,
  null
)
on conflict (capability_key, contract_version) do nothing;

alter table public.equora_runtime_capability_gates enable row level security;
revoke all on table public.equora_runtime_capability_gates
  from public, anon, authenticated;

create table if not exists public.journal_import_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  preset_key text not null,
  display_label text not null,
  normalized_label text not null,
  account_currency text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_import_accounts_preset_key_check
    check (preset_key in (
      'generic', 'metatrader4-history', 'ctrader-history', 'mexc-futures', 'mexc-spot',
      'binance-futures', 'bybit-futures', 'okx-futures', 'kraken-spot'
    )),
  constraint journal_import_accounts_display_label_check
    check (char_length(display_label) between 3 and 60),
  constraint journal_import_accounts_normalized_label_check
    check (char_length(normalized_label) between 3 and 60),
  constraint journal_import_accounts_currency_check
    check (account_currency in ('EUR', 'USD', 'GBP', 'USDT', 'USDC')),
  constraint journal_import_accounts_user_id_id_key unique (user_id, id),
  constraint journal_import_accounts_namespace_key
    unique (user_id, preset_key, normalized_label)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'trades_user_id_id_key'
      and conrelid = 'public.trades'::regclass
  ) then
    alter table public.trades
      add constraint trades_user_id_id_key unique (user_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'trade_import_batches_user_id_id_key'
      and conrelid = 'public.trade_import_batches'::regclass
  ) then
    alter table public.trade_import_batches
      add constraint trade_import_batches_user_id_id_key unique (user_id, id);
  end if;
end $$;

alter table public.trades
  add column if not exists import_account_id uuid;
alter table public.trade_import_batches
  add column if not exists import_account_id uuid,
  add column if not exists request_digest text,
  add column if not exists source_manifest jsonb,
  add column if not exists source_manifest_digest text,
  add column if not exists source_row_count integer,
  add column if not exists invalid_count integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'trades_import_account_owner_fkey'
      and conrelid = 'public.trades'::regclass
  ) then
    alter table public.trades
      add constraint trades_import_account_owner_fkey
      foreign key (user_id, import_account_id)
      references public.journal_import_accounts (user_id, id)
      on delete restrict
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'trade_import_batches_import_account_owner_fkey'
      and conrelid = 'public.trade_import_batches'::regclass
  ) then
    alter table public.trade_import_batches
      add constraint trade_import_batches_import_account_owner_fkey
      foreign key (user_id, import_account_id)
      references public.journal_import_accounts (user_id, id)
      on delete restrict
      not valid;
  end if;
end $$;

create table if not exists public.trade_import_source_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  import_account_id uuid not null,
  preset_key text not null,
  source_kind text not null,
  source_digest text not null,
  batch_id uuid not null,
  trade_id uuid,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  reverted_at timestamptz,
  constraint trade_import_source_keys_kind_check
    check (source_kind in ('provider_identity_v1', 'value_fingerprint_v1')),
  constraint trade_import_source_keys_digest_check
    check (source_digest ~ '^[0-9a-f]{64}$'),
  constraint trade_import_source_keys_status_check
    check (status in ('active', 'reverted')),
  constraint trade_import_source_keys_account_owner_fkey
    foreign key (user_id, import_account_id)
    references public.journal_import_accounts (user_id, id)
    on delete restrict,
  constraint trade_import_source_keys_batch_owner_fkey
    foreign key (user_id, batch_id)
    references public.trade_import_batches (user_id, id)
    on delete cascade,
  constraint trade_import_source_keys_trade_owner_fkey
    foreign key (user_id, trade_id)
    references public.trades (user_id, id)
    on delete set null (trade_id)
);

alter table public.trade_import_source_keys
  drop constraint if exists trade_import_source_keys_identity_key;
create unique index if not exists trade_import_source_keys_active_identity_key
  on public.trade_import_source_keys (
    user_id, import_account_id, preset_key, source_kind, source_digest
  )
  where status = 'active';

create index if not exists journal_import_accounts_user_created_idx
  on public.journal_import_accounts (user_id, created_at desc);
create index if not exists trades_import_account_idx
  on public.trades (user_id, import_account_id);
create index if not exists trade_import_batches_import_account_idx
  on public.trade_import_batches (user_id, import_account_id, created_at desc);
create index if not exists trade_import_source_keys_account_created_idx
  on public.trade_import_source_keys
  (user_id, import_account_id, created_at desc);
create index if not exists trade_import_source_keys_batch_idx
  on public.trade_import_source_keys (user_id, batch_id);
create index if not exists trade_import_source_keys_trade_idx
  on public.trade_import_source_keys (user_id, trade_id)
  where trade_id is not null;

alter table public.journal_import_accounts enable row level security;
alter table public.trade_import_source_keys enable row level security;

drop policy if exists "users can read own journal import accounts"
  on public.journal_import_accounts;
create policy "users can read own journal import accounts"
  on public.journal_import_accounts for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can read own trade import source keys"
  on public.trade_import_source_keys;
create policy "users can read own trade import source keys"
  on public.trade_import_source_keys for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.journal_import_accounts from public, anon;
revoke all on table public.journal_import_accounts from authenticated;
grant select on table public.journal_import_accounts to authenticated;
revoke all on table public.trade_import_source_keys from public, anon;
revoke all on table public.trade_import_source_keys from authenticated;
grant select on table public.trade_import_source_keys to authenticated;

create or replace function public.equora_upsert_import_account_v1(
  p_account_id uuid,
  p_preset_key text,
  p_display_label text,
  p_account_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_id uuid := coalesce(p_account_id, gen_random_uuid());
  v_preset_key text := lower(btrim(coalesce(p_preset_key, '')));
  v_display_label text := regexp_replace(btrim(coalesce(p_display_label, '')), '\s+', ' ', 'g');
  v_normalized_label text;
  v_currency text := upper(btrim(coalesce(p_account_currency, '')));
  v_existing_user_id uuid;
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  v_normalized_label := lower(v_display_label);
  if v_preset_key not in (
    'generic', 'metatrader4-history', 'ctrader-history', 'mexc-futures', 'mexc-spot',
    'binance-futures', 'bybit-futures', 'okx-futures', 'kraken-spot'
  ) then raise exception 'INVALID_PRESET'; end if;
  if char_length(v_display_label) not between 3 and 60 then
    raise exception 'INVALID_ACCOUNT_LABEL';
  end if;
  if v_currency not in ('EUR', 'USD', 'GBP', 'USDT', 'USDC') then
    raise exception 'INVALID_CURRENCY';
  end if;

  if p_account_id is not null then
    select user_id into v_existing_user_id
    from public.journal_import_accounts
    where id = p_account_id
    for update;
    if found and v_existing_user_id <> v_user_id then
      raise exception 'NOT_FOUND_OR_FORBIDDEN';
    end if;
  end if;

  if p_account_id is null then
    insert into public.journal_import_accounts (
      id, user_id, preset_key, display_label, normalized_label,
      account_currency, created_at, updated_at
    ) values (
      v_account_id, v_user_id, v_preset_key, v_display_label,
      v_normalized_label, v_currency, now(), now()
    )
    on conflict (user_id, preset_key, normalized_label) do update
    set display_label = excluded.display_label,
        account_currency = excluded.account_currency,
        updated_at = now()
    returning id into v_account_id;
  elsif v_existing_user_id is null then
    insert into public.journal_import_accounts (
      id, user_id, preset_key, display_label, normalized_label,
      account_currency, created_at, updated_at
    ) values (
      v_account_id, v_user_id, v_preset_key, v_display_label,
      v_normalized_label, v_currency, now(), now()
    );
  else
    update public.journal_import_accounts
    set display_label = v_display_label,
        normalized_label = v_normalized_label,
        account_currency = v_currency,
        updated_at = now()
    where id = v_account_id
      and user_id = v_user_id
      and preset_key = v_preset_key;
    if not found then raise exception 'IMPORT_ACCOUNT_PRESET_MISMATCH'; end if;
  end if;

  return jsonb_build_object(
    'id', v_account_id,
    'presetKey', v_preset_key,
    'displayLabel', v_display_label,
    'accountCurrency', v_currency
  );
end;
$$;

drop function if exists public.equora_import_trades_v2(
  uuid, uuid, jsonb, jsonb
);
create or replace function public.equora_import_trades_v2(
  p_batch_id uuid,
  p_import_account_id uuid,
  p_batch jsonb,
  p_source_rows jsonb,
  p_trades jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_result jsonb;
  v_import_account_id uuid;
  v_account_preset text;
  v_account_label text;
  v_preset_key text := lower(btrim(coalesce(p_batch->>'preset_key', '')));
  v_entry jsonb;
  v_source_key jsonb;
  v_trade jsonb;
  v_tags text[];
  v_trade_id uuid;
  v_row_number integer;
  v_imported integer := 0;
  v_duplicates integer := 0;
  v_skipped integer := 0;
  v_invalid integer := 0;
  v_source_row_count integer := 0;
  v_source_key_duplicate boolean;
  v_imported_ids jsonb := '[]'::jsonb;
  v_expected_fingerprint_digest text;
  v_provider_identity_digest text;
  v_provider_identity_kind text;
  v_provider_identity_value text;
  v_required_provider_identity_kind text;
  v_reserved_source_kind text;
  v_reserved_source_digest text;
  v_request_digest text;
  v_source_manifest_digest text;
  v_existing_batch public.trade_import_batches%rowtype;
  v_plausibility_total integer := 0;
  v_plausibility_count integer := 0;
  v_row_plausibility integer;
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if not exists (
    select 1
    from public.equora_runtime_capability_gates gate
    where gate.capability_key = 'journal_file_import_persistence_v2'
      and gate.contract_version =
        'equora-broker-file-import-capability-v1'
      and gate.enabled
      and gate.activated_at is not null
  ) then raise exception 'IMPORT_PERSISTENCE_DISABLED'; end if;
  if p_batch_id is null
    or jsonb_typeof(coalesce(p_source_rows, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_trades, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_source_rows, '[]'::jsonb)) < 1
    or jsonb_array_length(coalesce(p_source_rows, '[]'::jsonb)) > 5000
    or jsonb_array_length(coalesce(p_trades, '[]'::jsonb)) < 1
    or jsonb_array_length(coalesce(p_trades, '[]'::jsonb)) > 5000
    or octet_length(coalesce(p_batch, '{}'::jsonb)::text) > 65536
    or octet_length(coalesce(p_source_rows, '[]'::jsonb)::text) > 20971520
    or octet_length(coalesce(p_trades, '[]'::jsonb)::text) > 20971520
  then raise exception 'INVALID_INPUT'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_source_rows) source_row
    where coalesce(source_row->>'row_number', '') !~ '^[0-9]+$'
      or coalesce(source_row->>'preview_status', '') not in ('importable', 'check', 'skip')
      or jsonb_typeof(source_row->'selected') <> 'boolean'
  ) then raise exception 'INVALID_SOURCE_MANIFEST'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_source_rows) source_row
    where (source_row->>'row_number')::integer < 2
      or (
        (source_row->>'selected')::boolean
        and source_row->>'preview_status' = 'skip'
      )
  ) then raise exception 'INVALID_SOURCE_MANIFEST'; end if;
  if exists (
    select 1
    from jsonb_array_elements(p_source_rows) source_row
    group by (source_row->>'row_number')::integer
    having count(*) <> 1
  ) then raise exception 'DUPLICATE_SOURCE_ROW'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_trades) trade_entry
    where coalesce(trade_entry->>'row_number', '') !~ '^[0-9]+$'
      or jsonb_typeof(coalesce(trade_entry->'trade', '{}'::jsonb)) <> 'object'
      or jsonb_typeof(coalesce(trade_entry->'tags', '[]'::jsonb)) <> 'array'
      or jsonb_typeof(coalesce(trade_entry->'source_keys', '[]'::jsonb)) <> 'array'
  ) then raise exception 'INVALID_TRADE_ENVELOPE'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_trades) trade_entry
    where (trade_entry->>'row_number')::integer < 2
  ) then raise exception 'INVALID_TRADE_ENVELOPE'; end if;
  if exists (
    select 1
    from jsonb_array_elements(p_trades) trade_entry
    group by (trade_entry->>'row_number')::integer
    having count(*) <> 1
  ) then raise exception 'DUPLICATE_TRADE_ROW'; end if;
  if jsonb_array_length(p_trades) <> (
    select count(*) from jsonb_array_elements(p_source_rows) source_row
    where (source_row->>'selected')::boolean
  ) or exists (
    select 1 from jsonb_array_elements(p_source_rows) source_row
    where (source_row->>'selected')::boolean
      and not exists (
        select 1 from jsonb_array_elements(p_trades) trade_entry
        where (trade_entry->>'row_number')::integer =
          (source_row->>'row_number')::integer
      )
  ) or exists (
    select 1 from jsonb_array_elements(p_trades) trade_entry
    where not exists (
      select 1 from jsonb_array_elements(p_source_rows) source_row
      where (source_row->>'row_number')::integer =
          (trade_entry->>'row_number')::integer
        and (source_row->>'selected')::boolean
    )
  ) then raise exception 'SOURCE_MANIFEST_MISMATCH'; end if;

  v_source_row_count := jsonb_array_length(p_source_rows);
  select count(*) into v_skipped
  from jsonb_array_elements(p_source_rows) source_row
  where source_row->>'preview_status' = 'skip';
  select count(*) into v_invalid
  from jsonb_array_elements(p_source_rows) source_row
  where not (source_row->>'selected')::boolean
    and source_row->>'preview_status' <> 'skip';
  v_source_manifest_digest := encode(
    pg_catalog.sha256(convert_to(p_source_rows::text, 'UTF8')), 'hex'
  );
  v_request_digest := encode(
    pg_catalog.sha256(convert_to(jsonb_build_array(
      'equora-import-request-v2', p_import_account_id, p_batch,
      p_source_rows, p_trades
    )::text, 'UTF8')), 'hex'
  );

  -- Serialize the idempotency namespace before any account or trade mutation.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_batch_id::text, 0)
  );
  select * into v_existing_batch
  from public.trade_import_batches
  where id = p_batch_id
  for update;
  if found then
    if v_existing_batch.user_id <> v_user_id then
      raise exception 'NOT_FOUND_OR_FORBIDDEN';
    end if;
    if v_existing_batch.request_digest is distinct from v_request_digest then
      raise exception 'BATCH_REPLAY_MISMATCH';
    end if;
    select coalesce(jsonb_agg(trade.id order by trade.created_at, trade.id), '[]'::jsonb)
    into v_imported_ids
    from public.trades trade
    where trade.user_id = v_user_id and trade.import_batch_id = p_batch_id;
    return jsonb_build_object(
      'batchId', p_batch_id, 'alreadyApplied', true,
      'sourceRowCount', coalesce(v_existing_batch.source_row_count, 0),
      'importedCount', coalesce(v_existing_batch.imported_count, 0),
      'duplicateCount', coalesce(v_existing_batch.duplicate_count, 0),
      'skippedCount', coalesce(v_existing_batch.skipped_count, 0),
      'invalidCount', coalesce(v_existing_batch.invalid_count, 0),
      'importedIds', v_imported_ids
    );
  end if;

  -- Account creation or update occurs only after a clean replay decision.
  v_account_result := public.equora_upsert_import_account_v1(
    p_import_account_id,
    v_preset_key,
    p_batch->>'account_label',
    p_batch->>'account_currency'
  );
  v_import_account_id := nullif(v_account_result->>'id', '')::uuid;

  select preset_key, display_label
  into v_account_preset, v_account_label
  from public.journal_import_accounts
  where id = v_import_account_id and user_id = v_user_id
  for update;
  if not found then raise exception 'IMPORT_ACCOUNT_NOT_FOUND'; end if;
  if v_account_preset <> v_preset_key then
    raise exception 'IMPORT_ACCOUNT_PRESET_MISMATCH';
  end if;

  insert into public.trade_import_batches (
    id, user_id, import_account_id, created_at, file_name, preset_key,
    preset_label, account_label, imported_count, duplicate_count,
    skipped_count, invalid_count, source_row_count, source_manifest,
    source_manifest_digest, request_digest, trust_score, trust_label,
    warnings, status, reverted_at
  ) values (
    p_batch_id, v_user_id, v_import_account_id, now(),
    left(nullif(p_batch->>'file_name', ''), 160), v_preset_key,
    nullif(p_batch->>'preset_label', ''), v_account_label, 0, 0,
    v_skipped, v_invalid, v_source_row_count, p_source_rows,
    v_source_manifest_digest, v_request_digest, null,
    'Server-Prüfung aus Importwerten',
    array[
      'Das übermittelte Quellenmanifest ist kryptografisch an diese Charge gebunden; die Originaldatei wurde serverseitig nicht unabhängig verifiziert.'
    ]::text[],
    'active', null
  );

  for v_entry in
    select value from jsonb_array_elements(coalesce(p_trades, '[]'::jsonb))
  loop
    v_row_number := (v_entry->>'row_number')::integer;
    v_trade := (
      coalesce(v_entry->'trade', '{}'::jsonb)
      - 'id' - 'user_id' - 'import_batch_id' - 'import_account_id'
    ) || jsonb_build_object(
      'import_batch_id', p_batch_id,
      'account_label', v_account_label
    );
    if upper(btrim(coalesce(v_trade->>'account_currency', ''))) not in (
      'EUR', 'USD', 'GBP', 'USDT', 'USDC'
    ) then
      raise exception 'INVALID_TRADE_CURRENCY';
    end if;
    -- A valid source-row currency is authoritative. The account currency is
    -- only the fallback chosen by the caller when the source row has none.
    v_trade := v_trade || jsonb_build_object(
      'account_currency', upper(btrim(v_trade->>'account_currency'))
    );
    v_trade_id := gen_random_uuid();
    v_expected_fingerprint_digest := encode(
      pg_catalog.sha256(
        convert_to(
        concat_ws(
          '|',
          to_char(
            (v_trade->>'created_at')::timestamptz at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
          ),
          lower(btrim(coalesce(v_trade->>'market', ''))),
          lower(btrim(coalesce(v_trade->>'bias', ''))),
          coalesce(
            pg_catalog.trim_scale(nullif(v_trade->>'net_pnl', '')::numeric)::text,
            ''
          ),
          coalesce(
            pg_catalog.trim_scale(nullif(v_trade->>'position_size', '')::numeric)::text,
            ''
          ),
          upper(btrim(coalesce(v_trade->>'account_currency', ''))),
          lower(btrim(coalesce(v_trade->>'broker_profile', ''))),
          lower(btrim(coalesce(v_trade->>'account_template', ''))),
          v_import_account_id::text
        ),
        'UTF8'
        )
      ),
      'hex'
    );
    v_required_provider_identity_kind := case v_preset_key
      when 'ctrader-history' then 'deal_id'
      when 'metatrader4-history' then 'ticket'
      else null
    end;
    if v_required_provider_identity_kind is not null then
      if jsonb_array_length(v_entry->'source_keys') <> 1 then
        raise exception 'REQUIRED_PROVIDER_IDENTITY_MISSING';
      end if;
      v_source_key := (v_entry->'source_keys')->0;
      v_provider_identity_kind := lower(regexp_replace(
        btrim(coalesce(v_source_key->>'identityKind', '')), '\s+', ' ', 'g'
      ));
      v_provider_identity_value := lower(regexp_replace(
        btrim(coalesce(v_source_key->>'identityValue', '')), '\s+', ' ', 'g'
      ));
      if coalesce(v_source_key->>'kind', '') <> 'provider_identity_v1'
        or v_provider_identity_kind <> v_required_provider_identity_kind
        or char_length(v_provider_identity_value) not between 1 and 160
        or v_provider_identity_value in ('-', 'n/a', 'na', 'null', 'undefined')
      then raise exception 'INVALID_PROVIDER_IDENTITY'; end if;
      v_provider_identity_digest := encode(
        pg_catalog.sha256(convert_to(jsonb_build_array(
          'equora-provider-source-v1',
          v_provider_identity_kind,
          v_provider_identity_value
        )::text, 'UTF8')), 'hex'
      );
      v_reserved_source_kind := 'provider_identity_v1';
      v_reserved_source_digest := v_provider_identity_digest;
    else
      if jsonb_array_length(v_entry->'source_keys') <> 0 then
        raise exception 'PROVIDER_IDENTITY_NOT_ALLOWED';
      end if;
      v_reserved_source_kind := 'value_fingerprint_v1';
      v_reserved_source_digest := v_expected_fingerprint_digest;
    end if;

    v_source_key_duplicate := false;
    begin
      -- Exactly one key is authoritative per row: the allowlisted provider ID
      -- when available, otherwise the canonical database value fingerprint.
      insert into public.trade_import_source_keys (
        id, user_id, import_account_id, preset_key, source_kind,
        source_digest, batch_id, trade_id, status, created_at, reverted_at
      ) values (
        gen_random_uuid(), v_user_id, v_import_account_id, v_preset_key,
        v_reserved_source_kind, v_reserved_source_digest,
        p_batch_id, null, 'active', now(), null
      );
    exception when unique_violation then
      v_source_key_duplicate := true;
    end;

    if v_source_key_duplicate then
      v_duplicates := v_duplicates + 1;
      continue;
    end if;

    v_row_plausibility := 100;
    if nullif(v_trade->>'created_at', '') is null then
      v_row_plausibility := v_row_plausibility - 35;
    end if;
    if nullif(btrim(v_trade->>'market'), '') is null then
      v_row_plausibility := v_row_plausibility - 35;
    end if;
    if nullif(v_trade->>'net_pnl', '') is null
      and (
        nullif(v_trade->>'entry', '') is null
        or nullif(v_trade->>'exit', '') is null
      )
    then v_row_plausibility := v_row_plausibility - 25; end if;
    if nullif(v_trade->>'stop_loss', '') is null then
      v_row_plausibility := v_row_plausibility - 8;
    end if;
    v_tags := coalesce(array(
      select jsonb_array_elements_text(coalesce(v_entry->'tags', '[]'::jsonb))
    ), '{}'::text[]);
    perform public.equora_create_trade_v1(v_trade_id, v_trade, v_tags, null);
    update public.trades
    set import_account_id = v_import_account_id
    where id = v_trade_id and user_id = v_user_id;
    update public.trade_import_source_keys
    set trade_id = v_trade_id
    where user_id = v_user_id
      and batch_id = p_batch_id
      and source_kind = v_reserved_source_kind
      and source_digest = v_reserved_source_digest
      and trade_id is null;
    v_imported := v_imported + 1;
    v_plausibility_total := v_plausibility_total
      + greatest(0, least(100, v_row_plausibility));
    v_plausibility_count := v_plausibility_count + 1;
    v_imported_ids := v_imported_ids || to_jsonb(v_trade_id);
  end loop;

  if v_imported + v_duplicates <> jsonb_array_length(p_trades) then
    raise exception 'SERVER_COUNT_INVARIANT_FAILED';
  end if;

  update public.trade_import_batches
  set imported_count = v_imported,
      duplicate_count = v_duplicates,
      trust_score = case
        when v_plausibility_count = 0 then null
        else round(v_plausibility_total::numeric / v_plausibility_count)
      end,
      trust_label = case
        when v_plausibility_count = 0 then 'Keine importierten Zeilen'
        when v_plausibility_total::numeric / v_plausibility_count >= 85
          then 'Server-Plausibilität hoch'
        when v_plausibility_total::numeric / v_plausibility_count >= 65
          then 'Server-Plausibilität mittel'
        else 'Server-Prüfung erforderlich'
      end
  where id = p_batch_id and user_id = v_user_id;

  return jsonb_build_object(
    'batchId', p_batch_id,
    'sourceRowCount', v_source_row_count,
    'importedCount', v_imported,
    'duplicateCount', v_duplicates,
    'skippedCount', v_skipped,
    'invalidCount', v_invalid,
    'importedIds', v_imported_ids,
    'alreadyApplied', false
  );
end;
$$;

create or replace function public.equora_revert_import_v1(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_deleted integer := 0;
  v_paths text[] := '{}'::text[];
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  select status into v_status
  from public.trade_import_batches
  where id = p_batch_id and user_id = v_user_id
  for update;
  if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;
  if v_status = 'reverted' then
    return jsonb_build_object(
      'reverted', false, 'alreadyReverted', true,
      'deletedCount', 0, 'storagePaths', to_jsonb(v_paths)
    );
  end if;

  select coalesce(
    array_agg(media.storage_path order by media.storage_path),
    '{}'::text[]
  )
  into v_paths
  from public.trade_media media
  join public.trades trade on trade.id = media.trade_id
  where trade.user_id = v_user_id and trade.import_batch_id = p_batch_id;

  update public.trade_import_source_keys
  set status = 'reverted', reverted_at = now(), trade_id = null
  where user_id = v_user_id and batch_id = p_batch_id;

  delete from public.trades
  where user_id = v_user_id and import_batch_id = p_batch_id;
  get diagnostics v_deleted = row_count;

  update public.trade_import_batches
  set status = 'reverted', reverted_at = now()
  where id = p_batch_id and user_id = v_user_id;

  return jsonb_build_object(
    'reverted', true, 'deletedCount', v_deleted,
    'storagePaths', to_jsonb(v_paths)
  );
end;
$$;

revoke all on function public.equora_upsert_import_account_v1(
  uuid, text, text, text
) from public, anon, authenticated;
-- The legacy v1 import bypasses the v2 source manifest, stable account,
-- server-side identity and replay contracts. Keep it available only as a
-- historical rollback object; authenticated callers must not execute it.
revoke all on function public.equora_import_trades_v1(
  uuid, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function public.equora_import_trades_v2(
  uuid, uuid, jsonb, jsonb, jsonb
) from public, anon;
revoke all on function public.equora_revert_import_v1(uuid)
  from public, anon;
grant execute on function public.equora_import_trades_v2(
  uuid, uuid, jsonb, jsonb, jsonb
) to authenticated;
-- EXECUTE alone cannot activate persistence: the function independently
-- requires the protected database gate above before any mutation.
grant execute on function public.equora_revert_import_v1(uuid)
  to authenticated;

-- Existing rows remain nullable by design. No source identity can be inferred
-- safely from editable labels or legacy notes. Validation and NOT NULL are
-- deferred until an explicit, reviewed backfill decision exists.
alter table public.trades
  validate constraint trades_import_account_owner_fkey;
alter table public.trade_import_batches
  validate constraint trade_import_batches_import_account_owner_fkey;

commit;
