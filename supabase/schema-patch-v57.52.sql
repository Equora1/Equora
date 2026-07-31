-- Equora v57.52
-- Broker Sync / Auto-Journal: sichere Read-only-Grundlage.
-- Wichtig: In diesen Tabellen werden keine API Keys oder Secrets im Klartext gespeichert.

create table if not exists public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  account_label text,
  environment text not null default 'live',
  status text not null default 'draft',
  permissions text[] not null default '{}'::text[],
  sync_mode text not null default 'manual',
  credential_reference text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broker_connections_environment_check check (environment in ('live', 'demo')),
  constraint broker_connections_status_check check (status in ('draft', 'ready', 'paused', 'error', 'revoked')),
  constraint broker_connections_sync_mode_check check (sync_mode in ('manual', 'scheduled'))
);

create table if not exists public.broker_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.broker_connections (id) on delete cascade,
  status text not null default 'pending',
  started_at timestamptz,
  finished_at timestamptz,
  fetched_count integer not null default 0,
  imported_count integer not null default 0,
  duplicate_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint broker_sync_runs_status_check check (status in ('pending', 'running', 'completed', 'partial', 'failed', 'cancelled'))
);

create table if not exists public.broker_raw_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.broker_connections (id) on delete cascade,
  sync_run_id uuid references public.broker_sync_runs (id) on delete set null,
  provider text not null,
  event_type text not null,
  external_event_id text,
  event_fingerprint text not null,
  occurred_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  import_status text not null default 'pending',
  trade_id uuid references public.trades (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint broker_raw_events_import_status_check check (import_status in ('pending', 'imported', 'skipped', 'error'))
);

create index if not exists idx_broker_connections_user_created_at
  on public.broker_connections (user_id, created_at desc);
create index if not exists idx_broker_sync_runs_user_created_at
  on public.broker_sync_runs (user_id, created_at desc);
create index if not exists idx_broker_sync_runs_connection_created_at
  on public.broker_sync_runs (connection_id, created_at desc);
create index if not exists idx_broker_raw_events_user_created_at
  on public.broker_raw_events (user_id, created_at desc);
create index if not exists idx_broker_raw_events_connection_occurred_at
  on public.broker_raw_events (connection_id, occurred_at desc);
create unique index if not exists idx_broker_raw_events_connection_fingerprint_unique
  on public.broker_raw_events (connection_id, event_fingerprint);

alter table public.broker_connections enable row level security;
alter table public.broker_sync_runs enable row level security;
alter table public.broker_raw_events enable row level security;

drop policy if exists "users can read own broker connections" on public.broker_connections;
create policy "users can read own broker connections" on public.broker_connections
  for select using (auth.uid() = user_id);

drop policy if exists "users can insert own broker connections" on public.broker_connections;
create policy "users can insert own broker connections" on public.broker_connections
  for insert with check (auth.uid() = user_id);

drop policy if exists "users can update own broker connections" on public.broker_connections;
create policy "users can update own broker connections" on public.broker_connections
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users can delete own broker connections" on public.broker_connections;
create policy "users can delete own broker connections" on public.broker_connections
  for delete using (auth.uid() = user_id);

drop policy if exists "users can read own broker sync runs" on public.broker_sync_runs;
create policy "users can read own broker sync runs" on public.broker_sync_runs
  for select using (auth.uid() = user_id);

drop policy if exists "users can delete own broker sync runs" on public.broker_sync_runs;
create policy "users can delete own broker sync runs" on public.broker_sync_runs
  for delete using (auth.uid() = user_id);

drop policy if exists "users can read own broker raw events" on public.broker_raw_events;
create policy "users can read own broker raw events" on public.broker_raw_events
  for select using (auth.uid() = user_id);

drop policy if exists "users can delete own broker raw events" on public.broker_raw_events;
create policy "users can delete own broker raw events" on public.broker_raw_events
  for delete using (auth.uid() = user_id);
