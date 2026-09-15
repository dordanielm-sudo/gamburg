-- Gamburg CRM - רישום שלוש נקודות קצה שחסרות ב-webhook_configs.
--
-- webhook_logs.webhook_key is a foreign key into webhook_configs (0018), and
-- logWebhookCall() discards the insert's error. So a route whose key is not
-- in that table works perfectly and logs nothing at all - the FK rejects
-- every row in silence.
--
-- task_reconcile and task_deletions have been in that state since they were
-- written: both call runIncomingWebhook with a key nobody registered. The
-- webhooks panel has therefore never shown a single call to either, which
-- looks exactly like "Make never calls these" and is not the same thing.
--
-- reminders_due is new (app/api/reminders/due) and would have landed in the
-- same hole.
--
-- All three fall back to an env var when their DB value is empty, so
-- inserting them with a null value changes no behaviour - it only lets the
-- logging work and puts the secret within reach of the panel.

insert into public.webhook_configs (key, label, endpoint_path, direction, value_type) values
  ('task_reconcile', 'סגירת משימות שנעלמו מעדכנית', '/api/webhooks/task-reconcile', 'incoming', 'secret'),
  ('task_deletions', 'מחיקת משימות שנמחקו בעדכנית', '/api/webhooks/task-deletions', 'incoming', 'secret'),
  ('reminders_due', 'תזכורות מועדים (נמשך ע"י Make)', '/api/reminders/due', 'incoming', 'secret')
on conflict (key) do nothing;
