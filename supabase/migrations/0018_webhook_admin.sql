-- Gamburg CRM - developer/admin panel for webhook management ("פאנל ניהול
-- לוובהוקים... איזור למפתחים"). Two pieces:
--
-- 1. webhook_configs: lets a manager edit a webhook's secret/URL from the
--    UI instead of SSHing in to edit .env.production + rebuild + restart.
--    Every webhook route now checks this table first and only falls back
--    to its existing env var if the DB value is empty - so nothing breaks
--    for a secret that hasn't been set here yet; setting it here overrides
--    the env var from then on. RLS restricts read+update to manager - the
--    routes themselves read this table with the service_role admin client,
--    same as everything else they read/write during sync.
--
-- 2. webhook_logs: one row per incoming call to any of the sync/incoming
--    webhooks (ok/error/skipped/unauthorized), with the request+response
--    bodies, so sync problems can be diagnosed from the panel instead of
--    guessing from Make's own history. Pruned after 30 days by a daily
--    cron job so it doesn't grow unbounded.

create table public.webhook_configs (
  key           text primary key,
  label         text not null,
  endpoint_path text not null,
  direction     text not null check (direction in ('incoming', 'outgoing')),
  value_type    text not null check (value_type in ('secret', 'url')),
  value         text,
  updated_at    timestamptz not null default now()
);

insert into public.webhook_configs (key, label, endpoint_path, direction, value_type) values
  ('case_sync', 'סנכרון תיקים', '/api/webhooks/case-sync', 'incoming', 'secret'),
  ('task_sync', 'סנכרון משימות', '/api/webhooks/task-sync', 'incoming', 'secret'),
  ('deadline_sync', 'סנכרון מועדים', '/api/webhooks/deadline-sync', 'incoming', 'secret'),
  ('case_field_sync', 'סנכרון שדות חוצצים', '/api/webhooks/case-field-sync', 'incoming', 'secret'),
  ('incoming_document', 'מסמך נכנס / דרייב', '/api/webhooks/incoming-document', 'incoming', 'secret'),
  ('outgoing_case_update', 'כתיבה חזרה לעדכנית (יוצא)', '/api/case-updates', 'outgoing', 'url');

create or replace function public.webhook_configs_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger webhook_configs_before_update
before update on public.webhook_configs
for each row execute function public.webhook_configs_before_update();

alter table public.webhook_configs enable row level security;

create policy webhook_configs_select_manager
  on public.webhook_configs for select
  to authenticated
  using (public.current_user_role() = 'manager');

create policy webhook_configs_update_manager
  on public.webhook_configs for update
  to authenticated
  using (public.current_user_role() = 'manager')
  with check (public.current_user_role() = 'manager');

create table public.webhook_logs (
  id            uuid primary key default gen_random_uuid(),
  webhook_key   text not null references public.webhook_configs (key) on delete cascade,
  status        text not null check (status in ('ok', 'error', 'skipped', 'unauthorized')),
  status_code   int not null,
  request_body  jsonb,
  response_body jsonb,
  created_at    timestamptz not null default now()
);

create index webhook_logs_key_created_idx on public.webhook_logs (webhook_key, created_at desc);

alter table public.webhook_logs enable row level security;

create policy webhook_logs_select_manager
  on public.webhook_logs for select
  to authenticated
  using (public.current_user_role() = 'manager');

select cron.schedule(
  'prune-webhook-logs-daily',
  '30 6 * * *',
  $$ delete from public.webhook_logs where created_at < now() - interval '30 days' $$
);
