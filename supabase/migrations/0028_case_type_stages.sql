-- Gamburg CRM - שלבים בתיק: a manager-defined ordered stage list per case
-- type (e.g. חדל"פ: קליטה -> הכנת טופס 5 -> ... -> הסתיים). Powers the
-- visual stepper on the case card. Mirrors case_type_column_presets
-- (0019) - same shape (a manager curates a per-case_type ordered list),
-- different purpose (workflow stages, not display columns).
--
-- A case's position in the stepper is found by matching cases.case_nature
-- (free text, synced from עדכנית, editable since 0027) against stage_name
-- here. If it doesn't match any configured stage - not synced yet, wrong
-- wording, or this case_type has no stages configured - the stepper just
-- can't highlight a position; it doesn't error.

create table public.case_type_stages (
  id            uuid primary key default gen_random_uuid(),
  case_type     text not null,
  stage_name    text not null,
  display_order int not null default 0,
  created_at    timestamptz not null default now()
);

create index case_type_stages_case_type_idx
  on public.case_type_stages (case_type, display_order);

alter table public.case_type_stages enable row level security;

-- everyone who can see a case needs to see its stage list, to render the
-- stepper - not just managers
create policy case_type_stages_select_all
  on public.case_type_stages for select
  to authenticated
  using (true);

create policy case_type_stages_insert_manager
  on public.case_type_stages for insert
  to authenticated
  with check (public.current_user_role() = 'manager');

create policy case_type_stages_update_manager
  on public.case_type_stages for update
  to authenticated
  using (public.current_user_role() = 'manager')
  with check (public.current_user_role() = 'manager');

create policy case_type_stages_delete_manager
  on public.case_type_stages for delete
  to authenticated
  using (public.current_user_role() = 'manager');
