-- ===========================================================================
-- Local test harness only — NOT part of the deployed schema.
--
-- Supabase provides the `auth` and `storage` schemas, the `anon` /
-- `authenticated` / `service_role` roles, and `auth.uid()`. This file
-- reproduces just enough of them on a vanilla PostgreSQL instance so the real
-- migrations can be executed and exercised, including RLS behaviour.
--
-- Never run this against a Supabase project.
-- ===========================================================================

create schema if not exists auth;
create schema if not exists storage;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;
-- Mirrors Supabase's defaults: table privileges are granted broadly and then
-- narrowed by the RLS migration. Function privileges are deliberately NOT
-- granted here, so the migration's own revoke/grant hardening is what the
-- tests actually exercise.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- Mirrors Supabase's implementation: reads the verified JWT claims that GoTrue
-- puts on the connection.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- --------------------------------------------------------------------------
-- Minimal storage schema
-- --------------------------------------------------------------------------
create table if not exists storage.buckets (
  id                  text primary key,
  name                text not null,
  public              boolean not null default false,
  file_size_limit     bigint,
  allowed_mime_types  text[],
  created_at          timestamptz not null default now()
);

create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets (id),
  name        text not null,
  owner       uuid,
  created_at  timestamptz not null default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects to anon;
