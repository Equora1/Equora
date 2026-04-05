create extension if not exists pgcrypto;

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  market text not null,
  setup text not null,
  emotion text,
  bias text,
  rule_check text,
  review_repeatability text,
  review_state text,
  review_lesson text,
  entry numeric,
  stop_loss numeric,
  take_profit numeric,
  exit numeric,
  net_pnl numeric,
  risk_percent numeric,
  account_size numeric,
  partial_exits jsonb,
  r_multiple numeric,
  pnl_mode text,
  cost_profile text,
  position_size numeric,
  point_value numeric,
  fees numeric,
  exchange_fees numeric,
  funding_fees numeric,
  funding_rate_bps numeric,
  funding_intervals numeric,
  spread_cost numeric,
  slippage numeric,
  instrument_type text,
  account_currency text,
  broker_profile text,
  account_template text,
  market_template text,
  crypto_market_type text,
  execution_type text,
  funding_direction text,
  quote_asset text,
  leverage numeric,
  user_cost_profile_id uuid,
  session text,
  concept text,
  screenshot_url text,
  direction text,
  quality text,
  lesson text,
  risk_amount numeric,
  pnl_source_label text,
  r_source_label text,
  execution_label text,
  cost_label text,
  broker_profile_label text,
  cost_profile_label text,
  account_template_label text,
  market_template_label text,
  crypto_label text,
  user_cost_profile_label text,
  notes text,
  capture_status text not null default 'complete',
  capture_result text,
  captured_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.setups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  title text not null,
  category text,
  description text,
  playbook text,
  checklist text[] not null default '{}'::text[],
  mistakes text[] not null default '{}'::text[],
  cover_image_url text,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trade_tags (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades (id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now()
);



create table if not exists public.trade_media (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  storage_path text not null,
  public_url text not null,
  file_name text,
  mime_type text,
  byte_size integer,
  sort_order integer not null default 0,
  is_primary boolean not null default false
);


create table if not exists public.setup_media (
  id uuid primary key default gen_random_uuid(),
  setup_id uuid not null references public.setups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  storage_path text not null,
  public_url text not null,
  file_name text,
  mime_type text,
  byte_size integer,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  caption text,
  media_role text not null default 'example'
);

create table if not exists public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  trade_date date not null,
  title text,
  note text,
  mood text,
  focus text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_cost_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  instrument_type text,
  account_currency text,
  broker_profile text,
  account_template text,
  market_template text,
  crypto_market_type text,
  execution_type text,
  funding_direction text,
  point_value numeric,
  fees numeric,
  exchange_fees numeric,
  funding_fees numeric,
  funding_rate_bps numeric,
  funding_intervals numeric,
  spread_cost numeric,
  slippage numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.review_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  title text not null,
  note text,
  focus_title text,
  focus_description text,
  chips text[] not null default '{}'::text[],
  labels text[] not null default '{}'::text[],
  trade_ids uuid[] not null default '{}'::uuid[],
  trade_count integer,
  visible_trade_count integer,
  net_pnl numeric,
  average_r numeric,
  win_rate numeric,
  winners integer,
  losers integer,
  breakeven integer,
  is_pinned boolean not null default false,
  status text,
  spotlight_title text,
  spotlight_summary text,
  spotlight_tags text[] not null default '{}'::text[],
  exported_markdown text,
  exported_csv text,
  period_preset text,
  period_label text,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.shared_trade_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  trade_id uuid not null references public.trades (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  share_mode text not null default 'review',
  visibility text not null default 'anonymous',
  status text not null default 'pending',
  user_note text,
  admin_note text,
  coach_feedback text,
  learning_category text,
  review_labels text[] not null default '{}'::text[],
  coach_strengths text[] not null default '{}'::text[],
  coach_mistakes text[] not null default '{}'::text[],
  coach_action text,
  vault_blurb text,
  featured_at timestamptz,
  vault_opt_in boolean not null default false,
  submitted_by_name text,
  shared_market text not null,
  shared_setup text not null,
  shared_result text,
  shared_r_multiple numeric,
  shared_net_pnl numeric,
  shared_capture_status text,
  shared_capture_result text,
  shared_notes text,
  shared_quality text,
  shared_tags text[] not null default '{}'::text[],
  shared_screenshot_url text,
  reviewed_at timestamptz,
  reviewed_by text
);

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text,
  role text not null default 'admin',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_equora_admin(_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where admin_users.user_id = _user_id
      and admin_users.is_active = true
  );
$$;

revoke all on function public.is_equora_admin(uuid) from public;
grant execute on function public.is_equora_admin(uuid) to authenticated;

create index if not exists idx_trades_user_created_at on public.trades (user_id, created_at desc);
create index if not exists idx_trade_tags_trade_id on public.trade_tags (trade_id);
create unique index if not exists idx_setups_user_title_unique on public.setups (user_id, title);
create index if not exists idx_trade_media_trade_id_sort on public.trade_media (trade_id, sort_order asc, created_at asc);
create index if not exists idx_trade_media_user_created_at on public.trade_media (user_id, created_at desc);
create index if not exists idx_setup_media_setup_id_sort on public.setup_media (setup_id, sort_order asc, created_at asc);
create index if not exists idx_setup_media_user_created_at on public.setup_media (user_id, created_at desc);
create unique index if not exists idx_setup_media_setup_storage_unique on public.setup_media (setup_id, storage_path);
create unique index if not exists idx_trade_media_trade_storage_unique on public.trade_media (trade_id, storage_path);
create unique index if not exists idx_trade_tags_trade_id_tag_unique on public.trade_tags (trade_id, tag);
create index if not exists idx_daily_notes_user_trade_date on public.daily_notes (user_id, trade_date desc);
create unique index if not exists idx_daily_notes_user_trade_date_unique on public.daily_notes (user_id, trade_date);
create index if not exists idx_review_sessions_user_created_at on public.review_sessions (user_id, created_at desc);
create index if not exists idx_shared_trade_submissions_user_created_at on public.shared_trade_submissions (user_id, created_at desc);
create index if not exists idx_shared_trade_submissions_status_created_at on public.shared_trade_submissions (status, created_at desc);
create index if not exists idx_shared_trade_submissions_featured_at on public.shared_trade_submissions (featured_at desc);
create unique index if not exists idx_shared_trade_submissions_user_trade_unique on public.shared_trade_submissions (user_id, trade_id);
create index if not exists idx_admin_users_user_id on public.admin_users (user_id);
create index if not exists idx_admin_users_email on public.admin_users (email);
create index if not exists idx_user_cost_profiles_user_created_at on public.user_cost_profiles (user_id, created_at desc);
create index if not exists idx_review_sessions_user_pinned_created_at on public.review_sessions (user_id, is_pinned desc, created_at desc);

alter table public.trades enable row level security;
alter table public.setups enable row level security;
alter table public.trade_tags enable row level security;
alter table public.trade_media enable row level security;
alter table public.setup_media enable row level security;
alter table public.daily_notes enable row level security;
alter table public.review_sessions enable row level security;
alter table public.shared_trade_submissions enable row level security;
alter table public.admin_users enable row level security;
alter table public.user_cost_profiles enable row level security;

create policy "users can read own trades" on public.trades for select using (auth.uid() = user_id);
create policy "users can insert own trades" on public.trades for insert with check (auth.uid() = user_id);
create policy "users can update own trades" on public.trades for update using (auth.uid() = user_id);
create policy "users can delete own trades" on public.trades for delete using (auth.uid() = user_id);

create policy "users can read own setups" on public.setups for select using (auth.uid() = user_id);
create policy "users can insert own setups" on public.setups for insert with check (auth.uid() = user_id);
create policy "users can update own setups" on public.setups for update using (auth.uid() = user_id);
create policy "users can delete own setups" on public.setups for delete using (auth.uid() = user_id);

create policy "users can read own trade media" on public.trade_media for select using (auth.uid() = user_id);
create policy "users can insert own trade media" on public.trade_media for insert with check (auth.uid() = user_id and exists (select 1 from public.trades where trades.id = trade_media.trade_id and trades.user_id = auth.uid()));
create policy "users can update own trade media" on public.trade_media for update using (auth.uid() = user_id) with check (auth.uid() = user_id and exists (select 1 from public.trades where trades.id = trade_media.trade_id and trades.user_id = auth.uid()));
create policy "users can delete own trade media" on public.trade_media for delete using (auth.uid() = user_id);

create policy "users can read own setup media" on public.setup_media for select using (auth.uid() = user_id);
create policy "users can insert own setup media" on public.setup_media for insert with check (auth.uid() = user_id and exists (select 1 from public.setups where setups.id = setup_media.setup_id and setups.user_id = auth.uid()));
create policy "users can update own setup media" on public.setup_media for update using (auth.uid() = user_id) with check (auth.uid() = user_id and exists (select 1 from public.setups where setups.id = setup_media.setup_id and setups.user_id = auth.uid()));
create policy "users can delete own setup media" on public.setup_media for delete using (auth.uid() = user_id);

create policy "users can read own daily notes" on public.daily_notes for select using (auth.uid() = user_id);
create policy "users can insert own daily notes" on public.daily_notes for insert with check (auth.uid() = user_id);
create policy "users can update own daily notes" on public.daily_notes for update using (auth.uid() = user_id);
create policy "users can delete own daily notes" on public.daily_notes for delete using (auth.uid() = user_id);

create policy "users can read own review sessions" on public.review_sessions for select using (auth.uid() = user_id);
create policy "users can insert own review sessions" on public.review_sessions for insert with check (auth.uid() = user_id);
create policy "users can update own review sessions" on public.review_sessions for update using (auth.uid() = user_id);
create policy "users can delete own review sessions" on public.review_sessions for delete using (auth.uid() = user_id);

create policy "users can read own shared trade submissions" on public.shared_trade_submissions for select using (auth.uid() = user_id);
create policy "users can insert own shared trade submissions" on public.shared_trade_submissions for insert with check (auth.uid() = user_id);
create policy "users can update own shared trade submissions" on public.shared_trade_submissions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can delete own shared trade submissions" on public.shared_trade_submissions for delete using (auth.uid() = user_id);
create policy "admins can read shared trade submissions" on public.shared_trade_submissions for select using (public.is_equora_admin(auth.uid()));
create policy "admins can update shared trade submissions" on public.shared_trade_submissions for update using (public.is_equora_admin(auth.uid())) with check (public.is_equora_admin(auth.uid()));
create policy "authenticated users can read featured vault submissions" on public.shared_trade_submissions for select using (auth.uid() is not null and status = 'featured' and vault_opt_in = true);

create policy "users can read own admin membership" on public.admin_users for select using (auth.uid() = user_id);
create policy "admins can read admin memberships" on public.admin_users for select using (public.is_equora_admin(auth.uid()));

create policy "users can read own user cost profiles" on public.user_cost_profiles for select using (auth.uid() = user_id);
create policy "users can insert own user cost profiles" on public.user_cost_profiles for insert with check (auth.uid() = user_id);
create policy "users can update own user cost profiles" on public.user_cost_profiles for update using (auth.uid() = user_id);
create policy "users can delete own user cost profiles" on public.user_cost_profiles for delete using (auth.uid() = user_id);

create policy "users can read tags for own trades" on public.trade_tags for select using (exists (select 1 from public.trades where trades.id = trade_tags.trade_id and trades.user_id = auth.uid()));
create policy "users can insert tags for own trades" on public.trade_tags for insert with check (exists (select 1 from public.trades where trades.id = trade_tags.trade_id and trades.user_id = auth.uid()));
create policy "users can update tags for own trades" on public.trade_tags for update using (exists (select 1 from public.trades where trades.id = trade_tags.trade_id and trades.user_id = auth.uid())) with check (exists (select 1 from public.trades where trades.id = trade_tags.trade_id and trades.user_id = auth.uid()));
create policy "users can delete tags for own trades" on public.trade_tags for delete using (exists (select 1 from public.trades where trades.id = trade_tags.trade_id and trades.user_id = auth.uid()));

-- Falls die Tabelle bereits mit text-Feldern existiert, führe zusätzlich einmalig Migrationen aus:
-- alter table public.trades alter column entry type numeric using nullif(entry, '')::numeric;
-- alter table public.trades alter column stop_loss type numeric using nullif(stop_loss, '')::numeric;
-- alter table public.trades alter column take_profit type numeric using nullif(take_profit, '')::numeric;
-- alter table public.trades alter column exit type numeric using nullif(exit, '')::numeric;
-- alter table public.trades add column if not exists net_pnl numeric;
-- alter table public.trades add column if not exists quote_asset text;
-- alter table public.trades add column if not exists leverage numeric;
-- alter table public.trades add column if not exists user_cost_profile_id uuid;
-- alter table public.trades add column if not exists session text;
-- alter table public.trades add column if not exists concept text;
-- alter table public.trades add column if not exists pnl_mode text;
-- alter table public.trades add column if not exists cost_profile text;
-- alter table public.trades add column if not exists instrument_type text;
-- alter table public.trades add column if not exists position_size numeric;
-- alter table public.trades add column if not exists point_value numeric;
-- alter table public.trades add column if not exists fees numeric;
-- alter table public.trades add column if not exists slippage numeric;
-- alter table public.trades add column if not exists account_currency text;
-- alter table public.trades add column if not exists broker_profile text;
-- alter table public.trades add column if not exists account_template text;
-- alter table public.trades add column if not exists market_template text;
-- alter table public.trades alter column risk_percent type numeric using nullif(risk_percent, '')::numeric;
-- alter table public.trades alter column r_multiple type numeric using nullif(regexp_replace(r_multiple, '[^0-9,.-]', '', 'g'), '')::numeric;
-- alter table public.review_sessions add column if not exists labels text[] not null default '{}'::text[];


insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'equora-media',
  'equora-media',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "users can view equora media bucket objects"
on storage.objects for select
using (bucket_id = 'equora-media');

create policy "users can upload own equora media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'equora-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users can update own equora media"
on storage.objects for update to authenticated
using (
  bucket_id = 'equora-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'equora-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "users can delete own equora media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'equora-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);
