-- Real Supabase projects grant broad table privileges to anon/authenticated/
-- service_role by default and rely on RLS (plus, here, column-level grants)
-- to actually restrict access. Reproduce that baseline before applying the
-- app's RLS migration, so 0002_rls.sql's REVOKE/GRANT statements have the
-- same starting point they'd have in production.

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant select on all tables in schema public to anon;
