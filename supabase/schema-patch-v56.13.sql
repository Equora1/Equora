-- Equora schema patch v56.13
-- Für bestehende Projekte: ergänzt Trade-Medien und fehlende Review-Felder,
-- damit Quick Capture, Screenshot-Sync und der Edit-Flow ohne Schema-Fehler laufen.

create extension if not exists pgcrypto;

alter table public.trades add column if not exists review_repeatability text;
alter table public.trades add column if not exists review_state text;
alter table public.trades add column if not exists review_lesson text;
alter table public.trades add column if not exists capture_status text default 'complete';
alter table public.trades add column if not exists capture_result text;
alter table public.trades add column if not exists captured_at timestamptz default now();
alter table public.trades add column if not exists completed_at timestamptz;
alter table public.trades add column if not exists screenshot_url text;

update public.trades
set capture_status = coalesce(capture_status, 'complete')
where capture_status is null;

update public.trades
set captured_at = coalesce(captured_at, created_at, now())
where captured_at is null;

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

create index if not exists idx_trade_media_trade_id_sort on public.trade_media (trade_id, sort_order asc, created_at asc);
create index if not exists idx_trade_media_user_created_at on public.trade_media (user_id, created_at desc);
create unique index if not exists idx_trade_media_trade_storage_unique on public.trade_media (trade_id, storage_path);

alter table public.trade_media enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'trade_media' and policyname = 'users can read own trade media'
  ) then
    create policy "users can read own trade media" on public.trade_media for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'trade_media' and policyname = 'users can insert own trade media'
  ) then
    create policy "users can insert own trade media" on public.trade_media for insert with check (
      auth.uid() = user_id and exists (
        select 1 from public.trades where trades.id = trade_media.trade_id and trades.user_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'trade_media' and policyname = 'users can update own trade media'
  ) then
    create policy "users can update own trade media" on public.trade_media for update using (auth.uid() = user_id) with check (
      auth.uid() = user_id and exists (
        select 1 from public.trades where trades.id = trade_media.trade_id and trades.user_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'trade_media' and policyname = 'users can delete own trade media'
  ) then
    create policy "users can delete own trade media" on public.trade_media for delete using (auth.uid() = user_id);
  end if;
end $$;
