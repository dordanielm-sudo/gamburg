-- Gamburg CRM - חוצצים (tabs) infrastructure: generic per-case fields
-- synced from עדכנית's custom-fields view (vwExportToOuterSystems_UserData),
-- mirroring its own PageName/FieldName/strData/dateData/numData shape
-- instead of hardcoding one column per field per tab. New tabs (any new
-- PageName) show up automatically as data arrives, with no further
-- migration needed.
--
-- Read-only for now (synced via the same admin-client pattern as
-- case-sync/task-sync/deadline-sync) - no insert/update/delete policies for
-- authenticated users, only select. value_date/value_number are kept
-- alongside value_text (rather than storing everything as text) so a
-- future editable version can pick the right input widget per field
-- without re-deriving the type from a raw string - editing + write-back to
-- עדכנית is real future work, not just display, per explicit note.

create table public.case_fields (
  id                uuid primary key default gen_random_uuid(),
  case_id           uuid not null references public.cases (id) on delete cascade,
  page_name         text not null,   -- e.g. 'חדל"פ', 'הסדר נושים', 'כללי'
  field_name        text not null,   -- e.g. 'סכום צו', 'שם נאמן'
  value_text        text,
  value_date        date,
  value_number      numeric,
  source_updated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (case_id, page_name, field_name)
);

create index case_fields_case_id_idx on public.case_fields (case_id);
create index case_fields_page_name_idx on public.case_fields (page_name);

create or replace function public.case_fields_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger case_fields_before_update
before update on public.case_fields
for each row execute function public.case_fields_before_update();

-- ---------------------------------------------------------------------------
-- RLS - same read shape as case_deadlines/documents: manager and secretary
-- see everything, handler sees only their own cases' fields. No write
-- policies for authenticated users - only the admin client (service_role,
-- bypasses RLS) writes here, via the case-field-sync webhook.
-- ---------------------------------------------------------------------------

alter table public.case_fields enable row level security;

create policy case_fields_select_manager_secretary
  on public.case_fields for select
  to authenticated
  using (public.current_user_role() in ('manager', 'secretary'));

create policy case_fields_select_handler_own
  on public.case_fields for select
  to authenticated
  using (
    exists (
      select 1 from public.cases c
      where c.id = case_fields.case_id and c.handler_id = auth.uid()
    )
  );
