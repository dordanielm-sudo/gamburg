-- Real Supabase projects grant broad table privileges to anon/authenticated/
-- service_role by default and rely on RLS (plus, here, column-level grants)
-- to actually restrict access. Reproduce that baseline before applying the
-- app's RLS migration, so 0002_rls.sql's REVOKE/GRANT statements have the
-- same starting point they'd have in production.

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant select on all tables in schema public to anon;

-- The grants above only reach tables that exist right now, i.e. 0001's. Every
-- table added by a later migration (documents, case_deadlines, case_fields,
-- approval_requests, ...) would start with no privileges at all, and its
-- policies would then look far stricter here than in production - a test that
-- passes for the wrong reason.
--
-- Supabase keeps new tables in line via default privileges, so do the same.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant select on tables to anon;
