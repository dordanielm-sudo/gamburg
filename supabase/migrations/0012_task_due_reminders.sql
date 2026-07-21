-- Gamburg CRM - task due-date reminders: notify the assignee a week
-- before and again a day before an open task's due_date, same idempotency
-- approach as check_stuck_cases() (0005) - a distinct title per milestone
-- so each one only ever fires once per task.

alter type public.notification_type add value 'task_due_soon';

create or replace function public.check_task_due_dates()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  for t in
    select tk.id, tk.text, tk.assigned_to, tk.case_id
    from public.tasks tk
    where tk.status = 'open'
      and tk.due_date = current_date + 7
      and not exists (
        select 1 from public.notifications n
        where n.task_id = tk.id
          and n.type = 'task_due_soon'
          and n.title = 'תזכורת: שבוע למועד המשימה'
      )
  loop
    insert into public.notifications (type, user_id, case_id, task_id, title, body)
    values (
      'task_due_soon', t.assigned_to, t.case_id, t.id,
      'תזכורת: שבוע למועד המשימה', t.text
    );
  end loop;

  for t in
    select tk.id, tk.text, tk.assigned_to, tk.case_id
    from public.tasks tk
    where tk.status = 'open'
      and tk.due_date = current_date + 1
      and not exists (
        select 1 from public.notifications n
        where n.task_id = tk.id
          and n.type = 'task_due_soon'
          and n.title = 'תזכורת: יום למועד המשימה'
      )
  loop
    insert into public.notifications (type, user_id, case_id, task_id, title, body)
    values (
      'task_due_soon', t.assigned_to, t.case_id, t.id,
      'תזכורת: יום למועד המשימה', t.text
    );
  end loop;
end;
$$;

-- Supabase-only (pg_cron) - see 0006_realtime_and_cron.sql for the same
-- pattern and the dashboard-based fallback if `create extension` fails.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'check-task-due-dates-daily') then
    perform cron.unschedule('check-task-due-dates-daily');
  end if;
end $$;

select cron.schedule(
  'check-task-due-dates-daily',
  '0 6 * * *',
  $$ select public.check_task_due_dates(); $$
);
