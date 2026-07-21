-- Gamburg CRM - pilot control for case_number import from עדכנית.
--
-- The handler already has a working Make scenario that can read anything
-- from עדכנית - the risk isn't the connection, it's accidentally syncing
-- the entire client roster before the field mapping has been verified.
-- This table is a second, server-side gate independent of whatever filter
-- exists inside the Make scenario: /api/webhooks/case-sync (0009) refuses
-- to write any case_number not listed here. Grown manually, case by case,
-- as the pilot is verified - see supabase/migrations/README or ask the
-- handler for the current SQL insert command used to add a case.

create table public.case_sync_allowlist (
  case_number text primary key,
  note        text,
  added_by    uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);

alter table public.case_sync_allowlist enable row level security;

create policy case_sync_allowlist_select_manager
  on public.case_sync_allowlist for select
  to authenticated
  using (public.current_user_role() = 'manager');

-- no insert/update/delete policy for 'authenticated': rows are added via
-- the SQL editor (service_role) while the pilot is being verified, same as
-- cases themselves are only ever written by the service role.
