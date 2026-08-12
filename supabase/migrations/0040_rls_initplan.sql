-- Gamburg CRM - stop re-deciding who the user is once per row.
--
-- Measured on the deadlines screen, per query, in production:
--
--   field catalog   3890 ms   <- select distinct on case_fields
--   rows[0]         1285 ms
--   profile         1059 ms   <- one row, by primary key
--   case list[0]     684 ms
--   TOTAL           7754 ms
--
-- The data is not the problem: 1,253 deadlines, 1,647 cases, and the same
-- join measured straight in psql runs in 2.023 ms. The database, the network
-- (5 ms, app and database both in London) and the tunnel (~100 ms) were all
-- ruled out first.
--
-- What was left is RLS. Every policy calls public.current_user_role() or
-- auth.uid() directly, and a bare function call in a policy is evaluated
-- ONCE PER ROW. current_user_role() is itself `select role from profiles
-- where id = auth.uid()` - a query, against a table that has its own RLS. So
-- a distinct scan over 67,363 case_fields rows ran 67,363 nested profile
-- lookups, and that is the 3.9 seconds.
--
-- Wrapping the call in a scalar subquery - (select public.current_user_role())
-- instead of public.current_user_role() - makes Postgres treat it as an
-- InitPlan: evaluated once for the whole statement and reused. Same result,
-- same security, one evaluation instead of tens of thousands.
--
-- Only SELECT policies on the tables that get scanned are rewritten here.
-- Insert/update/delete policies touch one row at a time, where per-row
-- evaluation costs nothing worth a migration.

-- ---------------------------------------------------------------------------
-- profiles - current_user_role() reads this table, so its own policy is on
-- the hot path of every other policy below
-- ---------------------------------------------------------------------------

drop policy if exists profiles_manager_write_all on public.profiles;
create policy profiles_manager_write_all
  on public.profiles for all
  to authenticated
  using ((select public.current_user_role()) = 'manager')
  with check ((select public.current_user_role()) = 'manager');

-- ---------------------------------------------------------------------------
-- cases
-- ---------------------------------------------------------------------------

drop policy if exists cases_select_manager on public.cases;
create policy cases_select_manager
  on public.cases for select
  to authenticated
  using ((select public.current_user_role()) = 'manager');

drop policy if exists cases_select_secretary on public.cases;
create policy cases_select_secretary
  on public.cases for select
  to authenticated
  using ((select public.current_user_role()) = 'secretary');

drop policy if exists cases_select_handler on public.cases;
create policy cases_select_handler
  on public.cases for select
  to authenticated
  using (
    (select public.current_user_role()) = 'handler'
    and handler_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

drop policy if exists tasks_select_manager on public.tasks;
create policy tasks_select_manager
  on public.tasks for select
  to authenticated
  using ((select public.current_user_role()) = 'manager');

drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own
  on public.tasks for select
  to authenticated
  using (
    assigned_to = (select auth.uid()) or created_by = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- case_deadlines
-- ---------------------------------------------------------------------------

drop policy if exists case_deadlines_select_manager_secretary on public.case_deadlines;
create policy case_deadlines_select_manager_secretary
  on public.case_deadlines for select
  to authenticated
  using ((select public.current_user_role()) in ('manager', 'secretary'));

drop policy if exists case_deadlines_select_handler_own on public.case_deadlines;
create policy case_deadlines_select_handler_own
  on public.case_deadlines for select
  to authenticated
  using (
    exists (
      select 1 from public.cases c
      where c.id = case_deadlines.case_id
        and c.handler_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- case_fields - the biggest table (67,363 rows) and the one the measurement
-- pointed at. Same policy as migration 0023, with the identity lookups
-- hoisted out of the per-row loop.
-- ---------------------------------------------------------------------------

drop policy if exists case_fields_select on public.case_fields;
create policy case_fields_select
  on public.case_fields for select
  to authenticated
  using (
    (
      (select public.current_user_role()) in ('manager', 'secretary')
      or exists (
        select 1 from public.cases c
        where c.id = case_fields.case_id
          and c.handler_id = (select auth.uid())
      )
    )
    and (
      (select public.current_user_role()) = 'manager'
      or not exists (
        select 1 from public.profile_tab_permissions
        where profile_id = (select auth.uid())
      )
      or exists (
        select 1 from public.profile_tab_permissions
        where profile_id = (select auth.uid())
          and page_name = case_fields.page_name
      )
    )
  );
