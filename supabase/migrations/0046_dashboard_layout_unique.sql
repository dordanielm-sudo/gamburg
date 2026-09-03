-- Gamburg CRM - at most one dashboard chart arrangement per system.
--
-- screen = 'dashboard_layout' is meant to be a singleton row: the panel
-- reads it back with .maybeSingle() and keeps its id in state to UPDATE on
-- every later change. But nothing on the database side enforced that, and
-- the client-side guard was just "was an id already remembered" - two
-- "add chart" clicks landing before the first insert's response came back
-- both saw no remembered id and both inserted, leaving two rows. From then
-- on .maybeSingle() threw (more than one row matched) on every page load,
-- an error the caller never checked for, and the whole arrangement silently
-- fell back to the defaults - not just the chart someone had just added.
--
-- First keep only the most recently written row for anyone this already
-- happened to, then make it impossible again: a partial unique index scoped
-- to this one screen value, so 'dashboard' (the manager's named, multi-row
-- saved templates) is untouched.
-- tie-broken on id too: two rows can share a created_at at timestamptz
-- precision, and comparing only created_at would then leave both standing,
-- which the unique index below would refuse to allow.
delete from public.view_templates a
using public.view_templates b
where a.screen = 'dashboard_layout'
  and b.screen = 'dashboard_layout'
  and (a.created_at, a.id) < (b.created_at, b.id);

create unique index view_templates_dashboard_layout_singleton
  on public.view_templates (screen)
  where screen = 'dashboard_layout';
