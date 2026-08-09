\set ON_ERROR_STOP on

-- Disposable local test fixture only. Supabase owns these schemas and objects
-- in connected projects; this file must never be applied there.
create schema if not exists auth;
create schema if not exists storage;

create or replace function auth.uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function storage.foldername(p_name text)
returns text[]
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.string_to_array(p_name, '/')
$$;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz,
  updated_at timestamptz
);

create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null,
  owner uuid
);

alter table storage.objects enable row level security;
