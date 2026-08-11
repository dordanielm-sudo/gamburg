-- Write-access checks for the tables that editing opened up in 0034/0035:
-- case_fields, case_deadlines, documents, approval_requests and tasks.
--
-- Same mechanism as 02_rls_assertions.sql - SET ROLE plus a fake JWT claim,
-- as PostgREST does - and the same contract: raise 'TEST FAILED: ...' or
-- print 'PASS: ...'.
--
-- Two distinct things are being checked, because they fail differently and
-- an app can be wrong about either one:
--
--   * RLS decides which ROWS a role may touch. A blocked update is silent -
--     it matches nothing and reports success with zero rows affected, so
--     these tests assert on the row count, never on an exception.
--   * GRANTs decide which COLUMNS. A blocked column raises. Column grants
--     are table-wide and independent of RLS, which is exactly how the
--     assigned_to hole in the first draft of 0035 came about - so the
--     columns deliberately left ungranted are asserted here too.

-- The four seeded users, spelled out at each use so a block can be read on
-- its own: ...0001 manager, ...0002 handler A, ...0003 handler B,
-- ...0004 secretary.

-- ---------------------------------------------------------------------------
-- case_fields (חוצצים)
-- ---------------------------------------------------------------------------

-- 1. manager may edit any חוצץ field
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  update public.case_fields set value_text = 'עו״ד כהן (עודכן)'
  where id = '20000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'TEST FAILED: manager should be able to edit a case_field, updated % rows', n;
  end if;
  raise notice 'PASS: manager edits a חוצץ field';
end $$;
reset role;

-- 2. handler may edit a חוצץ field on their own case
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  update public.case_fields set value_number = 9
  where id = '20000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'TEST FAILED: handler A should be able to edit a חוצץ on their own case, updated % rows', n;
  end if;
  raise notice 'PASS: handler edits a חוצץ field on their own case';
end $$;
reset role;

-- 3. handler may NOT edit a חוצץ field on someone else's case
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  update public.case_fields set value_text = 'נגיעה אסורה'
  where id = '20000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'TEST FAILED: handler A edited a חוצץ on handler B''s case (% rows)', n;
  end if;
  raise notice 'PASS: handler cannot edit a חוצץ on another handler''s case';
end $$;
reset role;

-- 4. secretary may NOT edit any חוצץ field (read-only role)
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  update public.case_fields set value_text = 'נגיעה אסורה'
  where id = '20000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'TEST FAILED: secretary edited a חוצץ field (% rows)', n;
  end if;
  raise notice 'PASS: secretary cannot edit a חוצץ field';
end $$;
reset role;

-- 5. page_name/field_name stay ungranted - rewriting them would orphan the
--    row from its source and make the next sync insert a duplicate
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set role authenticated;
do $$
begin
  begin
    update public.case_fields set field_name = 'שם אחר'
    where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'TEST FAILED: field_name should not be writable by authenticated';
  exception when insufficient_privilege then
    raise notice 'PASS: case_fields.field_name is not writable (identity column)';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- case_deadlines
-- ---------------------------------------------------------------------------

-- 6. handler may edit a deadline on their own case, beyond just status
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  update public.case_deadlines
     set label = 'דיון בבית משפט (נדחה)', due_date = '2026-10-01', notes = 'נדחה'
   where id = '30000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'TEST FAILED: handler A should be able to edit their own deadline, updated % rows', n;
  end if;
  raise notice 'PASS: handler edits label/date/notes on their own deadline';
end $$;
reset role;

-- 7. handler may NOT edit a deadline on someone else's case
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  update public.case_deadlines set label = 'נגיעה אסורה'
  where id = '30000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'TEST FAILED: handler A edited handler B''s deadline (% rows)', n;
  end if;
  raise notice 'PASS: handler cannot edit another handler''s deadline';
end $$;
reset role;

-- 8. secretary may NOT edit a deadline
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  update public.case_deadlines set label = 'נגיעה אסורה'
  where id = '30000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'TEST FAILED: secretary edited a deadline (% rows)', n;
  end if;
  raise notice 'PASS: secretary cannot edit a deadline';
end $$;
reset role;

-- 9. source_field_name stays ungranted, same reason as case_fields.field_name
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set role authenticated;
do $$
begin
  begin
    update public.case_deadlines set source_field_name = 'שדה אחר'
    where id = '30000000-0000-0000-0000-000000000001';
    raise exception 'TEST FAILED: source_field_name should not be writable by authenticated';
  exception when insufficient_privilege then
    raise notice 'PASS: case_deadlines.source_field_name is not writable (source link)';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------

-- 10. handler may edit a document on their own case
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  update public.documents
     set title = 'תצהיר מתוקן', doc_type = 'תצהיר', doc_date = '2026-03-01'
   where id = '40000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'TEST FAILED: handler A should be able to edit their own document, updated % rows', n;
  end if;
  raise notice 'PASS: handler edits title/type/date on their own document';
end $$;
reset role;

-- 11. handler may NOT edit a document on someone else's case
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  update public.documents set title = 'נגיעה אסורה'
  where id = '40000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'TEST FAILED: handler A edited handler B''s document (% rows)', n;
  end if;
  raise notice 'PASS: handler cannot edit another handler''s document';
end $$;
reset role;

-- 12. secretary may NOT edit a document
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  update public.documents set title = 'נגיעה אסורה'
  where id = '40000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'TEST FAILED: secretary edited a document (% rows)', n;
  end if;
  raise notice 'PASS: secretary cannot edit a document';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- tasks - the table where column grants interact with more than one policy
-- ---------------------------------------------------------------------------

-- 13. the assignee may edit their own task's text, not only flip its status.
--     0002 allowed only status; opening the task screens for editing widened
--     that deliberately.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  update public.tasks set text = 'משימה (תוקנה על ידי המוקצה)', notes = 'הערה'
  where id = '60000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'TEST FAILED: assignee should be able to edit their task text, updated % rows', n;
  end if;
  raise notice 'PASS: assignee edits their own task text and notes';
end $$;
reset role;

-- 14. ...but may NOT reassign it. This is the hole the first draft of 0035
--     opened: a table-wide grant on assigned_to would have let any assignee
--     hand their task to someone else, or take one, through a policy that
--     only ever meant to let them work on their own.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';
set role authenticated;
do $$
begin
  begin
    update public.tasks set assigned_to = '00000000-0000-0000-0000-000000000002'
    where id = '60000000-0000-0000-0000-000000000001';
    raise exception 'TEST FAILED: assigned_to should not be writable by authenticated';
  exception when insufficient_privilege then
    raise notice 'PASS: assignee cannot reassign a task (assigned_to ungranted)';
  end;
end $$;
reset role;

-- 15. the handler of a case may NOT edit a task on it that belongs to someone
--     else - and cannot see it either. Worth pinning down because 0035 first
--     shipped an update policy branch that tried to allow exactly this and
--     was silently dead: Postgres applies the SELECT policies when an UPDATE
--     has to find its rows, and tasks_select_own (0002) scopes a task to its
--     assignee and creator. Widening writes could never work while reads
--     stayed narrow.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
declare n int; visible int;
begin
  select count(*) into visible from public.tasks
   where id = '60000000-0000-0000-0000-000000000001';
  if visible <> 0 then
    raise exception 'TEST FAILED: case handler should not see a task assigned to someone else, saw % rows', visible;
  end if;

  update public.tasks set notes = 'הערה מהמטפל בתיק'
  where id = '60000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'TEST FAILED: case handler edited a task assigned to someone else (% rows)', n;
  end if;
  raise notice 'PASS: case handler can neither see nor edit another user''s task on their case';
end $$;
reset role;

-- 16. secretary may NOT edit a task
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  update public.tasks set notes = 'נגיעה אסורה'
  where id = '60000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'TEST FAILED: secretary edited a task (% rows)', n;
  end if;
  raise notice 'PASS: secretary cannot edit a task';
end $$;
reset role;

-- 17. source_task_id stays ungranted - it links the row to the עדכנית record
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set role authenticated;
do $$
begin
  begin
    update public.tasks set source_task_id = 'other-source-id'
    where id = '60000000-0000-0000-0000-000000000001';
    raise exception 'TEST FAILED: source_task_id should not be writable by authenticated';
  exception when insufficient_privilege then
    raise notice 'PASS: tasks.source_task_id is not writable (source link)';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- approval_requests - CRM-only, so editing here never reaches עדכנית, but the
-- role rules still have to hold
-- ---------------------------------------------------------------------------

-- 18. handler may edit an approval request on their own case
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  update public.approval_requests set request_type = 'בקשה לאישור הוצאה (עודכן)'
  where id = '50000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'TEST FAILED: handler A should be able to edit their own approval request, updated % rows', n;
  end if;
  raise notice 'PASS: handler edits an approval request on their own case';
end $$;
reset role;

-- 19. secretary may NOT edit an approval request
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  update public.approval_requests set request_type = 'נגיעה אסורה'
  where id = '50000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'TEST FAILED: secretary edited an approval request (% rows)', n;
  end if;
  raise notice 'PASS: secretary cannot edit an approval request';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- case_sync_log - the write-back trail. Rows are written by the caller's own
-- session, so a user must not be able to log a change under someone else's
-- name.
-- ---------------------------------------------------------------------------

-- 20. a user may log their own change, with the new entity columns from 0035
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  insert into public.case_sync_log
    (case_id, field_name, page_name, entity_type, entity_id, new_value, changed_by)
  values
    ('10000000-0000-0000-0000-000000000001', 'שם הנאמן', 'חדל"פ',
     'case_field', '20000000-0000-0000-0000-000000000001', 'עו״ד כהן',
     '00000000-0000-0000-0000-000000000002');
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'TEST FAILED: handler A should be able to log their own change, inserted % rows', n;
  end if;
  raise notice 'PASS: user logs a חוצץ change with entity_type/entity_id';
end $$;
reset role;

-- 21. ...but not under another user's name
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
begin
  begin
    insert into public.case_sync_log (case_id, field_name, new_value, changed_by)
    values ('10000000-0000-0000-0000-000000000001', 'status', 'closed',
            '00000000-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: handler A logged a change as the manager';
  exception when insufficient_privilege then
    raise notice 'PASS: user cannot log a change under another user''s name';
  end;
end $$;
reset role;

-- 22. entity_type is constrained - an unknown value would reach Make as a
--     route it has no branch for
do $$
begin
  begin
    insert into public.case_sync_log (case_id, field_name, entity_type, changed_by)
    values ('10000000-0000-0000-0000-000000000001', 'x', 'nonsense',
            '00000000-0000-0000-0000-000000000001');
    raise exception 'TEST FAILED: case_sync_log accepted an unknown entity_type';
  exception when check_violation then
    raise notice 'PASS: case_sync_log rejects an unknown entity_type';
  end;
end $$;

-- ---------------------------------------------------------------------------
-- cases - every column the edit screens write must actually be granted.
--
-- This one is a list, not a scenario, because the failure it catches is a
-- mismatch between the UI and the grant: a field is offered for editing and
-- the database refuses it. 0034-0036 shipped exactly that for the client
-- details, and nothing failed until someone tried to save a phone number.
-- Keep this list in step with the `editable(...)` calls in case-summary.tsx
-- and the `cellEdit(...)` calls in cases-table.tsx.
-- ---------------------------------------------------------------------------

-- 23. manager can write every case column the screens expose
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set role authenticated;
do $$
declare
  col text;
  cols text[] := array[
    -- CaseSummary
    'client_id_number', 'client_phone', 'client_email', 'client_address',
    'team', 'opened_date',
    -- cases-table
    'case_name', 'case_type', 'status',
    -- CRM-only, from 0002/0027
    'manager_note', 'manager_follow_up', 'case_nature', 'case_stage'
  ];
begin
  foreach col in array cols loop
    if not exists (
      select 1 from information_schema.column_privileges
      where grantee = 'authenticated' and table_schema = 'public'
        and table_name = 'cases' and column_name = col
        and privilege_type = 'UPDATE'
    ) then
      raise exception 'TEST FAILED: cases.% is edited in the UI but not granted', col;
    end if;
  end loop;
  raise notice 'PASS: every case column the screens edit is writable';
end $$;
reset role;

-- 24. ...but case_number is not. Make matches on it, so a rename would break
--     the match for every later write-back on that case - including the one
--     carrying the rename itself.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set role authenticated;
do $$
begin
  begin
    update public.cases set case_number = 'C-999'
    where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'TEST FAILED: case_number should not be writable by authenticated';
  exception when insufficient_privilege then
    raise notice 'PASS: cases.case_number is not writable (write-back match key)';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- profile_tab_permissions - per-user חוצץ visibility (0023).
--
-- The rule is opt-in: a profile with no rows here is unrestricted, and one
-- with any rows sees only the tabs listed for it. That default matters -
-- adding the feature must not silently hide tabs from everyone - so both
-- halves are pinned down here.
--
-- Enforced in the case_fields SELECT policy rather than in page code, which
-- is why it also covers the cases-list field picker and anything else that
-- reads the table. Worth testing precisely because nothing in the app calls
-- it: a regression would be invisible until someone saw a tab they should not.
-- ---------------------------------------------------------------------------

-- 25. with no rows configured, a handler sees every חוצץ on their case
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.case_fields
   where case_id = '10000000-0000-0000-0000-000000000001';
  if n <> 4 then
    raise exception 'TEST FAILED: unrestricted handler should see all 4 חוצץ fields, saw %', n;
  end if;
  raise notice 'PASS: a handler with no tab rows is unrestricted';
end $$;
reset role;

-- 26. restricting them to one חוצץ hides the other
insert into public.profile_tab_permissions (profile_id, page_name)
values ('00000000-0000-0000-0000-000000000002', 'חדל"פ');

set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
declare allowed int; withheld int;
begin
  select count(*) into allowed from public.case_fields
   where case_id = '10000000-0000-0000-0000-000000000001' and page_name = 'חדל"פ';
  select count(*) into withheld from public.case_fields
   where case_id = '10000000-0000-0000-0000-000000000001' and page_name = 'לקוח חדש';

  if allowed <> 3 then
    raise exception 'TEST FAILED: the permitted חוצץ should still be visible, saw % fields', allowed;
  end if;
  if withheld <> 0 then
    raise exception 'TEST FAILED: the withheld חוצץ leaked % fields', withheld;
  end if;
  raise notice 'PASS: a restricted handler sees only their permitted חוצץ';
end $$;
reset role;

-- 27. a restricted handler cannot edit a חוצץ they may not see either.
--     The update policies from 0034 carry no tab check of their own - this
--     holds because Postgres applies the SELECT policy when an UPDATE looks
--     for its rows, so a hidden row is also an unreachable one. Pinned down
--     because that is a property of how the two policies combine, not
--     something either states on its own.
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  update public.case_fields set value_text = 'נגיעה אסורה'
  where id = '20000000-0000-0000-0000-000000000005';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'TEST FAILED: restricted handler edited a hidden חוצץ (% rows)', n;
  end if;
  raise notice 'PASS: a restricted handler cannot edit a חוצץ they cannot see';
end $$;
reset role;

-- 28. the manager is exempt - they are the one configuring the restrictions
insert into public.profile_tab_permissions (profile_id, page_name)
values ('00000000-0000-0000-0000-000000000001', 'חדל"פ');

set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.case_fields
   where case_id = '10000000-0000-0000-0000-000000000001' and page_name = 'לקוח חדש';
  if n <> 1 then
    raise exception 'TEST FAILED: manager should be exempt from tab restrictions, saw % fields', n;
  end if;
  raise notice 'PASS: the manager is exempt from tab restrictions';
end $$;
reset role;

select 'ALL WRITE-ACCESS CHECKS PASSED' as result;
