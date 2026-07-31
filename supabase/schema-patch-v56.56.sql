create table if not exists public.setup_trade_links (
  id uuid primary key default gen_random_uuid(),
  setup_id uuid not null references public.setups (id) on delete cascade,
  trade_id uuid not null references public.trades (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_setup_trade_links_setup_id on public.setup_trade_links (setup_id);
create index if not exists idx_setup_trade_links_trade_id on public.setup_trade_links (trade_id);
create unique index if not exists idx_setup_trade_links_unique on public.setup_trade_links (setup_id, trade_id);

alter table public.setup_trade_links enable row level security;

create policy "users can read own setup trade links" on public.setup_trade_links for select using (auth.uid() = user_id);
create policy "users can insert own setup trade links" on public.setup_trade_links for insert with check (auth.uid() = user_id);
create policy "users can update own setup trade links" on public.setup_trade_links for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users can delete own setup trade links" on public.setup_trade_links for delete using (auth.uid() = user_id);
