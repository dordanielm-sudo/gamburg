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

-- ---------------------------------------------------------------------------
-- pg_cron stub.
--
-- Migrations 0012 and 0018 schedule jobs with cron.schedule(), and 0012 first
-- probes cron.job to make itself re-runnable. pg_cron is a Supabase extension
-- that plain Postgres does not have, and without it those migrations abort -
-- which would stop the harness before it ever reached the tables added later.
--
-- The stub records the call and does nothing else. Scheduling itself is not
-- what these tests are about; the RLS policies in the same migrations are, and
-- those need the file to run to completion.
create schema if not exists cron;

create table if not exists cron.job (
  jobid   bigserial primary key,
  jobname text unique,
  schedule text,
  command text
);

create or replace function cron.schedule(
  job_name text,
  schedule text,
  command text
) returns bigint
language sql as $$
  insert into cron.job (jobname, schedule, command)
  values (job_name, schedule, command)
  on conflict (jobname) do update
    set schedule = excluded.schedule, command = excluded.command
  returning jobid;
$$;

create or replace function cron.unschedule(job_name text)
returns boolean
language sql as $$
  delete from cron.job where jobname = job_name returning true;
$$;
