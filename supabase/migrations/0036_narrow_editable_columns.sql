-- Gamburg CRM - making the column grants in 0034/0035 actually bind.
--
-- Those migrations listed the columns that editing should reach:
--
--   grant update (value_text, value_date, value_number) on case_fields ...
--   grant update (label, due_date, status, ...)         on case_deadlines ...
--   grant update (title, doc_type, status, ...)         on documents ...
--
-- and their comments explained that page_name/field_name/source_field_name
-- were being left out so a row could not be cut loose from the record it was
-- synced from. That reasoning was right and the statements did nothing.
--
-- GRANT only adds. These three tables were created in 0007/0008/0017 and
-- picked up Supabase's default table-wide UPDATE for `authenticated`, which
-- nothing ever revoked - so every column was already writable and naming a
-- subset changed nothing. It went unnoticed because until 0034/0035 there
-- was no UPDATE policy on case_fields at all, and RLS refused the write
-- before privileges were ever consulted; the moment a policy was added, the
-- old grant was there waiting.
--
-- 0002 got this right for cases and tasks: revoke the table, then grant the
-- columns. Same shape here.
--
-- Found by the write-access tests in supabase/tests/04_write_access.sql,
-- which assert the ungranted columns raise insufficient_privilege.

revoke update on public.case_fields from authenticated;
grant update (value_text, value_date, value_number)
  on public.case_fields to authenticated;

revoke update on public.case_deadlines from authenticated;
grant update (
  label, due_date, status, notes, external_date, zoom_link, address,
  client_updated, preparation_done
) on public.case_deadlines to authenticated;

revoke update on public.documents from authenticated;
grant update (
  title, doc_type, status, doc_date, notes, responsible_id, file_url
) on public.documents to authenticated;

-- approval_requests is deliberately left alone. It is CRM-only, so nothing
-- there links back to a עדכנית record that a stray write could orphan, and
-- its columns are driven by the three-step workflow in 0024 (status,
-- reviewed_by, approved_by) as much as by the edit screens - narrowing it
-- would need that whole flow re-checked, which is its own change.

-- ---------------------------------------------------------------------------
-- tasks_update_editors (0035) carried a third branch:
--
--   or (case_id is not null and public.can_edit_case(case_id))
--
-- meant to let the handler of a case edit any task on it. It can never fire.
-- Postgres applies the SELECT policies as well when an UPDATE has to find its
-- rows, and tasks_select_own (0002) shows a task only to its assignee or its
-- creator - so a case handler cannot see, and therefore cannot update, a task
-- on their case that belongs to someone else. The branch matched only rows
-- the first two branches already covered.
--
-- Dropping it rather than leaving a rule that reads as a permission nobody
-- actually has. Letting case handlers edit their cases' tasks is still a
-- reasonable thing to want, but it is a change to who can *see* a task, not
-- to who can write one, and that is a product decision about task privacy
-- rather than a fix.
drop policy tasks_update_editors on public.tasks;

create policy tasks_update_editors
  on public.tasks for update
  to authenticated
  using (assigned_to = auth.uid() or created_by = auth.uid())
  with check (assigned_to = auth.uid() or created_by = auth.uid());
