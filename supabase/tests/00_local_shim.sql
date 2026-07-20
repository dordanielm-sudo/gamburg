-- Local-only stand-in for the pieces of Supabase that already exist on a
-- real project (the `auth` schema, `auth.uid()`/`auth.role()`, and the
-- anon/authenticated/service_role Postgres roles). This lets the exact same
-- migrations in supabase/migrations/ be applied and RLS-tested against a
-- plain Postgres container.
--
-- NEVER run this file against a real Supabase project - it already has all
-- of this, and this file would conflict with it.

create schema if not exists auth;

create table auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text,
  raw_user_meta_data  jsonb not null default '{}'::jsonb
);

-- same definitions Supabase/PostgREST use in production, so tests written
-- against this shim behave identically against a real project.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claim.sub', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    current_setting('request.jwt.claim.role', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role')
  )::text
$$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
