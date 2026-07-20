-- Gamburg CRM - Supabase-only infra, NOT run against the local test harness
-- (plain Postgres has neither pg_cron nor the supabase_realtime publication).
--
-- 1. Realtime: the notification bell subscribes to INSERT on public.notifications
--    (see components/notification-bell.tsx) - the table must be added to the
--    supabase_realtime publication or no events will ever arrive. RLS still
--    applies to realtime the same as any other read, so this alone does not
--    widen access.
-- 2. pg_cron: runs check_stuck_cases() (0005) daily.
--
-- If `create extension pg_cron` fails with a permissions error, enable it
-- instead via Supabase Dashboard -> Database -> Extensions, then re-run just
-- the cron.schedule() call below.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'check-stuck-cases-daily') then
    perform cron.unschedule('check-stuck-cases-daily');
  end if;
end $$;

select cron.schedule(
  'check-stuck-cases-daily',
  '0 6 * * *',
  $$ select public.check_stuck_cases(); $$
);
