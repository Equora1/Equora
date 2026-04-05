-- Equora v56.9 compatibility patch for existing Supabase projects
-- Fixes older setups tables that do not yet have the modern title/category/media schema.

create extension if not exists pgcrypto;

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

alter table public.setups add column if not exists title text;
alter table public.setups add column if not exists category text;
alter table public.setups add column if not exists description text;
alter table public.setups add column if not exists playbook text;
alter table public.setups add column if not exists checklist text[];
alter table public.setups add column if not exists mistakes text[];
alter table public.setups add column if not exists cover_image_url text;
alter table public.setups add column if not exists sort_order integer;
alter table public.setups add column if not exists is_archived boolean;
alter table public.setups add column if not exists updated_at timestamptz;
alter table public.setups add column if not exists created_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'setups' AND column_name = 'name'
  ) THEN
    EXECUTE $sql$
      UPDATE public.setups
      SET title = COALESCE(NULLIF(title, ''), NULLIF(name, ''), 'Setup ' || left(id::text, 8))
      WHERE title IS NULL OR btrim(title) = ''
    $sql$;
  ELSE
    EXECUTE $sql$
      UPDATE public.setups
      SET title = 'Setup ' || left(id::text, 8)
      WHERE title IS NULL OR btrim(title) = ''
    $sql$;
  END IF;
END $$;

update public.setups set category = 'Custom' where category is null or btrim(category) = '';
update public.setups set checklist = '{}'::text[] where checklist is null;
update public.setups set mistakes = '{}'::text[] where mistakes is null;
update public.setups set sort_order = 0 where sort_order is null;
update public.setups set is_archived = false where is_archived is null;
update public.setups set created_at = now() where created_at is null;
update public.setups set updated_at = now() where updated_at is null;

alter table public.setups alter column title set not null;
alter table public.setups alter column checklist set default '{}'::text[];
alter table public.setups alter column mistakes set default '{}'::text[];
alter table public.setups alter column sort_order set default 0;
alter table public.setups alter column is_archived set default false;
alter table public.setups alter column created_at set default now();
alter table public.setups alter column updated_at set default now();

alter table public.setups alter column checklist set not null;
alter table public.setups alter column mistakes set not null;
alter table public.setups alter column sort_order set not null;
alter table public.setups alter column is_archived set not null;
alter table public.setups alter column created_at set not null;
alter table public.setups alter column updated_at set not null;

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

alter table public.setup_media add column if not exists created_at timestamptz;
alter table public.setup_media add column if not exists file_name text;
alter table public.setup_media add column if not exists mime_type text;
alter table public.setup_media add column if not exists byte_size integer;
alter table public.setup_media add column if not exists sort_order integer;
alter table public.setup_media add column if not exists is_cover boolean;
alter table public.setup_media add column if not exists caption text;
alter table public.setup_media add column if not exists media_role text;

update public.setup_media set created_at = now() where created_at is null;
update public.setup_media set sort_order = 0 where sort_order is null;
update public.setup_media set is_cover = false where is_cover is null;
update public.setup_media set media_role = 'example' where media_role is null or btrim(media_role) = '';

alter table public.setup_media alter column created_at set default now();
alter table public.setup_media alter column sort_order set default 0;
alter table public.setup_media alter column is_cover set default false;
alter table public.setup_media alter column media_role set default 'example';

alter table public.setup_media alter column created_at set not null;
alter table public.setup_media alter column sort_order set not null;
alter table public.setup_media alter column is_cover set not null;
alter table public.setup_media alter column media_role set not null;

alter table public.setups enable row level security;
alter table public.setup_media enable row level security;

create unique index if not exists idx_setups_user_title_unique on public.setups (user_id, title);
create index if not exists idx_setup_media_setup_id_sort on public.setup_media (setup_id, sort_order asc, created_at asc);
create index if not exists idx_setup_media_user_created_at on public.setup_media (user_id, created_at desc);
create unique index if not exists idx_setup_media_setup_storage_unique on public.setup_media (setup_id, storage_path);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'setups' AND policyname = 'users can read own setups'
  ) THEN
    CREATE POLICY "users can read own setups" ON public.setups FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'setups' AND policyname = 'users can insert own setups'
  ) THEN
    CREATE POLICY "users can insert own setups" ON public.setups FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'setups' AND policyname = 'users can update own setups'
  ) THEN
    CREATE POLICY "users can update own setups" ON public.setups FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'setups' AND policyname = 'users can delete own setups'
  ) THEN
    CREATE POLICY "users can delete own setups" ON public.setups FOR DELETE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'setup_media' AND policyname = 'users can read own setup media'
  ) THEN
    CREATE POLICY "users can read own setup media" ON public.setup_media FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'setup_media' AND policyname = 'users can insert own setup media'
  ) THEN
    CREATE POLICY "users can insert own setup media" ON public.setup_media FOR INSERT WITH CHECK (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1 FROM public.setups
        WHERE setups.id = setup_media.setup_id
          AND setups.user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'setup_media' AND policyname = 'users can update own setup media'
  ) THEN
    CREATE POLICY "users can update own setup media" ON public.setup_media FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1 FROM public.setups
        WHERE setups.id = setup_media.setup_id
          AND setups.user_id = auth.uid()
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'setup_media' AND policyname = 'users can delete own setup media'
  ) THEN
    CREATE POLICY "users can delete own setup media" ON public.setup_media FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'users can view equora media bucket objects'
  ) THEN
    CREATE POLICY "users can view equora media bucket objects"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'equora-media');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'users can upload own equora media'
  ) THEN
    CREATE POLICY "users can upload own equora media"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'equora-media'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'users can update own equora media'
  ) THEN
    CREATE POLICY "users can update own equora media"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
      bucket_id = 'equora-media'
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
      bucket_id = 'equora-media'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'users can delete own equora media'
  ) THEN
    CREATE POLICY "users can delete own equora media"
    ON storage.objects FOR DELETE
    USING (
      bucket_id = 'equora-media'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;
