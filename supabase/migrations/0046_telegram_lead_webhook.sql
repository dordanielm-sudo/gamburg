-- Gamburg CRM - Telegram lead form (app/lead + app/api/telegram-lead).
--
-- The form forwards each lead to Make, the same way the write-back does, so
-- it needs its own webhook_configs row for two reasons: a manager can then
-- paste the scenario's URL at /dashboard/webhooks instead of editing
-- .env.production and rebuilding, and webhook_logs.webhook_key is a foreign
-- key to this table - without the row, no call to the route could be logged.
--
-- No leads table: the lead's home is Make (and whatever it writes to from
-- there), the CRM only hands it over and records that it did.

insert into public.webhook_configs (key, label, endpoint_path, direction, value_type)
values (
  'outgoing_telegram_lead',
  'טופס לידים בטלגרם (יוצא)',
  '/api/telegram-lead',
  'outgoing',
  'url'
)
on conflict (key) do nothing;
