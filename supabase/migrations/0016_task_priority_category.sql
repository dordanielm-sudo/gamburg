-- Gamburg CRM - additional task fields synced from עדכנית
-- (vwExportToOuterSystems_Tasks). Priority is the concrete ask (client wants
-- a priority badge on tasks); category and informed-users are captured
-- alongside it per the client's standing instruction to pull complete data
-- from עדכנית rather than a narrow subset, so filtering can happen later
-- without another schema round-trip. Stored as-is from the source (no fixed
-- enum) since only two priority codes have been observed so far (2=רגילה,
-- 3=גבוהה) and more may exist.

alter table public.tasks
  add column priority_code smallint,
  add column priority_name text,
  add column category_code integer,
  add column category_name text,
  add column informed_users_names text;
