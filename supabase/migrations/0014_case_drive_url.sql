-- Gamburg CRM - client-upload landing page integration: files land in a
-- per-client Drive folder, and /api/webhooks/incoming-document (0004b) now
-- stores that folder link on the case so staff can jump straight to the
-- files, instead of only firing a notification.

alter table public.cases add column drive_url text;
