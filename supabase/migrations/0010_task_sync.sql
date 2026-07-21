-- Gamburg CRM - pilot import of tasks (משימות) from עדכנית, mirroring the
-- case-sync pilot (0009). עדכנית has a third task status ("בוטל") that
-- doesn't fit the existing open/done model, so the enum grows to match.

alter type public.task_status add value 'cancelled';

-- unique external key so a resync updates the same row instead of
-- duplicating it (עדכנית's own Counter on vwExportToOuterSystems_Tasks).
alter table public.tasks add column source_task_id text unique;
