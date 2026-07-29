-- Gamburg CRM - per-case-type fixed columns on the cases list.
--
-- Different case types (e.g. הוצל"פ/עיקולים vs חדל"פ) care about different
-- חוצץ fields as "always visible" columns, not just as an ad-hoc pick
-- (the existing שדות להצגה picker from migration 0017/0018's UI). A
-- manager configures, per case_type, an ordered list of (page_name,
-- field_name) pairs; the cases table shows them as extra fixed columns
-- whenever the "סוג תיק" filter is narrowed to exactly that one type.

create table public.case_type_column_presets (
  id             uuid primary key default gen_random_uuid(),
  case_type      text not null,
  page_name      text not null,
  field_name     text not null,
  display_order  int not null default 0,
  created_at     timestamptz not null default now()
);

create index case_type_column_presets_case_type_idx
  on public.case_type_column_presets (case_type, display_order);

alter table public.case_type_column_presets enable row level security;

-- everyone who can see the cases list needs to see the column presets, so
-- the extra columns render for handlers/secretaries too, not just managers
create policy case_type_column_presets_select_all
  on public.case_type_column_presets for select
  to authenticated
  using (true);

create policy case_type_column_presets_insert_manager
  on public.case_type_column_presets for insert
  to authenticated
  with check (public.current_user_role() = 'manager');

create policy case_type_column_presets_update_manager
  on public.case_type_column_presets for update
  to authenticated
  using (public.current_user_role() = 'manager')
  with check (public.current_user_role() = 'manager');

create policy case_type_column_presets_delete_manager
  on public.case_type_column_presets for delete
  to authenticated
  using (public.current_user_role() = 'manager');
