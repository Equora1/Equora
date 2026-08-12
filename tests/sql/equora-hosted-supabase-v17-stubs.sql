\set ON_ERROR_STOP on

-- Disposable local compatibility fixture only. It models the read-only
-- catalog evidence observed on Hosted Supabase; it must never be applied to a
-- connected project. The caller is a dedicated test superuser, not postgres.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin nologin noinherit nosuperuser;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit nosuperuser;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'dashboard_user') then
    create role dashboard_user nologin;
  end if;
end;
$$;

create schema auth authorization supabase_admin;
create schema storage authorization postgres;
create schema extensions authorization postgres;
create extension pgcrypto with schema extensions;

grant usage on schema public to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;

create function auth.uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
alter function auth.uid() owner to supabase_auth_admin;

create table auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz,
  updated_at timestamptz
);
alter table auth.users owner to supabase_auth_admin;

revoke all on schema auth from public;
grant usage on schema auth
  to anon, authenticated, service_role, authenticator, postgres;
grant usage, create on schema auth
  to dashboard_user, supabase_auth_admin;

revoke all on function auth.uid() from public;
grant execute on function auth.uid()
  to public, anon, authenticated, service_role, authenticator,
    dashboard_user, postgres, supabase_admin;
grant references (id) on auth.users to postgres;

create function storage.foldername(p_name text)
returns text[]
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.string_to_array(p_name, '/')
$$;

create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null,
  owner uuid
);

alter table storage.objects enable row level security;
