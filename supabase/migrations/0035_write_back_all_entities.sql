-- Gamburg CRM - extending the write-back trail beyond the cases table.
--
-- case_sync_log was built when only columns on `cases` were editable, so a
-- row was identified by case_id + field_name alone. Editing is now opening
-- across every screen - משימות, מועדים, מסמכים - and those live in their own
-- tables. They all still belong to a case, so the log stays case-scoped and
-- gains a pointer to the specific row that changed.
--
-- Deliberately one log table and one outgoing webhook rather than a
-- per-entity split: Make then needs a single scenario with a router on
-- entity_type, instead of four scenarios and four URLs to keep configured.

alter table public.case_sync_log
  add column entity_type text not null default 'case',
  add column entity_id uuid;

comment on column public.case_sync_log.entity_type is
  'Which table the edit landed in: case | case_field | task | deadline | document.';
comment on column public.case_sync_log.entity_id is
  'Row id inside that table. Null for entity_type=case, where case_id already identifies it.';

alter table public.case_sync_log
  add constraint case_sync_log_entity_type_check
  check (entity_type in ('case', 'case_field', 'task', 'deadline', 'document'));

-- every lookup of "what changed on this row" filters on both
create index case_sync_log_entity_idx
  on public.case_sync_log (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Write access for the newly editable tables. Same rule everywhere, matching
-- the case detail page's canEdit: manager, or the handler the case is
-- assigned to. Secretaries stay read-only.
--
-- Tasks are the exception - a task is personal work, so its assignee may edit
-- it even on a case they don't handle.
-- ---------------------------------------------------------------------------

create or replace function public.can_edit_case(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_role() = 'manager'
    or exists (
      select 1 from public.cases c
      where c.id = target_case_id and c.handler_id = auth.uid()
    );
$$;

-- case_deadlines and documents already carry exactly this rule from 0007 and
-- 0008 (case_deadlines_update / documents_update), so they need no new policy
-- here - only the column grants further down, which is what actually blocked
-- editing anything beyond status.

create policy tasks_update_editors
  on public.tasks for update
  to authenticated
  using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or (case_id is not null and public.can_edit_case(case_id))
  )
  with check (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or (case_id is not null and public.can_edit_case(case_id))
  );

-- source_task_id / source_field_name tie a row back to the record it was
-- synced from; letting them be rewritten would orphan the row and make the
-- next sync insert a duplicate instead of updating it
grant update (
  label, due_date, status, notes, external_date, zoom_link, address,
  client_updated, preparation_done
) on public.case_deadlines to authenticated;

grant update (
  title, doc_type, status, doc_date, notes, responsible_id, file_url
) on public.documents to authenticated;

-- Tasks need care that the other two don't. Column grants are table-wide and
-- independent of RLS, so a grant here widens what EVERY update policy on
-- tasks may write - including tasks_update_assignee_status from 0002, whose
-- whole point is "the assignee may only flip status". 0002 enforced that with
-- a narrow grant (status, completed_at), not with the policy.
--
-- Opening the task text/dates/notes for editing means that narrow grant has
-- to widen, and the assignee gains the same reach. That is the intended
-- trade: a task is personal work and its assignee may correct it.
--
-- assigned_to stays out. It is the one column where the widening would be
-- more than an edit - an assignee could hand their task to someone else, or
-- take one from them - and no screen offers it, so granting it would buy
-- nothing and only remove a guard.
grant update (
  text, status, start_date, due_date, notes,
  priority_code, priority_name, category_code, category_name
) on public.tasks to authenticated;
