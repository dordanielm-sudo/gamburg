-- Fixtures for the write-access checks in 04_write_access.sql.
--
-- Kept out of 01_seed.sql on purpose: 02_rls_assertions.sql asserts exact
-- row counts, and adding rows there would break those counts for reasons
-- that have nothing to do with what they test.
--
-- Inserted as the superuser (RLS bypassed) so the fixtures exist regardless
-- of policy - the point of the next file is what each role may do to rows
-- that are already there, which is how these rows really arrive: from the
-- sync, not from a user.

-- one חוצץ field per value type, so the typed-column grants are all covered
insert into public.case_fields (id, case_id, page_name, field_name, value_text) values
  ('20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', 'חדל"פ', 'שם הנאמן', 'עו״ד כהן');

insert into public.case_fields (id, case_id, page_name, field_name, value_date) values
  ('20000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001', 'חדל"פ', 'מועד קבלת צו', '2026-01-15');

insert into public.case_fields (id, case_id, page_name, field_name, value_number) values
  ('20000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000001', 'חדל"פ', 'מספר נושים', 7);

-- a field on handler B's case, to prove handler A cannot reach across cases
insert into public.case_fields (id, case_id, page_name, field_name, value_text) values
  ('20000000-0000-0000-0000-000000000004',
   '10000000-0000-0000-0000-000000000003', 'חדל"פ', 'שם הנאמן', 'עו״ד לוי');

insert into public.case_deadlines (id, case_id, label, due_date, source_field_name) values
  ('30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', 'דיון בבית משפט', '2026-09-01', 'תאריך דיון.'),
  ('30000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000003', 'דיון בתיק של מטפל ב', '2026-09-02', 'תאריך דיון.');

insert into public.documents (id, case_id, title) values
  ('40000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', 'תצהיר'),
  ('40000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000003', 'תצהיר בתיק של מטפל ב');

insert into public.approval_requests (id, case_id, request_type, submitted_by) values
  ('50000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', 'בקשה לאישור הוצאה',
   '00000000-0000-0000-0000-000000000002');

-- a task on handler A's case, assigned to handler B: separates "assignee"
-- from "handler of the case", which the tasks policies treat differently
insert into public.tasks (id, text, created_by, assigned_to, case_id) values
  ('60000000-0000-0000-0000-000000000001', 'משימה לבדיקת הרשאות',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000001');

-- A second חוצץ on handler A's case, so tab restrictions have something to
-- allow and something to withhold. "לקוח חדש" stands in for the intake tab:
-- the case for restricting a tab at all is that some of them hold material
-- not everyone on the case should read.
insert into public.case_fields (id, case_id, page_name, field_name, value_text) values
  ('20000000-0000-0000-0000-000000000005',
   '10000000-0000-0000-0000-000000000001', 'לקוח חדש', 'מקור הפניה', 'המלצה');
