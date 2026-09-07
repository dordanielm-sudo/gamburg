-- Gamburg CRM - indexes for the queries the heavy screens actually run.
--
-- Cross-referenced against what the screens ask for rather than added by
-- guesswork: every index below serves a filter or an ORDER BY that appears
-- verbatim in app/dashboard/page.tsx, app/cases/page.tsx, app/tasks/page.tsx
-- or app/deadlines/page.tsx.
--
-- Two existing indexes are dropped as part of this: each one is a strict
-- leading prefix of a composite added here, so everything it answered the
-- composite answers too, and keeping both only costs write time on tables
-- the sync writes to constantly.

-- 1. case_fields: the single heaviest read in the app.
--
-- Four screens embed case_fields filtered to rows that carry a value (see
-- NON_EMPTY_CASE_FIELD in lib/case-field-catalog.ts - the comment there puts
-- the unfiltered table at ~67,000 rows). case_fields_case_id_idx finds a
-- case's rows but says nothing about which of them are empty, so the filter
-- was applied by reading them. This partial index has exactly the shape of
-- that filter, so only valued rows are visited at all.
create index if not exists case_fields_case_id_valued_idx
  on public.case_fields (case_id)
  where value_text is not null
     or value_date is not null
     or value_number is not null;

-- 2. cases: the list ordering, on the dashboard and the cases screen.
--
-- Both page through `order by last_touched_at desc, id asc`. A btree can be
-- read backwards, so a plain (last_touched_at) index serves a single-column
-- sort in either direction - but not a mixed one: read backwards it yields
-- id DESC, which is not what is asked for, leaving the rows to be sorted.
-- Spelling the directions out is what removes that sort.
create index if not exists cases_last_touched_id_idx
  on public.cases (last_touched_at desc, id);

-- Redundant now: (last_touched_at) is the leading prefix of the above.
drop index if exists public.cases_last_touched_at_idx;

-- 3. tasks: due dates. tasks.due_date arrived in migration 0011 with no
-- index at all, and the dashboard asks two questions of it on every load -
-- "open and overdue" (a count) and "open, dated, soonest six". Both filter
-- on status first, so status leads; due_date then gives the range scan and
-- the ordering.
create index if not exists tasks_status_due_date_idx
  on public.tasks (status, due_date);

-- 4. tasks: the tasks screen's own paging, which is `status = 'open'` (the
-- default view) ordered by `created_at desc, id asc`. Same mixed-direction
-- reasoning as the cases index above.
create index if not exists tasks_status_created_id_idx
  on public.tasks (status, created_at desc, id);

-- 5. case_deadlines: `status = 'open'` ordered by `due_date, id` on the
-- deadlines screen, and `status = 'open' and due_date = today` on the
-- dashboard. One composite answers both; all three columns ascend, so no
-- direction needs spelling out here.
create index if not exists case_deadlines_status_due_id_idx
  on public.case_deadlines (status, due_date, id);

-- Redundant now: (status) is the leading prefix of the above.
-- case_deadlines_due_date_idx is NOT redundant and stays - due_date alone is
-- not a prefix of (status, due_date, id).
drop index if exists public.case_deadlines_status_idx;
