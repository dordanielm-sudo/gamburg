-- Gamburg CRM - section 4.4: "תיקים תקועים" (stuck cases).
--
-- check_stuck_cases() finds every case that hasn't been touched (status
-- change / flag / note / follow-up - see cases_before_update() in
-- 0001_schema.sql) in 30+ days and notifies both the handler and every
-- active manager (section 7, question 7: goes to both). It is idempotent
-- per "stuck episode": it only fires once per case per period of
-- inactivity, by checking whether a stuck_case notification already exists
-- that was created after the case's current last_touched_at. Portable SQL -
-- safe to run against the local test harness. Scheduling this on a cron and
-- enabling Realtime on notifications (Supabase-only infra) is in
-- 0006_realtime_and_cron.sql.

create or replace function public.check_stuck_cases()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stuck record;
  mgr record;
begin
  for stuck in
    select cs.id, cs.case_name, cs.handler_id, cs.last_touched_at
    from public.cases cs
    where cs.last_touched_at < now() - interval '30 days'
      and not exists (
        select 1 from public.notifications n
        where n.case_id = cs.id
          and n.type = 'stuck_case'
          and n.created_at > cs.last_touched_at
      )
  loop
    if stuck.handler_id is not null then
      insert into public.notifications (type, user_id, case_id, title, body)
      values (
        'stuck_case', stuck.handler_id, stuck.id, 'תיק תקוע',
        'התיק "' || stuck.case_name || '" לא טופל מעל 30 יום'
      );
    end if;

    for mgr in select id from public.profiles where role = 'manager' and is_active = true
    loop
      insert into public.notifications (type, user_id, case_id, title, body)
      values (
        'stuck_case', mgr.id, stuck.id, 'תיק תקוע',
        'התיק "' || stuck.case_name || '" לא טופל מעל 30 יום'
      );
    end loop;
  end loop;
end;
$$;
