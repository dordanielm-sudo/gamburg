-- Test fixtures: 1 manager, 2 handlers, 1 secretary, 3 cases, 1 task.
--
-- Profiles are NOT inserted directly: the 0003_auth_sync.sql trigger
-- (on_auth_user_created) creates them automatically from auth.users'
-- raw_user_meta_data, exactly as it will for real invited users. Seeding
-- this way also exercises that trigger.

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'manager@test.local',   '{"full_name":"חנה (מנהלת)","role":"manager"}'),
  ('00000000-0000-0000-0000-000000000002', 'handler.a@test.local', '{"full_name":"מטפל א","role":"handler"}'),
  ('00000000-0000-0000-0000-000000000003', 'handler.b@test.local', '{"full_name":"מטפל ב","role":"handler"}'),
  ('00000000-0000-0000-0000-000000000004', 'secretary@test.local', '{"full_name":"מזכירה","role":"secretary"}');

insert into public.cases (id, case_number, case_name, handler_id, status) values
  ('10000000-0000-0000-0000-000000000001', 'C-1', 'תיק של מטפל א - 1', '00000000-0000-0000-0000-000000000002', 'open'),
  ('10000000-0000-0000-0000-000000000002', 'C-2', 'תיק של מטפל א - 2', '00000000-0000-0000-0000-000000000002', 'open'),
  ('10000000-0000-0000-0000-000000000003', 'C-3', 'תיק של מטפל ב - 1', '00000000-0000-0000-0000-000000000003', 'open');
