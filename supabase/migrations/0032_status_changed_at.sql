-- Gamburg CRM - status change timestamp synced from עדכנית
-- (StatusChangedDate on vwExportToOuterSystems_Files), separate from
-- source_updated_at (tsModifyDate - any edit to the case) - this one is
-- specifically "when the status last changed", per the client's request to
-- surface it alongside the general edit timestamp.

alter table public.cases
  add column status_changed_at timestamptz;
