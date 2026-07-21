-- Gamburg CRM - Stage 5: case detail expansion
-- Adds a "team" field to cases, plus two new linked entities per the
-- handler's spreadsheet of required fields: hearings (דיונים) and
-- documents (מסמכים). Both are CRM-only (not synced from עדכנית).

-- ---------------------------------------------------------------------------
-- cases.team (2.1 addendum) - צוות מטפל בתיק, free text (e.g. team name)
-- ---------------------------------------------------------------------------

alter table public.cases add column team text;

grant update (team) on public.cases to authenticated;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.hearing_status as enum ('scheduled', 'held', 'postponed', 'cancelled');
create type public.document_status as enum ('pending', 'received', 'missing');

-- ---------------------------------------------------------------------------
-- hearings (דיונים)
-- ---------------------------------------------------------------------------

create table public.hearings (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases (id) on delete cascade,
  court        text,                    -- בית משפט/בית דין
  judge        text,                    -- שם השופט/ת
  hearing_type text,                    -- סוג הדיון (free text - e.g. "קדם משפט")
  hearing_at   timestamptz not null,
  status       public.hearing_status not null default 'scheduled',
  notes        text,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index hearings_case_id_idx on public.hearings (case_id);
create index hearings_hearing_at_idx on public.hearings (hearing_at);

create or replace function public.hearings_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger hearings_before_update
before update on public.hearings
for each row execute function public.hearings_before_update();

-- adding/changing a hearing counts as a "touch" on the case (section 4.4)
create or replace function public.touch_case_on_hearing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cases set last_touched_at = now() where id = new.case_id;
  return new;
end;
$$;

create trigger hearings_touch_case_insert
after insert on public.hearings
for each row execute function public.touch_case_on_hearing();

create trigger hearings_touch_case_update
after update on public.hearings
for each row execute function public.touch_case_on_hearing();

-- ---------------------------------------------------------------------------
-- documents (מסמכים)
-- ---------------------------------------------------------------------------

create table public.documents (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases (id) on delete cascade,
  title      text not null,             -- שם/תיאור המסמך
  doc_type   text,                      -- סוג מסמך (free text - e.g. "טופס 5")
  status     public.document_status not null default 'pending',
  doc_date   date,                      -- תאריך המסמך/קבלתו
  notes      text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_case_id_idx on public.documents (case_id);

create or replace function public.documents_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger documents_before_update
before update on public.documents
for each row execute function public.documents_before_update();

create or replace function public.touch_case_on_document()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cases set last_touched_at = now() where id = new.case_id;
  return new;
end;
$$;

create trigger documents_touch_case_insert
after insert on public.documents
for each row execute function public.touch_case_on_document();

create trigger documents_touch_case_update
after update on public.documents
for each row execute function public.touch_case_on_document();

-- ---------------------------------------------------------------------------
-- RLS - same visibility shape as cases (2.1): manager and secretary see
-- everything, handler sees only rows on cases they handle. Insert/update
-- allowed for manager and the handling handler; delete is manager-only
-- (a handler who made a mistake should ask the manager, not silently
-- remove case history).
-- ---------------------------------------------------------------------------

alter table public.hearings enable row level security;

create policy hearings_select_manager_secretary
  on public.hearings for select
  to authenticated
  using (public.current_user_role() in ('manager', 'secretary'));

create policy hearings_select_handler_own
  on public.hearings for select
  to authenticated
  using (
    exists (
      select 1 from public.cases c
      where c.id = hearings.case_id and c.handler_id = auth.uid()
    )
  );

create policy hearings_insert
  on public.hearings for insert
  to authenticated
  with check (
    public.current_user_role() = 'manager'
    or exists (
      select 1 from public.cases c
      where c.id = hearings.case_id and c.handler_id = auth.uid()
    )
  );

create policy hearings_update
  on public.hearings for update
  to authenticated
  using (
    public.current_user_role() = 'manager'
    or exists (
      select 1 from public.cases c
      where c.id = hearings.case_id and c.handler_id = auth.uid()
    )
  )
  with check (
    public.current_user_role() = 'manager'
    or exists (
      select 1 from public.cases c
      where c.id = hearings.case_id and c.handler_id = auth.uid()
    )
  );

create policy hearings_delete_manager
  on public.hearings for delete
  to authenticated
  using (public.current_user_role() = 'manager');

alter table public.documents enable row level security;

create policy documents_select_manager_secretary
  on public.documents for select
  to authenticated
  using (public.current_user_role() in ('manager', 'secretary'));

create policy documents_select_handler_own
  on public.documents for select
  to authenticated
  using (
    exists (
      select 1 from public.cases c
      where c.id = documents.case_id and c.handler_id = auth.uid()
    )
  );

create policy documents_insert
  on public.documents for insert
  to authenticated
  with check (
    public.current_user_role() = 'manager'
    or exists (
      select 1 from public.cases c
      where c.id = documents.case_id and c.handler_id = auth.uid()
    )
  );

create policy documents_update
  on public.documents for update
  to authenticated
  using (
    public.current_user_role() = 'manager'
    or exists (
      select 1 from public.cases c
      where c.id = documents.case_id and c.handler_id = auth.uid()
    )
  )
  with check (
    public.current_user_role() = 'manager'
    or exists (
      select 1 from public.cases c
      where c.id = documents.case_id and c.handler_id = auth.uid()
    )
  );

create policy documents_delete_manager
  on public.documents for delete
  to authenticated
  using (public.current_user_role() = 'manager');
