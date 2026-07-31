-- Equora v57.17
-- Setup-Vorschläge: Trader können Setups vorschlagen, Admins prüfen sie.

create table if not exists public.setup_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'pending',
  title text not null,
  category text,
  description text,
  entry text,
  exit text,
  invalidation text,
  checklist text[] not null default '{}'::text[],
  mistakes text[] not null default '{}'::text[],
  admin_note text,
  reviewed_at timestamptz,
  reviewed_by text,
  constraint setup_suggestions_status_check check (status in ('pending', 'accepted', 'rejected', 'archived'))
);

create index if not exists idx_setup_suggestions_user_created_at on public.setup_suggestions (user_id, created_at desc);
create index if not exists idx_setup_suggestions_status_created_at on public.setup_suggestions (status, created_at desc);

alter table public.setup_suggestions enable row level security;

drop policy if exists "users can read own setup suggestions" on public.setup_suggestions;
create policy "users can read own setup suggestions" on public.setup_suggestions
  for select using (auth.uid() = user_id);

drop policy if exists "users can insert own setup suggestions" on public.setup_suggestions;
create policy "users can insert own setup suggestions" on public.setup_suggestions
  for insert with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "users can update own pending setup suggestions" on public.setup_suggestions;
create policy "users can update own pending setup suggestions" on public.setup_suggestions
  for update using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "admins can read setup suggestions" on public.setup_suggestions;
create policy "admins can read setup suggestions" on public.setup_suggestions
  for select using (public.is_equora_admin(auth.uid()));

drop policy if exists "admins can update setup suggestions" on public.setup_suggestions;
create policy "admins can update setup suggestions" on public.setup_suggestions
  for update using (public.is_equora_admin(auth.uid()))
  with check (public.is_equora_admin(auth.uid()));
