-- Gamburg CRM - richer מועדים fields per the client's screen spec: an
-- external date (vs. the existing due_date, treated as internal), a Zoom
-- link, an address, and two yes/no flags. "תיאור" from the spec is the
-- existing `notes` column - no need for a second free-text field.

alter table public.case_deadlines
  add column external_date    date,
  add column zoom_link        text,
  add column address          text,
  add column client_updated   boolean not null default false,
  add column preparation_done boolean not null default false;
