-- Equora v57.01
-- Master-Setup-Bibliothek: Admins können Setups als globale Master-Setups veröffentlichen.
-- Nutzer können Master-Setups lesen, aber nicht bearbeiten.

alter table public.setups
  add column if not exists is_master boolean not null default false;

create index if not exists idx_setups_master_sort on public.setups (is_master, sort_order, title);

-- Setup-RLS neu setzen, damit Master-Setups für alle sichtbar sind.
drop policy if exists "users can read own setups" on public.setups;
drop policy if exists "users can insert own setups" on public.setups;
drop policy if exists "users can update own setups" on public.setups;
drop policy if exists "users can delete own setups" on public.setups;

create policy "users can read own setups" on public.setups
  for select
  using (auth.uid() = user_id or is_master = true);

create policy "users can insert own setups" on public.setups
  for insert
  with check (auth.uid() = user_id and (is_master = false or public.is_equora_admin(auth.uid())));

create policy "users can update own setups" on public.setups
  for update
  using (auth.uid() = user_id and (is_master = false or public.is_equora_admin(auth.uid())))
  with check (auth.uid() = user_id and (is_master = false or public.is_equora_admin(auth.uid())));

create policy "users can delete own setups" on public.setups
  for delete
  using (auth.uid() = user_id and (is_master = false or public.is_equora_admin(auth.uid())));

-- Master-Bilder müssen mitlesbar sein, bleiben aber nur für den Besitzer/Admin pflegbar.
drop policy if exists "users can read own setup media" on public.setup_media;

create policy "users can read own setup media" on public.setup_media
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.setups
      where setups.id = setup_media.setup_id
        and setups.is_master = true
    )
  );
