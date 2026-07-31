-- Equora v57.48
-- Import-Verlauf und Import rückgängig machen

create table if not exists public.trade_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  file_name text,
  preset_key text,
  preset_label text,
  account_label text,
  imported_count integer not null default 0,
  duplicate_count integer not null default 0,
  skipped_count integer not null default 0,
  trust_score numeric,
  trust_label text,
  warnings text[] not null default '{}'::text[],
  status text not null default 'active',
  reverted_at timestamptz
);

alter table public.trades
  add column if not exists import_batch_id uuid references public.trade_import_batches(id) on delete set null;

create index if not exists trade_import_batches_user_created_idx
  on public.trade_import_batches(user_id, created_at desc);

create index if not exists trades_import_batch_id_idx
  on public.trades(import_batch_id);

alter table public.trade_import_batches enable row level security;

drop policy if exists "trade_import_batches_select_own" on public.trade_import_batches;
create policy "trade_import_batches_select_own"
  on public.trade_import_batches for select
  using (auth.uid() = user_id);

drop policy if exists "trade_import_batches_insert_own" on public.trade_import_batches;
create policy "trade_import_batches_insert_own"
  on public.trade_import_batches for insert
  with check (auth.uid() = user_id);

drop policy if exists "trade_import_batches_update_own" on public.trade_import_batches;
create policy "trade_import_batches_update_own"
  on public.trade_import_batches for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "trade_import_batches_delete_own" on public.trade_import_batches;
create policy "trade_import_batches_delete_own"
  on public.trade_import_batches for delete
  using (auth.uid() = user_id);
