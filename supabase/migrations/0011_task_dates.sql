-- Gamburg CRM - capture the StartDate/EndDate that עדכנית's task view
-- (vwExportToOuterSystems_Tasks) already has, dropped from the first pass
-- of the task-sync pilot (0010).

alter table public.tasks add column start_date date;
alter table public.tasks add column due_date date;
