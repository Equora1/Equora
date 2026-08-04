-- Equora Starter v57.60.1
-- P0 containment: private media, tenant-bound paths, atomic journal mutations,
-- durable storage cleanup jobs and truthful broker credential deletion.
-- Apply only after the v57.60 schema and before deploying the v57.60.1 app.

begin;

-- Review sessions retain the monetary scope that produced their snapshot.
-- Legacy rows intentionally remain unknown and therefore fail closed in the UI.
alter table public.review_sessions add column if not exists top_tags text[] not null default '{}'::text[];
alter table public.review_sessions add column if not exists best_trade_id uuid;
alter table public.review_sessions add column if not exists worst_trade_id uuid;
alter table public.review_sessions add column if not exists session_type text not null default 'spotlight';
alter table public.review_sessions add column if not exists session_status text not null default 'open';
alter table public.review_sessions add column if not exists currency text;
alter table public.review_sessions add column if not exists monetary_scope_kind text not null default 'unknown';
alter table public.trades add column if not exists account_label text;

alter table public.review_sessions drop constraint if exists review_sessions_monetary_scope_v57601;
alter table public.review_sessions
  add constraint review_sessions_monetary_scope_v57601 check (
    (
      monetary_scope_kind = 'single'
      and currency in ('EUR', 'USD', 'GBP', 'USDT', 'USDC')
    )
    or (
      monetary_scope_kind in ('empty', 'mixed', 'unknown')
      and currency is null
    )
  ) not valid;

drop policy if exists "users can insert own shared trade submissions" on public.shared_trade_submissions;
drop policy if exists "users can update own shared trade submissions" on public.shared_trade_submissions;
drop policy if exists "users can delete own shared trade submissions" on public.shared_trade_submissions;
revoke insert, update, delete on table public.shared_trade_submissions from anon, authenticated;
grant select on table public.shared_trade_submissions to authenticated;

-- ---------------------------------------------------------------------------
-- Private media bucket and tenant-bound access
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'equora-media',
  'equora-media',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "users can view equora media bucket objects" on storage.objects;
drop policy if exists "users can view own equora media" on storage.objects;
drop policy if exists "users can upload own equora media" on storage.objects;
drop policy if exists "users can update own equora media" on storage.objects;
drop policy if exists "users can delete own equora media" on storage.objects;

create policy "users can view own equora media"
on storage.objects for select to authenticated
using (
  bucket_id = 'equora-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "users can upload own equora media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'equora-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "users can update own equora media"
on storage.objects for update to authenticated
using (
  bucket_id = 'equora-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'equora-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "users can delete own equora media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'equora-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- Signed URLs are view state only and new writes persist no access grants.
-- Every legacy locator must be reconciled before this transaction may continue.
do $$
begin
  if exists (
    select 1 from public.trades where screenshot_url is not null
  ) then raise exception 'LEGACY_TRADE_MEDIA_RECONCILIATION_REQUIRED'; end if;

  if exists (
    select 1 from public.setups where cover_image_url is not null
  ) then raise exception 'LEGACY_SETUP_MEDIA_RECONCILIATION_REQUIRED'; end if;

  if exists (
    select 1 from public.shared_trade_submissions
    where shared_screenshot_url is not null
  ) then raise exception 'LEGACY_SHARED_MEDIA_RECONCILIATION_REQUIRED'; end if;

  if exists (
    select 1
    from public.trade_media media
    where media.user_id is null
      or media.trade_id is null
      or not exists (
        select 1 from public.trades parent_trade
        where parent_trade.id = media.trade_id
          and parent_trade.user_id = media.user_id
      )
      or media.storage_path !~ (
        '^' || media.user_id::text || '/trades/' || media.trade_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$'
      )
      or not exists (
        select 1 from storage.objects object_row
        where object_row.bucket_id = 'equora-media' and object_row.name = media.storage_path
      )
  ) then raise exception 'TRADE_MEDIA_STORAGE_RECONCILIATION_REQUIRED'; end if;

  if exists (
    select 1
    from public.setup_media media
    where media.user_id is null
      or media.setup_id is null
      or not exists (
        select 1 from public.setups parent_setup
        where parent_setup.id = media.setup_id
          and parent_setup.user_id = media.user_id
      )
      or media.storage_path !~ (
        '^' || media.user_id::text || '/setups/' || media.setup_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$'
      )
      or not exists (
        select 1 from storage.objects object_row
        where object_row.bucket_id = 'equora-media' and object_row.name = media.storage_path
      )
  ) then raise exception 'SETUP_MEDIA_STORAGE_RECONCILIATION_REQUIRED'; end if;
end;
$$;

-- Preserve parent/tenant consistency after the legacy reconciliation as well.
create unique index if not exists trades_id_user_id_v57601_uidx
  on public.trades (id, user_id);
create unique index if not exists setups_id_user_id_v57601_uidx
  on public.setups (id, user_id);

alter table public.trade_media
  drop constraint if exists trade_media_parent_owner_v57601;
alter table public.trade_media
  add constraint trade_media_parent_owner_v57601
  foreign key (trade_id, user_id) references public.trades (id, user_id)
  on delete cascade not valid;
alter table public.trade_media validate constraint trade_media_parent_owner_v57601;

alter table public.setup_media
  drop constraint if exists setup_media_parent_owner_v57601;
alter table public.setup_media
  add constraint setup_media_parent_owner_v57601
  foreign key (setup_id, user_id) references public.setups (id, user_id)
  on delete cascade not valid;
alter table public.setup_media validate constraint setup_media_parent_owner_v57601;

update public.trade_media set public_url = '' where public_url <> '';
update public.setup_media set public_url = '' where public_url <> '';

-- ---------------------------------------------------------------------------
-- Durable cleanup outbox. Storage I/O is deliberately outside DB transactions.
-- ---------------------------------------------------------------------------

create table if not exists public.media_cleanup_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  bucket text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  last_error text,
  not_before timestamptz not null default now(),
  completed_at timestamptz,
  constraint media_cleanup_outbox_bucket_check check (bucket = 'equora-media'),
  constraint media_cleanup_outbox_attempts_check check (attempts >= 0),
  constraint media_cleanup_outbox_path_check check (storage_path <> '')
);

alter table public.media_cleanup_outbox
  drop constraint if exists media_cleanup_outbox_user_id_fkey;
alter table public.media_cleanup_outbox
  add column if not exists not_before timestamptz not null default now();

create unique index if not exists media_cleanup_outbox_bucket_path_unique
  on public.media_cleanup_outbox (bucket, storage_path);
create index if not exists media_cleanup_outbox_pending_idx
  on public.media_cleanup_outbox (created_at asc)
  where completed_at is null;

alter table public.media_cleanup_outbox enable row level security;
revoke all on table public.media_cleanup_outbox from anon, authenticated;

create or replace function public.equora_register_media_upload_intents_v1(
  p_kind text,
  p_parent_id uuid,
  p_storage_paths text[]
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_paths text[];
  v_path text;
  v_path_count integer;
  v_pending_count integer;
  v_recent_count integer;
  v_prefix text;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_parent_id is null then raise exception 'PARENT_REQUIRED'; end if;
  if p_kind not in ('trade', 'setup') then raise exception 'INVALID_MEDIA_KIND'; end if;

  select coalesce(array_agg(candidate.path order by candidate.path), '{}'::text[])
  into v_paths
  from (
    select distinct btrim(value) as path
    from unnest(coalesce(p_storage_paths, '{}'::text[])) as value
    where btrim(value) <> ''
  ) candidate;

  v_path_count := cardinality(v_paths);
  if v_path_count < 1 or v_path_count > 12 then
    raise exception 'MEDIA_COUNT_OUT_OF_RANGE';
  end if;

  if p_kind = 'trade' then
    if not exists (
      select 1 from public.trades
      where id = p_parent_id and user_id = v_user_id
    ) then raise exception 'TRADE_NOT_OWNED'; end if;
    v_prefix := '^' || v_user_id::text || '/trades/' || p_parent_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$';
  else
    if not exists (
      select 1 from public.setups
      where id = p_parent_id and user_id = v_user_id
    ) then raise exception 'SETUP_NOT_OWNED'; end if;
    v_prefix := '^' || v_user_id::text || '/setups/' || p_parent_id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$';
  end if;

  foreach v_path in array v_paths loop
    if v_path !~ v_prefix then raise exception 'INVALID_MEDIA_PATH'; end if;
  end loop;

  -- Serialize quota reservations per user so concurrent server-action calls
  -- cannot exceed the active or per-minute intent cap.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 57601));

  select count(*) into v_pending_count
  from public.media_cleanup_outbox
  where user_id = v_user_id
    and bucket = 'equora-media'
    and completed_at is null
    and not_before > now();

  select count(*) into v_recent_count
  from public.media_cleanup_outbox
  where user_id = v_user_id
    and bucket = 'equora-media'
    and created_at >= now() - interval '1 minute';

  if v_pending_count + v_path_count > 24
    or v_recent_count + v_path_count > 24 then
    raise exception 'UPLOAD_INTENT_QUOTA_EXCEEDED';
  end if;

  insert into public.media_cleanup_outbox (
    user_id, bucket, storage_path, created_at, attempts,
    last_attempt_at, last_error, not_before, completed_at
  )
  select
    v_user_id, 'equora-media', path, now(), 0,
    null, 'upload_intent_pending', now() + interval '30 minutes', null
  from unnest(v_paths) as path
  on conflict (bucket, storage_path) do update
  set user_id = excluded.user_id,
      created_at = excluded.created_at,
      attempts = 0,
      last_attempt_at = null,
      last_error = excluded.last_error,
      not_before = excluded.not_before,
      completed_at = null;

  return v_path_count;
end;
$$;

revoke all on function public.equora_register_media_upload_intents_v1(text, uuid, text[]) from public, anon;
grant execute on function public.equora_register_media_upload_intents_v1(text, uuid, text[]) to authenticated;

create or replace function public.equora_enqueue_media_cleanup_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.storage_path is null or btrim(old.storage_path) = '' then
    return old;
  end if;

  insert into public.media_cleanup_outbox (
    user_id,
    bucket,
    storage_path,
    created_at,
    attempts,
    last_attempt_at,
    last_error,
    not_before,
    completed_at
  )
  values (
    old.user_id,
    'equora-media',
    old.storage_path,
    now(),
    0,
    null,
    null,
    now(),
    null
  )
  on conflict (bucket, storage_path) do update
  set user_id = excluded.user_id,
      created_at = excluded.created_at,
      attempts = 0,
      last_attempt_at = null,
      last_error = null,
      not_before = now(),
      completed_at = null;

  return old;
end;
$$;

revoke all on function public.equora_enqueue_media_cleanup_v1() from public, anon, authenticated;

create or replace function public.equora_has_pending_upload_intent_v1(
  p_path text,
  p_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_user_id = auth.uid()
    and exists (
      select 1 from public.media_cleanup_outbox
      where user_id = p_user_id
        and bucket = 'equora-media'
        and storage_path = p_path
        and completed_at is null
        and not_before > now()
    ),
    false
  );
$$;

revoke all on function public.equora_has_pending_upload_intent_v1(text, uuid) from public, anon;
grant execute on function public.equora_has_pending_upload_intent_v1(text, uuid) to authenticated;

drop policy if exists "users can upload own equora media" on storage.objects;
drop policy if exists "users can update own equora media" on storage.objects;
drop policy if exists "users can delete own equora media" on storage.objects;
create policy "users can upload own equora media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'equora-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.equora_has_pending_upload_intent_v1(name, (select auth.uid()))
);

drop trigger if exists equora_trade_media_cleanup_v1 on public.trade_media;
create trigger equora_trade_media_cleanup_v1
after delete on public.trade_media
for each row execute function public.equora_enqueue_media_cleanup_v1();

drop trigger if exists equora_setup_media_cleanup_v1 on public.setup_media;
create trigger equora_setup_media_cleanup_v1
after delete on public.setup_media
for each row execute function public.equora_enqueue_media_cleanup_v1();

-- ---------------------------------------------------------------------------
-- Shared validation helpers
-- ---------------------------------------------------------------------------

create or replace function public.equora_owned_media_path_v1(
  p_path text,
  p_user_id uuid,
  p_kind text,
  p_parent_id uuid
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_path ~ (
      '^'
      || p_user_id::text
      || '/'
      || case when p_kind = 'trade' then 'trades' else 'setups' end
      || '/'
      || p_parent_id::text
      || '/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$'
    )
    and p_kind in ('trade', 'setup'),
    false
  );
$$;

revoke all on function public.equora_owned_media_path_v1(text, uuid, text, uuid) from public, anon;
grant execute on function public.equora_owned_media_path_v1(text, uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic trade create and update
-- ---------------------------------------------------------------------------

alter table public.shared_trade_submissions add column if not exists shared_currency text;
alter table public.shared_trade_submissions drop constraint if exists shared_trade_submissions_currency_supported_v57601;
alter table public.shared_trade_submissions add constraint shared_trade_submissions_currency_supported_v57601
  check (shared_currency is null or shared_currency in ('EUR', 'USD', 'GBP', 'USDT', 'USDC')) not valid;

-- New and updated rows must be explicit about supported money units. These
-- constraints are NOT VALID on purpose: legacy rows remain readable until a
-- reviewed remediation assigns their real currency, while every future write
-- is still checked by PostgreSQL.
alter table public.trades drop constraint if exists trades_account_currency_supported_v57601;
alter table public.trades add constraint trades_account_currency_supported_v57601
  check (
    account_currency is null
    or account_currency in ('EUR', 'USD', 'GBP', 'USDT', 'USDC')
  ) not valid;

alter table public.trades drop constraint if exists trades_monetary_values_require_currency_v57601;
alter table public.trades add constraint trades_monetary_values_require_currency_v57601
  check (
    (
      net_pnl is null
      and account_size is null
      and fees is null
      and exchange_fees is null
      and funding_fees is null
      and spread_cost is null
      and slippage is null
      and risk_amount is null
    )
    or account_currency in ('EUR', 'USD', 'GBP', 'USDT', 'USDC')
  ) not valid;

create or replace function public.equora_create_trade_v1(
  p_trade_id uuid,
  p_trade jsonb,
  p_tags text[] default '{}'::text[],
  p_setup_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_market text := nullif(btrim(p_trade->>'market'), '');
  v_setup text := nullif(btrim(p_trade->>'setup'), '');
  v_currency text := upper(nullif(btrim(p_trade->>'account_currency'), ''));
  v_existing_user uuid;
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_trade_id is null or v_market is null or v_setup is null then raise exception 'INVALID_INPUT'; end if;

  select user_id into v_existing_user from public.trades where id = p_trade_id;
  if found then
    if v_existing_user = v_user_id then
      return jsonb_build_object('tradeId', p_trade_id, 'alreadyApplied', true);
    end if;
    raise exception 'NOT_FOUND_OR_FORBIDDEN';
  end if;

  if v_currency is not null and v_currency not in ('EUR', 'USD', 'GBP', 'USDT', 'USDC') then
    raise exception 'INVALID_CURRENCY';
  end if;
  if v_currency is null and coalesce(
    nullif(p_trade->>'net_pnl', ''),
    nullif(p_trade->>'fees', ''),
    nullif(p_trade->>'exchange_fees', ''),
    nullif(p_trade->>'funding_fees', ''),
    nullif(p_trade->>'spread_cost', ''),
    nullif(p_trade->>'slippage', ''),
    nullif(p_trade->>'account_size', ''),
    nullif(p_trade->>'risk_amount', '')
  ) is not null then
    raise exception 'CURRENCY_REQUIRED';
  end if;

  if p_setup_id is not null and not exists (
    select 1 from public.setups where id = p_setup_id and user_id = v_user_id
  ) then
    raise exception 'INVALID_SETUP';
  end if;
  if nullif(p_trade->>'user_cost_profile_id', '') is not null and not exists (
    select 1 from public.user_cost_profiles
    where id = (p_trade->>'user_cost_profile_id')::uuid and user_id = v_user_id
  ) then raise exception 'INVALID_COST_PROFILE'; end if;
  if nullif(p_trade->>'import_batch_id', '') is not null and not exists (
    select 1 from public.trade_import_batches
    where id = (p_trade->>'import_batch_id')::uuid and user_id = v_user_id
  ) then raise exception 'INVALID_IMPORT_BATCH'; end if;

  insert into public.trades (
    id, user_id, created_at, market, setup, emotion, bias, rule_check,
    review_repeatability, review_state, review_lesson, entry, stop_loss,
    take_profit, exit, net_pnl, risk_percent, account_size, partial_exits,
    r_multiple, pnl_mode, cost_profile, broker_profile, instrument_type,
    account_template, account_label, market_template, position_size, point_value, fees,
    exchange_fees, funding_fees, funding_rate_bps, funding_intervals,
    spread_cost, slippage, account_currency, crypto_market_type,
    execution_type, funding_direction, quote_asset, leverage,
    user_cost_profile_id, capture_status, capture_result, captured_at,
    completed_at, import_batch_id, notes, screenshot_url, quality, session,
    concept
  ) values (
    p_trade_id,
    v_user_id,
    coalesce(nullif(p_trade->>'created_at', '')::timestamptz, now()),
    v_market,
    v_setup,
    nullif(p_trade->>'emotion', ''),
    nullif(p_trade->>'bias', ''),
    nullif(p_trade->>'rule_check', ''),
    nullif(p_trade->>'review_repeatability', ''),
    nullif(p_trade->>'review_state', ''),
    nullif(p_trade->>'review_lesson', ''),
    nullif(p_trade->>'entry', '')::numeric,
    nullif(p_trade->>'stop_loss', '')::numeric,
    nullif(p_trade->>'take_profit', '')::numeric,
    nullif(p_trade->>'exit', '')::numeric,
    nullif(p_trade->>'net_pnl', '')::numeric,
    nullif(p_trade->>'risk_percent', '')::numeric,
    nullif(p_trade->>'account_size', '')::numeric,
    case when p_trade->'partial_exits' is null or p_trade->'partial_exits' = 'null'::jsonb then null else p_trade->'partial_exits' end,
    nullif(p_trade->>'r_multiple', '')::numeric,
    nullif(p_trade->>'pnl_mode', ''),
    nullif(p_trade->>'cost_profile', ''),
    nullif(p_trade->>'broker_profile', ''),
    nullif(p_trade->>'instrument_type', ''),
    nullif(p_trade->>'account_template', ''),
    nullif(p_trade->>'account_label', ''),
    nullif(p_trade->>'market_template', ''),
    nullif(p_trade->>'position_size', '')::numeric,
    nullif(p_trade->>'point_value', '')::numeric,
    nullif(p_trade->>'fees', '')::numeric,
    nullif(p_trade->>'exchange_fees', '')::numeric,
    nullif(p_trade->>'funding_fees', '')::numeric,
    nullif(p_trade->>'funding_rate_bps', '')::numeric,
    nullif(p_trade->>'funding_intervals', '')::numeric,
    nullif(p_trade->>'spread_cost', '')::numeric,
    nullif(p_trade->>'slippage', '')::numeric,
    v_currency,
    nullif(p_trade->>'crypto_market_type', ''),
    nullif(p_trade->>'execution_type', ''),
    nullif(p_trade->>'funding_direction', ''),
    nullif(p_trade->>'quote_asset', ''),
    nullif(p_trade->>'leverage', '')::numeric,
    nullif(p_trade->>'user_cost_profile_id', '')::uuid,
    coalesce(nullif(p_trade->>'capture_status', ''), 'complete'),
    nullif(p_trade->>'capture_result', ''),
    coalesce(nullif(p_trade->>'captured_at', '')::timestamptz, now()),
    nullif(p_trade->>'completed_at', '')::timestamptz,
    nullif(p_trade->>'import_batch_id', '')::uuid,
    nullif(p_trade->>'notes', ''),
    null,
    nullif(p_trade->>'quality', ''),
    nullif(p_trade->>'session', ''),
    nullif(p_trade->>'concept', '')
  );

  insert into public.trade_tags (id, trade_id, tag, created_at)
  select gen_random_uuid(), p_trade_id, normalized.tag, now()
  from (
    select distinct btrim(tag) as tag
    from unnest(coalesce(p_tags, '{}'::text[])) as submitted_tag(tag)
    where btrim(tag) <> '' and length(btrim(tag)) <= 80
    limit 50
  ) normalized;

  if p_setup_id is not null then
    insert into public.setup_trade_links (id, setup_id, trade_id, user_id, created_at)
    values (gen_random_uuid(), p_setup_id, p_trade_id, v_user_id, now());
  end if;

  return jsonb_build_object('tradeId', p_trade_id, 'alreadyApplied', false);
end;
$$;

create or replace function public.equora_update_trade_v1(
  p_trade_id uuid,
  p_trade jsonb,
  p_tags text[] default '{}'::text[],
  p_setup_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_currency text := upper(nullif(btrim(p_trade->>'account_currency'), ''));
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_trade_id is null then raise exception 'INVALID_INPUT'; end if;

  perform 1 from public.trades
  where id = p_trade_id and user_id = v_user_id
  for update;
  if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;

  if nullif(btrim(p_trade->>'market'), '') is null or nullif(btrim(p_trade->>'setup'), '') is null then
    raise exception 'INVALID_INPUT';
  end if;
  if v_currency is not null and v_currency not in ('EUR', 'USD', 'GBP', 'USDT', 'USDC') then
    raise exception 'INVALID_CURRENCY';
  end if;
  if v_currency is null and coalesce(
    nullif(p_trade->>'net_pnl', ''),
    nullif(p_trade->>'fees', ''),
    nullif(p_trade->>'exchange_fees', ''),
    nullif(p_trade->>'funding_fees', ''),
    nullif(p_trade->>'spread_cost', ''),
    nullif(p_trade->>'slippage', ''),
    nullif(p_trade->>'account_size', ''),
    nullif(p_trade->>'risk_amount', '')
  ) is not null then
    raise exception 'CURRENCY_REQUIRED';
  end if;
  if p_setup_id is not null and not exists (
    select 1 from public.setups where id = p_setup_id and user_id = v_user_id
  ) then
    raise exception 'INVALID_SETUP';
  end if;
  if nullif(p_trade->>'user_cost_profile_id', '') is not null and not exists (
    select 1 from public.user_cost_profiles
    where id = (p_trade->>'user_cost_profile_id')::uuid and user_id = v_user_id
  ) then raise exception 'INVALID_COST_PROFILE'; end if;
  if nullif(p_trade->>'import_batch_id', '') is not null and not exists (
    select 1 from public.trade_import_batches
    where id = (p_trade->>'import_batch_id')::uuid and user_id = v_user_id
  ) then raise exception 'INVALID_IMPORT_BATCH'; end if;

  update public.trades set
    market = btrim(p_trade->>'market'),
    setup = btrim(p_trade->>'setup'),
    emotion = nullif(p_trade->>'emotion', ''),
    bias = nullif(p_trade->>'bias', ''),
    rule_check = nullif(p_trade->>'rule_check', ''),
    review_repeatability = nullif(p_trade->>'review_repeatability', ''),
    review_state = nullif(p_trade->>'review_state', ''),
    review_lesson = nullif(p_trade->>'review_lesson', ''),
    entry = nullif(p_trade->>'entry', '')::numeric,
    stop_loss = nullif(p_trade->>'stop_loss', '')::numeric,
    take_profit = nullif(p_trade->>'take_profit', '')::numeric,
    exit = nullif(p_trade->>'exit', '')::numeric,
    net_pnl = nullif(p_trade->>'net_pnl', '')::numeric,
    risk_percent = nullif(p_trade->>'risk_percent', '')::numeric,
    account_size = nullif(p_trade->>'account_size', '')::numeric,
    partial_exits = case when p_trade->'partial_exits' is null or p_trade->'partial_exits' = 'null'::jsonb then null else p_trade->'partial_exits' end,
    r_multiple = nullif(p_trade->>'r_multiple', '')::numeric,
    pnl_mode = nullif(p_trade->>'pnl_mode', ''),
    cost_profile = nullif(p_trade->>'cost_profile', ''),
    broker_profile = nullif(p_trade->>'broker_profile', ''),
    instrument_type = nullif(p_trade->>'instrument_type', ''),
    account_template = nullif(p_trade->>'account_template', ''),
    account_label = coalesce(nullif(p_trade->>'account_label', ''), account_label),
    market_template = nullif(p_trade->>'market_template', ''),
    position_size = nullif(p_trade->>'position_size', '')::numeric,
    point_value = nullif(p_trade->>'point_value', '')::numeric,
    fees = nullif(p_trade->>'fees', '')::numeric,
    exchange_fees = nullif(p_trade->>'exchange_fees', '')::numeric,
    funding_fees = nullif(p_trade->>'funding_fees', '')::numeric,
    funding_rate_bps = nullif(p_trade->>'funding_rate_bps', '')::numeric,
    funding_intervals = nullif(p_trade->>'funding_intervals', '')::numeric,
    spread_cost = nullif(p_trade->>'spread_cost', '')::numeric,
    slippage = nullif(p_trade->>'slippage', '')::numeric,
    account_currency = v_currency,
    crypto_market_type = nullif(p_trade->>'crypto_market_type', ''),
    execution_type = nullif(p_trade->>'execution_type', ''),
    funding_direction = nullif(p_trade->>'funding_direction', ''),
    quote_asset = nullif(p_trade->>'quote_asset', ''),
    leverage = nullif(p_trade->>'leverage', '')::numeric,
    user_cost_profile_id = nullif(p_trade->>'user_cost_profile_id', '')::uuid,
    capture_status = coalesce(nullif(p_trade->>'capture_status', ''), 'complete'),
    capture_result = nullif(p_trade->>'capture_result', ''),
    captured_at = coalesce(nullif(p_trade->>'captured_at', '')::timestamptz, captured_at),
    completed_at = nullif(p_trade->>'completed_at', '')::timestamptz,
    notes = nullif(p_trade->>'notes', ''),
    screenshot_url = null,
    quality = nullif(p_trade->>'quality', ''),
    session = nullif(p_trade->>'session', ''),
    concept = nullif(p_trade->>'concept', '')
  where id = p_trade_id and user_id = v_user_id;

  delete from public.trade_tags where trade_id = p_trade_id;
  insert into public.trade_tags (id, trade_id, tag, created_at)
  select gen_random_uuid(), p_trade_id, normalized.tag, now()
  from (
    select distinct btrim(tag) as tag
    from unnest(coalesce(p_tags, '{}'::text[])) as submitted_tag(tag)
    where btrim(tag) <> '' and length(btrim(tag)) <= 80
    limit 50
  ) normalized;

  delete from public.setup_trade_links where trade_id = p_trade_id and user_id = v_user_id;
  if p_setup_id is not null then
    insert into public.setup_trade_links (id, setup_id, trade_id, user_id, created_at)
    values (gen_random_uuid(), p_setup_id, p_trade_id, v_user_id, now());
  end if;

  return jsonb_build_object('tradeId', p_trade_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic trade media and delete operations
-- ---------------------------------------------------------------------------

create or replace function public.equora_upsert_trade_media_v1(
  p_trade_id uuid,
  p_media jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_path text;
  v_count integer := 0;
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if jsonb_typeof(coalesce(p_media, '[]'::jsonb)) <> 'array' then raise exception 'INVALID_INPUT'; end if;
  if jsonb_array_length(coalesce(p_media, '[]'::jsonb)) > 12 then raise exception 'TOO_MANY_MEDIA_ITEMS'; end if;

  perform 1 from public.trades where id = p_trade_id and user_id = v_user_id for update;
  if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_media, '[]'::jsonb))
  loop
    v_path := nullif(btrim(v_item->>'storagePath'), '');
    if not public.equora_owned_media_path_v1(v_path, v_user_id, 'trade', p_trade_id) then
      raise exception 'INVALID_MEDIA_PATH';
    end if;
    if coalesce(nullif(v_item->>'byteSize', '')::integer, 0) < 0
       or coalesce(nullif(v_item->>'byteSize', '')::integer, 0) > 10485760 then
      raise exception 'INVALID_MEDIA_SIZE';
    end if;
    if nullif(v_item->>'mimeType', '') is not null
       and v_item->>'mimeType' not in ('image/png', 'image/jpeg', 'image/webp') then
      raise exception 'INVALID_MEDIA_TYPE';
    end if;

    insert into public.trade_media (
      id, trade_id, user_id, created_at, storage_path, public_url,
      file_name, mime_type, byte_size, sort_order, is_primary
    ) values (
      coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()),
      p_trade_id,
      v_user_id,
      coalesce(nullif(v_item->>'createdAt', '')::timestamptz, now()),
      v_path,
      '',
      nullif(v_item->>'fileName', ''),
      nullif(v_item->>'mimeType', ''),
      nullif(v_item->>'byteSize', '')::integer,
      v_count,
      v_count = 0
    )
    on conflict (trade_id, storage_path) do update
    set file_name = excluded.file_name,
        mime_type = excluded.mime_type,
        byte_size = excluded.byte_size,
        sort_order = excluded.sort_order,
        is_primary = excluded.is_primary,
        public_url = '';

    v_count := v_count + 1;
  end loop;

  update public.trade_media
  set is_primary = false
  where trade_id = p_trade_id
    and user_id = v_user_id
    and storage_path not in (
      select value->>'storagePath'
      from jsonb_array_elements(coalesce(p_media, '[]'::jsonb))
    );

  update public.trades set screenshot_url = null where id = p_trade_id and user_id = v_user_id;
  return jsonb_build_object('tradeId', p_trade_id, 'mediaCount', v_count);
end;
$$;

create or replace function public.equora_remove_trade_media_v1(
  p_trade_id uuid,
  p_media_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_path text;
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  perform 1 from public.trades where id = p_trade_id and user_id = v_user_id for update;
  if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;

  delete from public.trade_media
  where id = p_media_id and trade_id = p_trade_id and user_id = v_user_id
  returning storage_path into v_path;

  if v_path is null then
    return jsonb_build_object('removed', false, 'alreadyAbsent', true);
  end if;

  with ordered as (
    select id, row_number() over (order by sort_order asc, created_at asc, id asc) - 1 as new_order
    from public.trade_media
    where trade_id = p_trade_id and user_id = v_user_id
  )
  update public.trade_media media
  set sort_order = ordered.new_order,
      is_primary = ordered.new_order = 0
  from ordered
  where media.id = ordered.id;

  update public.trades set screenshot_url = null where id = p_trade_id and user_id = v_user_id;
  return jsonb_build_object('removed', true, 'storagePath', v_path);
end;
$$;

create or replace function public.equora_delete_trade_v1(p_trade_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_paths text[] := '{}'::text[];
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  perform 1 from public.trades where id = p_trade_id and user_id = v_user_id for update;
  if not found then
    return jsonb_build_object('deleted', false, 'alreadyAbsent', true, 'storagePaths', to_jsonb(v_paths));
  end if;

  select coalesce(array_agg(storage_path order by storage_path), '{}'::text[])
  into v_paths
  from public.trade_media
  where trade_id = p_trade_id and user_id = v_user_id;

  delete from public.trades where id = p_trade_id and user_id = v_user_id;
  return jsonb_build_object('deleted', true, 'storagePaths', to_jsonb(v_paths));
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic setup persistence and delete
-- ---------------------------------------------------------------------------

create or replace function public.equora_save_setup_v1(
  p_setup_id uuid,
  p_setup jsonb,
  p_media jsonb default '[]'::jsonb,
  p_linked_trade_ids uuid[] default '{}'::uuid[],
  p_is_update boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_path text;
  v_count integer := 0;
  v_is_master boolean := case when p_setup ? 'is_master' then (p_setup->>'is_master')::boolean else null end;
  v_existing_master boolean := false;
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_setup_id is null or nullif(btrim(p_setup->>'title'), '') is null then raise exception 'INVALID_INPUT'; end if;
  if jsonb_typeof(coalesce(p_media, '[]'::jsonb)) <> 'array' then raise exception 'INVALID_INPUT'; end if;
  if jsonb_array_length(coalesce(p_media, '[]'::jsonb)) > 12 then raise exception 'TOO_MANY_MEDIA_ITEMS'; end if;

  if p_is_update then
    select is_master into v_existing_master
    from public.setups where id = p_setup_id and user_id = v_user_id for update;
    if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;
    v_is_master := coalesce(v_is_master, v_existing_master, false);
    if v_is_master and not public.is_equora_admin(v_user_id) then raise exception 'NOT_AUTHORIZED'; end if;
    update public.setups set
      title = btrim(p_setup->>'title'),
      category = coalesce(nullif(p_setup->>'category', ''), 'Custom'),
      description = nullif(p_setup->>'description', ''),
      entry = nullif(p_setup->>'entry', ''),
      exit = nullif(p_setup->>'exit', ''),
      invalidation = nullif(p_setup->>'invalidation', ''),
      playbook = nullif(p_setup->>'playbook', ''),
      checklist = coalesce(array(select jsonb_array_elements_text(coalesce(p_setup->'checklist', '[]'::jsonb))), '{}'::text[]),
      mistakes = coalesce(array(select jsonb_array_elements_text(coalesce(p_setup->'mistakes', '[]'::jsonb))), '{}'::text[]),
      cover_image_url = null,
      is_archived = coalesce((p_setup->>'is_archived')::boolean, false),
      is_master = v_is_master,
      sort_order = coalesce(nullif(p_setup->>'sort_order', '')::integer, 0),
      updated_at = now()
    where id = p_setup_id and user_id = v_user_id;
  else
    v_is_master := coalesce(v_is_master, false);
    if v_is_master and not public.is_equora_admin(v_user_id) then raise exception 'NOT_AUTHORIZED'; end if;
    if exists (select 1 from public.setups where id = p_setup_id) then raise exception 'CONFLICT'; end if;
    insert into public.setups (
      id, user_id, title, category, description, entry, exit, invalidation,
      playbook, checklist, mistakes, cover_image_url, sort_order, is_archived,
      is_master, created_at, updated_at
    ) values (
      p_setup_id,
      v_user_id,
      btrim(p_setup->>'title'),
      coalesce(nullif(p_setup->>'category', ''), 'Custom'),
      nullif(p_setup->>'description', ''),
      nullif(p_setup->>'entry', ''),
      nullif(p_setup->>'exit', ''),
      nullif(p_setup->>'invalidation', ''),
      nullif(p_setup->>'playbook', ''),
      coalesce(array(select jsonb_array_elements_text(coalesce(p_setup->'checklist', '[]'::jsonb))), '{}'::text[]),
      coalesce(array(select jsonb_array_elements_text(coalesce(p_setup->'mistakes', '[]'::jsonb))), '{}'::text[]),
      null,
      coalesce(nullif(p_setup->>'sort_order', '')::integer, 0),
      coalesce((p_setup->>'is_archived')::boolean, false),
      v_is_master,
      now(),
      now()
    );
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_media, '[]'::jsonb))
  loop
    v_path := nullif(btrim(v_item->>'storagePath'), '');
    if not public.equora_owned_media_path_v1(v_path, v_user_id, 'setup', p_setup_id) then
      raise exception 'INVALID_MEDIA_PATH';
    end if;
    if coalesce(nullif(v_item->>'byteSize', '')::integer, 0) < 0
       or coalesce(nullif(v_item->>'byteSize', '')::integer, 0) > 10485760 then
      raise exception 'INVALID_MEDIA_SIZE';
    end if;
    if nullif(v_item->>'mimeType', '') is not null
       and v_item->>'mimeType' not in ('image/png', 'image/jpeg', 'image/webp') then
      raise exception 'INVALID_MEDIA_TYPE';
    end if;

    insert into public.setup_media (
      id, setup_id, user_id, created_at, storage_path, public_url,
      file_name, mime_type, byte_size, sort_order, is_cover, caption, media_role
    ) values (
      coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()),
      p_setup_id,
      v_user_id,
      coalesce(nullif(v_item->>'createdAt', '')::timestamptz, now()),
      v_path,
      '',
      nullif(v_item->>'fileName', ''),
      nullif(v_item->>'mimeType', ''),
      nullif(v_item->>'byteSize', '')::integer,
      v_count,
      coalesce((v_item->>'isCover')::boolean, v_count = 0),
      nullif(v_item->>'caption', ''),
      coalesce(nullif(v_item->>'mediaRole', ''), 'example')
    )
    on conflict (setup_id, storage_path) do update
    set file_name = excluded.file_name,
        mime_type = excluded.mime_type,
        byte_size = excluded.byte_size,
        sort_order = excluded.sort_order,
        is_cover = excluded.is_cover,
        caption = excluded.caption,
        media_role = excluded.media_role,
        public_url = '';
    v_count := v_count + 1;
  end loop;

  delete from public.setup_media
  where setup_id = p_setup_id and user_id = v_user_id
    and storage_path not in (
      select value->>'storagePath'
      from jsonb_array_elements(coalesce(p_media, '[]'::jsonb))
    );

  delete from public.setup_trade_links where setup_id = p_setup_id and user_id = v_user_id;
  if exists (
    select 1 from unnest(coalesce(p_linked_trade_ids, '{}'::uuid[])) as linked_trade(trade_id)
    where not exists (
      select 1 from public.trades
      where id = trade_id and user_id = v_user_id
    )
  ) then
    raise exception 'INVALID_LINKED_TRADE';
  end if;

  insert into public.setup_trade_links (id, setup_id, trade_id, user_id, created_at)
  select gen_random_uuid(), p_setup_id, trade_id, v_user_id, now()
  from (select distinct unnest(coalesce(p_linked_trade_ids, '{}'::uuid[])) as trade_id) linked;

  return jsonb_build_object('setupId', p_setup_id, 'mediaCount', v_count);
end;
$$;

create or replace function public.equora_delete_setup_v1(p_setup_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_paths text[] := '{}'::text[];
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  perform 1 from public.setups where id = p_setup_id and user_id = v_user_id for update;
  if not found then
    return jsonb_build_object('deleted', false, 'alreadyAbsent', true, 'storagePaths', to_jsonb(v_paths));
  end if;
  select coalesce(array_agg(storage_path order by storage_path), '{}'::text[])
  into v_paths from public.setup_media
  where setup_id = p_setup_id and user_id = v_user_id;
  delete from public.setups where id = p_setup_id and user_id = v_user_id;
  return jsonb_build_object('deleted', true, 'storagePaths', to_jsonb(v_paths));
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic CSV import and undo
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.trade_import_batches where user_id is null) then
    raise exception 'IMPORT_BATCH_OWNER_RECONCILIATION_REQUIRED';
  end if;
end;
$$;

alter table public.trade_import_batches alter column user_id set not null;
alter table public.trade_import_batches enable row level security;

drop policy if exists "users can read own trade import batches" on public.trade_import_batches;
drop policy if exists "users can insert own trade import batches" on public.trade_import_batches;
drop policy if exists "users can update own trade import batches" on public.trade_import_batches;
drop policy if exists "users can delete own trade import batches" on public.trade_import_batches;
create policy "users can read own trade import batches"
  on public.trade_import_batches for select to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on table public.trade_import_batches from anon, authenticated;
grant select on table public.trade_import_batches to authenticated;

drop policy if exists "users can read own setup trade links" on public.setup_trade_links;
drop policy if exists "users can insert own setup trade links" on public.setup_trade_links;
drop policy if exists "users can update own setup trade links" on public.setup_trade_links;
drop policy if exists "users can delete own setup trade links" on public.setup_trade_links;
create policy "users can read own setup trade links" on public.setup_trade_links
  for select to authenticated using (
    (select auth.uid()) = user_id
    and exists (select 1 from public.setups where id = setup_id and user_id = (select auth.uid()))
    and exists (select 1 from public.trades where id = trade_id and user_id = (select auth.uid()))
  );
create policy "users can insert own setup trade links" on public.setup_trade_links
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.setups where id = setup_id and user_id = (select auth.uid()))
    and exists (select 1 from public.trades where id = trade_id and user_id = (select auth.uid()))
  );
create policy "users can update own setup trade links" on public.setup_trade_links
  for update to authenticated using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.setups where id = setup_id and user_id = (select auth.uid()))
    and exists (select 1 from public.trades where id = trade_id and user_id = (select auth.uid()))
  );
create policy "users can delete own setup trade links" on public.setup_trade_links
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.equora_import_trades_v1(
  p_batch_id uuid,
  p_batch jsonb,
  p_trades jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_entry jsonb;
  v_trade jsonb;
  v_tags text[];
  v_trade_id uuid;
  v_imported integer := 0;
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_batch_id is null or jsonb_typeof(coalesce(p_trades, '[]'::jsonb)) <> 'array' then raise exception 'INVALID_INPUT'; end if;

  if exists (select 1 from public.trade_import_batches where id = p_batch_id and user_id = v_user_id) then
    return jsonb_build_object('batchId', p_batch_id, 'alreadyApplied', true);
  end if;
  if exists (select 1 from public.trade_import_batches where id = p_batch_id) then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;

  insert into public.trade_import_batches (
    id, user_id, created_at, file_name, preset_key, preset_label, account_label,
    imported_count, duplicate_count, skipped_count, trust_score, trust_label,
    warnings, status, reverted_at
  ) values (
    p_batch_id,
    v_user_id,
    now(),
    nullif(p_batch->>'file_name', ''),
    nullif(p_batch->>'preset_key', ''),
    nullif(p_batch->>'preset_label', ''),
    nullif(p_batch->>'account_label', ''),
    0,
    coalesce(nullif(p_batch->>'duplicate_count', '')::integer, 0),
    coalesce(nullif(p_batch->>'skipped_count', '')::integer, 0),
    nullif(p_batch->>'trust_score', '')::numeric,
    nullif(p_batch->>'trust_label', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_batch->'warnings', '[]'::jsonb))), '{}'::text[]),
    'active',
    null
  );

  for v_entry in select value from jsonb_array_elements(coalesce(p_trades, '[]'::jsonb))
  loop
    v_trade := coalesce(v_entry->'trade', '{}'::jsonb) || jsonb_build_object('import_batch_id', p_batch_id);
    v_trade_id := nullif(v_trade->>'id', '')::uuid;
    v_tags := coalesce(array(select jsonb_array_elements_text(coalesce(v_entry->'tags', '[]'::jsonb))), '{}'::text[]);
    perform public.equora_create_trade_v1(v_trade_id, v_trade, v_tags, null);
    v_imported := v_imported + 1;
  end loop;

  update public.trade_import_batches
  set imported_count = v_imported
  where id = p_batch_id and user_id = v_user_id;

  return jsonb_build_object('batchId', p_batch_id, 'importedCount', v_imported, 'alreadyApplied', false);
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
    return jsonb_build_object('reverted', false, 'alreadyReverted', true, 'deletedCount', 0, 'storagePaths', to_jsonb(v_paths));
  end if;

  select coalesce(array_agg(media.storage_path order by media.storage_path), '{}'::text[])
  into v_paths
  from public.trade_media media
  join public.trades trade on trade.id = media.trade_id
  where trade.user_id = v_user_id and trade.import_batch_id = p_batch_id;

  delete from public.trades
  where user_id = v_user_id and import_batch_id = p_batch_id;
  get diagnostics v_deleted = row_count;

  update public.trade_import_batches
  set status = 'reverted', reverted_at = now()
  where id = p_batch_id and user_id = v_user_id;

  return jsonb_build_object('reverted', true, 'deletedCount', v_deleted, 'storagePaths', to_jsonb(v_paths));
end;
$$;

-- ---------------------------------------------------------------------------
-- Atomic broker connection + credential deletion
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from public.broker_connections connection
    left join public.broker_credentials credential
      on credential.id::text = connection.credential_reference
     and credential.user_id = connection.user_id
    where connection.credential_reference is not null
      and (credential.id is null or connection.credential_reference !~* '^[0-9a-f-]{36}$')
  ) then
    raise exception 'BROKER_CREDENTIAL_REFERENCE_INCONSISTENT';
  end if;
end;
$$;

alter table public.broker_connections
  alter column credential_reference type uuid
  using nullif(credential_reference, '')::uuid;

alter table public.broker_connections
  drop constraint if exists broker_connections_credential_reference_fkey;
alter table public.broker_connections
  add constraint broker_connections_credential_reference_fkey
  foreign key (credential_reference)
  references public.broker_credentials(id)
  on delete restrict;

alter table public.broker_connections
  drop constraint if exists broker_connections_ready_credential_check;
alter table public.broker_connections
  add constraint broker_connections_ready_credential_check
  check (status <> 'ready' or credential_reference is not null);

create unique index if not exists broker_connections_credential_reference_unique
  on public.broker_connections (credential_reference)
  where credential_reference is not null;

drop policy if exists "users can insert own broker connections" on public.broker_connections;
drop policy if exists "users can update own broker connections" on public.broker_connections;
drop policy if exists "users can delete own broker connections" on public.broker_connections;
revoke insert, update, delete on table public.broker_connections from anon, authenticated;
grant select on table public.broker_connections to authenticated;

create or replace function public.delete_own_broker_connection(p_connection_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_credential_id uuid;
  v_deleted integer;
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;

  select credential_reference into v_credential_id
  from public.broker_connections
  where id = p_connection_id and user_id = v_user_id
  for update;
  if not found then raise exception 'NOT_FOUND_OR_FORBIDDEN'; end if;

  if v_credential_id is not null then
    perform 1 from public.broker_credentials
    where id = v_credential_id and user_id = v_user_id
    for update;
    if not found then raise exception 'CREDENTIAL_NOT_FOUND'; end if;
  end if;

  delete from public.broker_connections
  where id = p_connection_id and user_id = v_user_id;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then raise exception 'CONNECTION_DELETE_FAILED'; end if;

  if v_credential_id is not null then
    delete from public.broker_credentials
    where id = v_credential_id and user_id = v_user_id;
    get diagnostics v_deleted = row_count;
    if v_deleted <> 1 then raise exception 'CREDENTIAL_DELETE_FAILED'; end if;
  end if;

  return true;
end;
$$;

create or replace function public.equora_create_broker_connection_service_v1(
  p_connection_id uuid,
  p_credential_id uuid,
  p_user_id uuid,
  p_provider text,
  p_account_label text,
  p_encrypted_payload text,
  p_key_version text,
  p_now timestamptz
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_connection_id is null or p_credential_id is null or p_user_id is null then raise exception 'INVALID_INPUT'; end if;
  if p_provider <> 'mexc' or btrim(coalesce(p_encrypted_payload, '')) = '' then raise exception 'INVALID_INPUT'; end if;

  insert into public.broker_credentials (
    id, user_id, provider, encrypted_payload, key_version, created_at, updated_at
  ) values (
    p_credential_id, p_user_id, p_provider, p_encrypted_payload,
    coalesce(nullif(btrim(p_key_version), ''), 'v1'), p_now, p_now
  );

  insert into public.broker_connections (
    id, user_id, provider, account_label, environment, status, permissions,
    sync_mode, credential_reference, last_sync_at, last_error, created_at, updated_at
  ) values (
    p_connection_id, p_user_id, p_provider, nullif(btrim(p_account_label), ''),
    'live', 'ready', array['futures_read_verified', 'read_only_confirmed'],
    'manual', p_credential_id, p_now, null, p_now, p_now
  );

  return p_connection_id;
end;
$$;

create or replace function public.equora_delete_broker_connection_service_v1(
  p_connection_id uuid,
  p_user_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential_id uuid;
begin
  select credential_reference into v_credential_id
  from public.broker_connections
  where id = p_connection_id and user_id = p_user_id
  for update;
  if not found then return false; end if;

  delete from public.broker_connections where id = p_connection_id and user_id = p_user_id;
  if v_credential_id is not null then
    delete from public.broker_credentials where id = v_credential_id and user_id = p_user_id;
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function grants: user RPCs only for authenticated sessions.
-- ---------------------------------------------------------------------------

drop policy if exists "users can insert own review sessions" on public.review_sessions;
revoke insert, update on table public.review_sessions from anon, authenticated;
grant update (title, note, labels, session_status, is_pinned)
  on table public.review_sessions to authenticated;

create or replace function public.equora_save_review_session_v1(
  p_session_id uuid,
  p_trade_ids uuid[],
  p_meta jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_trade_ids uuid[];
  v_trade_count integer;
  v_money_count integer;
  v_unknown_currency_count integer;
  v_currency_count integer;
  v_currency text;
  v_scope text;
  v_winners integer;
  v_losers integer;
  v_breakeven integer;
  v_net_pnl numeric;
  v_average_r numeric;
  v_win_rate numeric;
  v_best_trade_id uuid;
  v_worst_trade_id uuid;
  v_top_tags text[];
  v_title text := btrim(coalesce(p_meta->>'title', ''));
  v_session_type text := coalesce(nullif(btrim(p_meta->>'sessionType'), ''), 'spotlight');
  v_session_status text := coalesce(nullif(btrim(p_meta->>'sessionStatus'), ''), 'open');
begin
  if v_user_id is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_session_id is null or v_title = '' or length(v_title) > 160 then raise exception 'INVALID_INPUT'; end if;
  if v_session_type not in ('spotlight', 'review') then raise exception 'INVALID_SESSION_TYPE'; end if;
  if v_session_status not in ('open', 'watch', 'closed') then raise exception 'INVALID_SESSION_STATUS'; end if;

  select coalesce(array_agg(requested.trade_id order by requested.trade_id), '{}'::uuid[])
  into v_trade_ids
  from (select distinct unnest(coalesce(p_trade_ids, '{}'::uuid[])) as trade_id) requested;

  if cardinality(v_trade_ids) = 0 or cardinality(v_trade_ids) > 2000 then
    raise exception 'INVALID_TRADE_SCOPE';
  end if;

  select count(*)::integer into v_trade_count
  from public.trades
  where user_id = v_user_id and id = any(v_trade_ids);
  if v_trade_count <> cardinality(v_trade_ids) then raise exception 'TRADE_NOT_FOUND_OR_FORBIDDEN'; end if;

  select
    count(*) filter (where net_pnl is not null)::integer,
    count(*) filter (
      where net_pnl is not null
        and (account_currency is null or account_currency not in ('EUR', 'USD', 'GBP', 'USDT', 'USDC'))
    )::integer,
    count(distinct account_currency) filter (
      where net_pnl is not null and account_currency in ('EUR', 'USD', 'GBP', 'USDT', 'USDC')
    )::integer,
    min(account_currency) filter (
      where net_pnl is not null and account_currency in ('EUR', 'USD', 'GBP', 'USDT', 'USDC')
    ),
    count(*) filter (where net_pnl > 0)::integer,
    count(*) filter (where net_pnl < 0)::integer,
    count(*) filter (where net_pnl = 0)::integer,
    coalesce(avg(r_multiple) filter (where r_multiple is not null), 0),
    coalesce(sum(net_pnl), 0)
  into
    v_money_count, v_unknown_currency_count, v_currency_count, v_currency,
    v_winners, v_losers, v_breakeven, v_average_r, v_net_pnl
  from public.trades
  where user_id = v_user_id and id = any(v_trade_ids);

  if v_money_count = 0 then
    v_scope := 'empty';
    v_currency := null;
    v_net_pnl := 0;
  elsif v_unknown_currency_count > 0 then
    v_scope := 'unknown';
    v_currency := null;
    v_net_pnl := 0;
  elsif v_currency_count > 1 then
    v_scope := 'mixed';
    v_currency := null;
    v_net_pnl := 0;
  else
    v_scope := 'single';
  end if;

  v_win_rate := case when v_money_count > 0 then (v_winners::numeric / v_money_count::numeric) * 100 else 0 end;

  if v_scope = 'single' then
    select id into v_best_trade_id from public.trades
      where user_id = v_user_id and id = any(v_trade_ids) and net_pnl is not null
      order by net_pnl desc, id asc limit 1;
    select id into v_worst_trade_id from public.trades
      where user_id = v_user_id and id = any(v_trade_ids) and net_pnl is not null
      order by net_pnl asc, id asc limit 1;
  end if;

  select coalesce(array_agg(ranked.tag order by ranked.usage_count desc, ranked.tag asc), '{}'::text[])
  into v_top_tags
  from (
    select btrim(tag_row.tag) as tag, count(*)::integer as usage_count
    from public.trade_tags tag_row
    join public.trades trade_row on trade_row.id = tag_row.trade_id
    where trade_row.user_id = v_user_id and trade_row.id = any(v_trade_ids) and btrim(tag_row.tag) <> ''
    group by btrim(tag_row.tag)
    order by usage_count desc, tag asc
    limit 8
  ) ranked;

  insert into public.review_sessions (
    id, user_id, title, note, focus_title, focus_description, chips, labels,
    trade_ids, trade_count, visible_trade_count, net_pnl, currency,
    monetary_scope_kind, average_r, win_rate, winners, losers, breakeven,
    top_tags, best_trade_id, worst_trade_id, session_type, session_status,
    is_pinned, period_preset, period_label, period_start, period_end, created_at
  ) values (
    p_session_id, v_user_id, v_title, nullif(btrim(p_meta->>'note'), ''),
    nullif(btrim(p_meta->>'focusTitle'), ''), nullif(btrim(p_meta->>'focusDescription'), ''),
    coalesce(array(select distinct btrim(value) from jsonb_array_elements_text(coalesce(p_meta->'chips', '[]'::jsonb)) as item(value) where btrim(value) <> '' limit 50), '{}'::text[]),
    coalesce(array(select distinct btrim(value) from jsonb_array_elements_text(coalesce(p_meta->'labels', '[]'::jsonb)) as item(value) where btrim(value) <> '' limit 50), '{}'::text[]),
    v_trade_ids, v_trade_count, v_trade_count, v_net_pnl, v_currency,
    v_scope, v_average_r, v_win_rate, v_winners, v_losers, v_breakeven,
    v_top_tags, v_best_trade_id, v_worst_trade_id, v_session_type, v_session_status,
    coalesce((p_meta->>'isPinned')::boolean, false),
    nullif(btrim(p_meta->>'periodPreset'), ''), nullif(btrim(p_meta->>'periodLabel'), ''),
    nullif(p_meta->>'periodStart', '')::timestamptz, nullif(p_meta->>'periodEnd', '')::timestamptz,
    now()
  );

  return p_session_id;
end;
$$;

create or replace function public.equora_add_trade_tags_v1(
  p_trade_id uuid,
  p_tags text[]
) returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_inserted integer := 0;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if coalesce(array_length(p_tags, 1), 0) > 50 then raise exception 'TOO_MANY_TAGS'; end if;
  if exists (select 1 from unnest(coalesce(p_tags, '{}'::text[])) as submitted_tag(tag) where length(btrim(tag)) > 80) then
    raise exception 'TAG_TOO_LONG';
  end if;
  if not exists (
    select 1 from public.trades
    where id = p_trade_id and user_id = auth.uid()
  ) then raise exception 'TRADE_NOT_FOUND'; end if;

  insert into public.trade_tags (id, trade_id, tag, created_at)
  select gen_random_uuid(), p_trade_id, submitted.tag, now()
  from (
    select distinct btrim(value) as tag
    from unnest(coalesce(p_tags, '{}'::text[])) as submitted_value(value)
    where btrim(value) <> ''
  ) as submitted
  on conflict (trade_id, tag) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.equora_replace_trade_tags_v1(
  p_trade_id uuid,
  p_tags text[]
) returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_inserted integer := 0;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if coalesce(array_length(p_tags, 1), 0) > 50 then raise exception 'TOO_MANY_TAGS'; end if;
  if exists (select 1 from unnest(coalesce(p_tags, '{}'::text[])) as submitted_tag(tag) where length(btrim(tag)) > 80) then
    raise exception 'TAG_TOO_LONG';
  end if;
  if not exists (
    select 1 from public.trades
    where id = p_trade_id and user_id = auth.uid()
  ) then raise exception 'TRADE_NOT_FOUND'; end if;

  delete from public.trade_tags where trade_id = p_trade_id;
  insert into public.trade_tags (id, trade_id, tag, created_at)
  select gen_random_uuid(), p_trade_id, submitted.tag, now()
  from (
    select distinct btrim(value) as tag
    from unnest(coalesce(p_tags, '{}'::text[])) as submitted_value(value)
    where btrim(value) <> ''
  ) as submitted;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.equora_bulk_add_trade_tag_v1(
  p_trade_ids uuid[],
  p_tag text
) returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_inserted integer := 0;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if btrim(coalesce(p_tag, '')) = '' then raise exception 'TAG_REQUIRED'; end if;
  if length(btrim(p_tag)) > 80 then raise exception 'TAG_TOO_LONG'; end if;
  if exists (
    select 1
    from (select distinct value as trade_id from unnest(coalesce(p_trade_ids, '{}'::uuid[])) as requested(value)) requested
    left join public.trades trade_row on trade_row.id = requested.trade_id
    where trade_row.id is null or trade_row.user_id <> auth.uid()
  ) then raise exception 'TRADE_NOT_FOUND'; end if;

  insert into public.trade_tags (id, trade_id, tag, created_at)
  select gen_random_uuid(), requested.trade_id, btrim(p_tag), now()
  from (select distinct value as trade_id from unnest(coalesce(p_trade_ids, '{}'::uuid[])) as requested_value(value)) requested
  on conflict (trade_id, tag) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.equora_accept_setup_suggestion_v1(
  p_suggestion_id uuid,
  p_admin_note text default null
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_suggestion public.setup_suggestions%rowtype;
  v_setup_id uuid := gen_random_uuid();
  v_sort_order integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_equora_admin(v_user_id) then raise exception 'ADMIN_REQUIRED'; end if;

  select * into v_suggestion
  from public.setup_suggestions
  where id = p_suggestion_id
  for update;

  if not found then raise exception 'SUGGESTION_NOT_FOUND'; end if;
  if v_suggestion.status <> 'pending' then raise exception 'SUGGESTION_NOT_PENDING'; end if;
  if btrim(coalesce(v_suggestion.title, '')) = '' then raise exception 'TITLE_REQUIRED'; end if;

  select coalesce(max(sort_order), -1) + 1 into v_sort_order
  from public.setups
  where user_id = v_user_id;

  insert into public.setups (
    id, user_id, created_at, updated_at, title, category, description,
    entry, exit, invalidation, playbook, checklist, mistakes,
    cover_image_url, sort_order, is_archived, is_master
  ) values (
    v_setup_id, v_user_id, now(), now(), btrim(v_suggestion.title),
    coalesce(nullif(btrim(v_suggestion.category), ''), 'Community'),
    nullif(btrim(v_suggestion.description), ''),
    nullif(btrim(v_suggestion.entry), ''),
    nullif(btrim(v_suggestion.exit), ''),
    nullif(btrim(v_suggestion.invalidation), ''),
    null, coalesce(v_suggestion.checklist, '{}'::text[]),
    coalesce(v_suggestion.mistakes, '{}'::text[]),
    null, v_sort_order, false, true
  );

  update public.setup_suggestions
  set status = 'accepted',
      admin_note = coalesce(nullif(btrim(p_admin_note), ''), 'Als Master-Setup übernommen.'),
      reviewed_at = now(),
      reviewed_by = auth.jwt() ->> 'email',
      updated_at = now()
  where id = p_suggestion_id;

  return v_setup_id;
end;
$$;

revoke all on function public.equora_create_trade_v1(uuid, jsonb, text[], uuid) from public, anon;
revoke all on function public.equora_update_trade_v1(uuid, jsonb, text[], uuid) from public, anon;
revoke all on function public.equora_upsert_trade_media_v1(uuid, jsonb) from public, anon;
revoke all on function public.equora_remove_trade_media_v1(uuid, uuid) from public, anon;
revoke all on function public.equora_delete_trade_v1(uuid) from public, anon;
revoke all on function public.equora_save_setup_v1(uuid, jsonb, jsonb, uuid[], boolean) from public, anon;
revoke all on function public.equora_delete_setup_v1(uuid) from public, anon;
revoke all on function public.equora_import_trades_v1(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.equora_revert_import_v1(uuid) from public, anon;
revoke all on function public.delete_own_broker_connection(uuid) from public, anon;
revoke all on function public.equora_add_trade_tags_v1(uuid, text[]) from public, anon;
revoke all on function public.equora_replace_trade_tags_v1(uuid, text[]) from public, anon;
revoke all on function public.equora_bulk_add_trade_tag_v1(uuid[], text) from public, anon;
revoke all on function public.equora_accept_setup_suggestion_v1(uuid, text) from public, anon;
revoke all on function public.equora_save_review_session_v1(uuid, uuid[], jsonb) from public, anon;
revoke all on function public.equora_create_broker_connection_service_v1(uuid, uuid, uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.equora_delete_broker_connection_service_v1(uuid, uuid) from public, anon, authenticated;

grant execute on function public.equora_create_trade_v1(uuid, jsonb, text[], uuid) to authenticated;
grant execute on function public.equora_update_trade_v1(uuid, jsonb, text[], uuid) to authenticated;
grant execute on function public.equora_upsert_trade_media_v1(uuid, jsonb) to authenticated;
grant execute on function public.equora_remove_trade_media_v1(uuid, uuid) to authenticated;
grant execute on function public.equora_delete_trade_v1(uuid) to authenticated;
grant execute on function public.equora_save_setup_v1(uuid, jsonb, jsonb, uuid[], boolean) to authenticated;
grant execute on function public.equora_delete_setup_v1(uuid) to authenticated;
grant execute on function public.equora_import_trades_v1(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.equora_revert_import_v1(uuid) to authenticated;
grant execute on function public.delete_own_broker_connection(uuid) to authenticated;
grant execute on function public.equora_add_trade_tags_v1(uuid, text[]) to authenticated;
grant execute on function public.equora_replace_trade_tags_v1(uuid, text[]) to authenticated;
grant execute on function public.equora_bulk_add_trade_tag_v1(uuid[], text) to authenticated;
grant execute on function public.equora_accept_setup_suggestion_v1(uuid, text) to authenticated;
grant execute on function public.equora_save_review_session_v1(uuid, uuid[], jsonb) to authenticated;
grant execute on function public.equora_create_broker_connection_service_v1(uuid, uuid, uuid, text, text, text, text, timestamptz) to service_role;
grant execute on function public.equora_delete_broker_connection_service_v1(uuid, uuid) to service_role;

commit;
