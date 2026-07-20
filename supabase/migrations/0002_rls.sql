-- Gamburg CRM - Stage 1 RLS
-- Roles (section 3): manager (חנה, sees everything), handler (own cases only),
-- secretary (permissions not yet finalized in the spec - see assumption below).
--
-- Row visibility is enforced by RLS policies. Which *columns* a non-manager
-- may write is additionally enforced by column-level GRANTs, because RLS
-- alone is row-level, not column-level: handlers/secretaries must never be
-- able to edit the עדכנית-sourced fields (case_number, status, client data,
-- ...) from the CRM - only the CRM-only fields (flags/note/follow-up).
--
-- ASSUMPTION (open per section 3 - "מזכירה: הרשאות טרם הוגדרו"): secretary
-- can read all cases (like manager) but cannot edit flags/notes/follow-up and
-- cannot create tasks. Adjust the secretary policies below once confirmed.

-- ---------------------------------------------------------------------------
-- helper: current user's role, without recursive RLS on profiles
-- ---------------------------------------------------------------------------

create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

-- everyone signed in can see the (small) staff list, needed to assign tasks
-- and show handler names on cases
create policy profiles_select_all
  on public.profiles for select
  to authenticated
  using (true);

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_manager_write_all
  on public.profiles for all
  to authenticated
  using (public.current_user_role() = 'manager')
  with check (public.current_user_role() = 'manager');

-- ---------------------------------------------------------------------------
-- cases
-- No insert/delete policies for authenticated users: cases are only ever
-- created by the Make sync job, which uses the service_role key and
-- therefore bypasses RLS entirely.
-- ---------------------------------------------------------------------------

alter table public.cases enable row level security;

create policy cases_select_manager
  on public.cases for select
  to authenticated
  using (public.current_user_role() = 'manager');

create policy cases_select_secretary
  on public.cases for select
  to authenticated
  using (public.current_user_role() = 'secretary');

create policy cases_select_handler
  on public.cases for select
  to authenticated
  using (public.current_user_role() = 'handler' and handler_id = auth.uid());

create policy cases_update_manager
  on public.cases for update
  to authenticated
  using (public.current_user_role() = 'manager')
  with check (public.current_user_role() = 'manager');

create policy cases_update_handler_own
  on public.cases for update
  to authenticated
  using (public.current_user_role() = 'handler' and handler_id = auth.uid())
  with check (public.current_user_role() = 'handler' and handler_id = auth.uid());

-- column-level enforcement: revoke blanket UPDATE, then grant only the
-- CRM-owned columns to regular staff. Managers still edit everything because
-- they typically connect via the same 'authenticated' role - if the manager
-- ever needs to correct a source field by hand, do it via the service role.
revoke update on public.cases from authenticated;
grant update (
  flag_problematic_client,
  flag_non_paying,
  flag_transferring_documents,
  manager_note,
  manager_follow_up
) on public.cases to authenticated;

-- ---------------------------------------------------------------------------
-- tasks
-- Only the manager creates tasks (section 3: "מנהל ... יוצרת משימות לכל
-- מטפל"); handlers/secretary only read their own and mark them done.
-- ---------------------------------------------------------------------------

alter table public.tasks enable row level security;

create policy tasks_select_manager
  on public.tasks for select
  to authenticated
  using (public.current_user_role() = 'manager');

create policy tasks_select_own
  on public.tasks for select
  to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid());

create policy tasks_insert_manager
  on public.tasks for insert
  to authenticated
  with check (public.current_user_role() = 'manager');

create policy tasks_update_manager
  on public.tasks for update
  to authenticated
  using (public.current_user_role() = 'manager')
  with check (public.current_user_role() = 'manager');

-- assignee may only flip status (e.g. open -> done); enforced at the row
-- level here, and app code should only ever send a status change.
create policy tasks_update_assignee_status
  on public.tasks for update
  to authenticated
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

revoke update on public.tasks from authenticated;
grant update (status, completed_at) on public.tasks to authenticated;

-- ---------------------------------------------------------------------------
-- notifications
-- Rows are only ever inserted by definer-security trigger functions (new
-- task) or the incoming webhook handler (new document, stage 4), never
-- directly by client code - so there is no insert policy for 'authenticated'.
-- ---------------------------------------------------------------------------

alter table public.notifications enable row level security;

create policy notifications_select_own
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy notifications_update_own
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- case_sync_log
-- Staff may log a change they made (insert), on cases they can already see.
-- The webhook_status/message columns are only ever updated by the server-side
-- code that talks to Make (service_role), never by the client.
-- ---------------------------------------------------------------------------

alter table public.case_sync_log enable row level security;

create policy case_sync_log_select_manager
  on public.case_sync_log for select
  to authenticated
  using (public.current_user_role() = 'manager');

create policy case_sync_log_select_own_case
  on public.case_sync_log for select
  to authenticated
  using (
    exists (
      select 1 from public.cases c
      where c.id = case_sync_log.case_id
        and c.handler_id = auth.uid()
    )
  );

create policy case_sync_log_insert_own
  on public.case_sync_log for insert
  to authenticated
  with check (changed_by = auth.uid());
