\set ON_ERROR_STOP on

-- Disposable schema-only fixture for the verified Hosted upgrade path:
-- Pre-v57.60.1 backup shape followed by schema-patch-v57.60.1.sql. It contains
-- no customer rows, auth identities, credentials, payloads or project values.
-- Apply after schema.sql and before schema-patch-v57.60.1.sql.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$
begin
  if to_regclass('public.trades') is null
    or to_regclass('public.setups') is null
    or to_regclass('public.shared_trade_submissions') is null
    or to_regclass('public.trade_import_batches') is null
  then
    raise exception 'RESTORED_V57601_FIXTURE_BASELINE_MISSING';
  end if;
end;
$$;

drop index if exists public.idx_setup_trade_links_user_created_at;
drop index if exists public.idx_setups_user_sort_title;
drop index if exists public.idx_shared_trade_submissions_featured_at;
drop index if exists public.idx_trade_tags_trade_id_created_at;

alter table public.shared_trade_submissions
  drop column if exists learning_category,
  drop column if exists review_labels,
  drop column if exists coach_strengths,
  drop column if exists coach_mistakes,
  drop column if exists coach_action,
  drop column if exists vault_blurb,
  drop column if exists featured_at;

alter table public.setups
  add column if not exists name text,
  add column if not exists grade text,
  add column if not exists screenshot_url text,
  alter column title set default 'Untitled setup';

alter table public.trades alter column user_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trades'::regclass
      and conname = 'trades_import_batch_id_fkey'
  ) then
    alter table public.trades
      add constraint trades_import_batch_id_fkey
      foreign key (import_batch_id)
      references public.trade_import_batches (id)
      on delete set null;
  end if;
end;
$$;

drop policy if exists "users can read own trade import batches"
  on public.trade_import_batches;
drop policy if exists "authenticated users can read featured vault submissions"
  on public.shared_trade_submissions;

create policy trade_import_batches_delete_own
  on public.trade_import_batches for delete
  using (auth.uid() = user_id);
create policy trade_import_batches_insert_own
  on public.trade_import_batches for insert
  with check (auth.uid() = user_id);
create policy trade_import_batches_select_own
  on public.trade_import_batches for select
  using (auth.uid() = user_id);
create policy trade_import_batches_update_own
  on public.trade_import_batches for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The verified Hosted dump carries Supabase's standard API-role grants and
-- default privileges. broker_credentials remains closed to browser roles.
grant all on all tables in schema public
  to anon, authenticated, service_role;
grant all on all functions in schema public
  to anon, authenticated, service_role;
revoke all on table public.broker_credentials from anon, authenticated;

commit;
