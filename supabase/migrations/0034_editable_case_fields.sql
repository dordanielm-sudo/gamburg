-- Gamburg CRM - opening חוצצים fields (case_fields) for editing.
--
-- 0017 deliberately created case_fields read-only: select policies only, no
-- write path, because at the time there was no way to push a custom-field
-- change back into עדכנית and a local-only edit would just be silently
-- overwritten by the next sync. That constraint is gone - עדכנית's API does
-- accept writes on these fields - so the write path is opened here.
--
-- Who may edit mirrors who may edit the case itself (see the case detail
-- page's canEdit): the manager, or the handler the case is assigned to.
-- Secretaries keep read-only access. No insert/delete for authenticated
-- users: rows are still created solely by the sync, editing only changes
-- values on rows that already exist.

create policy case_fields_update_manager
  on public.case_fields for update
  to authenticated
  using (public.current_user_role() = 'manager')
  with check (public.current_user_role() = 'manager');

create policy case_fields_update_handler_own
  on public.case_fields for update
  to authenticated
  using (
    exists (
      select 1 from public.cases c
      where c.id = case_fields.case_id and c.handler_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cases c
      where c.id = case_fields.case_id and c.handler_id = auth.uid()
    )
  );

-- only the value columns are writable - page_name/field_name identify the
-- field and must stay exactly as עדכנית sent them, or the next sync would
-- create a duplicate row instead of updating this one
grant update (value_text, value_date, value_number)
  on public.case_fields to authenticated;

-- ---------------------------------------------------------------------------
-- case_sync_log carries the write-back audit trail. Until now every logged
-- change was a column on `cases`, so field_name alone identified it. A
-- חוצץ field needs its page too: "מועד קבלת צו" exists on more than one
-- PageName, and Make has to know which one to write back to.
-- ---------------------------------------------------------------------------

alter table public.case_sync_log add column page_name text;

comment on column public.case_sync_log.page_name is
  'PageName in עדכנית for חוצץ field changes; null for plain cases columns.';
