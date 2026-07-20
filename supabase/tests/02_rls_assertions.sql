-- Practical RLS checks, run as the `postgres` superuser driving separate
-- Postgres sessions-within-a-session via SET ROLE + a fake JWT claim, the
-- same mechanism PostgREST uses against a real Supabase project. Each block
-- either raises 'TEST FAILED: ...' (script aborts, ON_ERROR_STOP=1) or prints
-- 'PASS: ...'.


-- ---------------------------------------------------------------------------
-- 1. manager sees all 3 cases
-- ---------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set role authenticated;
do $$
declare cnt int;
begin
  select count(*) into cnt from public.cases;
  if cnt <> 3 then
    raise exception 'TEST FAILED: manager expected 3 visible cases, got %', cnt;
  end if;
  raise notice 'PASS: manager sees all 3 cases';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 2. handler A sees only their own 2 cases
-- ---------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
declare cnt int;
begin
  select count(*) into cnt from public.cases;
  if cnt <> 2 then
    raise exception 'TEST FAILED: handler A expected 2 visible cases, got %', cnt;
  end if;
  raise notice 'PASS: handler A sees only their own 2 cases';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 3. handler B sees only their own 1 case
-- ---------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';
set role authenticated;
do $$
declare cnt int;
begin
  select count(*) into cnt from public.cases;
  if cnt <> 1 then
    raise exception 'TEST FAILED: handler B expected 1 visible case, got %', cnt;
  end if;
  raise notice 'PASS: handler B sees only their own 1 case';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. secretary sees all 3 cases (read-only role, per confirmed default)
-- ---------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
set role authenticated;
do $$
declare cnt int;
begin
  select count(*) into cnt from public.cases;
  if cnt <> 3 then
    raise exception 'TEST FAILED: secretary expected 3 visible cases, got %', cnt;
  end if;
  raise notice 'PASS: secretary sees all 3 cases';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 5. handler A can update a CRM-only field on their own case
-- ---------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
declare affected int;
begin
  update public.cases set manager_follow_up = true
    where id = '10000000-0000-0000-0000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'TEST FAILED: handler A should be able to flag their own case, affected %', affected;
  end if;
  raise notice 'PASS: handler A updated manager_follow_up on their own case';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 6. handler A cannot edit a source-owned field (column-level grant blocks it)
-- ---------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
begin
  update public.cases set case_name = 'hacked'
    where id = '10000000-0000-0000-0000-000000000001';
  raise exception 'TEST FAILED: handler A should not be able to edit case_name';
exception
  when insufficient_privilege then
    raise notice 'PASS: handler A blocked from editing case_name (column privilege)';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. handler B cannot touch handler A's case at all (RLS filters the row,
--    no error - just zero rows affected)
-- ---------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';
set role authenticated;
do $$
declare affected int;
begin
  update public.cases set manager_follow_up = true
    where id = '10000000-0000-0000-0000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'TEST FAILED: handler B should not be able to touch handler A''s case';
  end if;
  raise notice 'PASS: handler B cannot touch handler A''s case (0 rows affected)';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 8. secretary cannot edit even a CRM-only field (no UPDATE policy at all)
-- ---------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
set role authenticated;
do $$
declare affected int;
begin
  update public.cases set manager_follow_up = true
    where id = '10000000-0000-0000-0000-000000000003';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'TEST FAILED: secretary should not be able to edit cases';
  end if;
  raise notice 'PASS: secretary is read-only on cases (0 rows affected)';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 9. handler A cannot create a task (only manager can)
-- ---------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
begin
  insert into public.tasks (text, created_by, assigned_to, case_id)
  values ('משימה מזויפת', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001');
  raise exception 'TEST FAILED: handler A should not be able to create tasks';
exception
  when insufficient_privilege then
    raise notice 'PASS: handler A blocked from creating a task';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 10a. manager creates a task for handler A -> case touch fires immediately
-- ---------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set role authenticated;
do $$
declare
  touched_at timestamptz;
begin
  insert into public.tasks (text, created_by, assigned_to, case_id)
  values ('להתקשר ללקוח', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001');

  select last_touched_at into touched_at
    from public.cases where id = '10000000-0000-0000-0000-000000000001';
  if touched_at < now() - interval '10 seconds' then
    raise exception 'TEST FAILED: case last_touched_at was not refreshed by the new task';
  end if;

  raise notice 'PASS: manager created a task; case touch fired automatically';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 10b. the notification landed for handler A, not for anyone else (RLS:
--      notifications are only visible to their own recipient - not even to
--      the manager who created the task)
-- ---------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
declare notif_cnt int;
begin
  select count(*) into notif_cnt
    from public.notifications n
    join public.tasks t on t.id = n.task_id
    where t.text = 'להתקשר ללקוח' and n.type = 'new_task' and n.user_id = auth.uid();
  if notif_cnt <> 1 then
    raise exception 'TEST FAILED: expected handler A to see exactly 1 new_task notification, got %', notif_cnt;
  end if;
  raise notice 'PASS: handler A (the recipient) sees the auto-created notification';
end $$;
reset role;

set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
set role authenticated;
do $$
declare notif_cnt int;
begin
  select count(*) into notif_cnt from public.notifications;
  if notif_cnt <> 0 then
    raise exception 'TEST FAILED: manager should not see handler A''s notification, got %', notif_cnt;
  end if;
  raise notice 'PASS: manager cannot see handler A''s notification (0 rows visible)';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 11. handler A sees the notification and marks their own task done
-- ---------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
set role authenticated;
do $$
declare
  the_task_id uuid;
  affected int;
begin
  select id into the_task_id from public.tasks
    where assigned_to = '00000000-0000-0000-0000-000000000002' and text = 'להתקשר ללקוח';

  update public.tasks set status = 'done', completed_at = now()
    where id = the_task_id;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'TEST FAILED: handler A should be able to complete their own task';
  end if;
  raise notice 'PASS: handler A completed their own task';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 12. handler B cannot complete handler A's task
-- ---------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}';
set role authenticated;
do $$
declare
  the_task_id uuid;
  affected int;
begin
  select id into the_task_id from public.tasks
    where assigned_to = '00000000-0000-0000-0000-000000000002' and text = 'להתקשר ללקוח';

  update public.tasks set status = 'open'
    where id = the_task_id;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'TEST FAILED: handler B should not be able to modify handler A''s task';
  end if;
  raise notice 'PASS: handler B cannot modify handler A''s task (0 rows affected)';
end $$;
reset role;

reset request.jwt.claims;
select 'ALL RLS CHECKS PASSED' as result;
