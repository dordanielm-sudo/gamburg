-- Gamburg CRM - Stage 5 continued: מועדים (deadlines).
--
-- עדכנית tracks several named due-dates per case (e.g. "מועד הגשת טופס 5",
-- "מ.א השלמת מסמכים", "מ.א הגשת כתבי בי-דין"). The point of this table is
-- so the CRM can surface every such date, filtered by range and by handler,
-- so nothing gets missed - per the handler's explicit ask. Pulling these
-- automatically from עדכנית is future work (Make sync); for now rows are
-- entered directly in the CRM, same as hearings/documents.

create table public.case_deadlines (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases (id) on delete cascade,
  label      text not null,             -- e.g. "טופס 5", "השלמת מסמכים", "הגשת כתבי בי-דין"
  due_date   date not null,
  status     public.task_status not null default 'open',
  notes      text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index case_deadlines_case_id_idx on public.case_deadlines (case_id);
create index case_deadlines_due_date_idx on public.case_deadlines (due_date);
create index case_deadlines_status_idx on public.case_deadlines (status);

create or replace function public.case_deadlines_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger case_deadlines_before_update
before update on public.case_deadlines
for each row execute function public.case_deadlines_before_update();

-- adding/changing a deadline counts as a "touch" on the case (section 4.4)
create or replace function public.touch_case_on_deadline()
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

create trigger case_deadlines_touch_case_insert
after insert on public.case_deadlines
for each row execute function public.touch_case_on_deadline();

create trigger case_deadlines_touch_case_update
after update on public.case_deadlines
for each row execute function public.touch_case_on_deadline();

-- ---------------------------------------------------------------------------
-- RLS - identical shape to hearings/documents (0007): manager and secretary
-- see everything, handler sees only their own cases' deadlines.
-- ---------------------------------------------------------------------------

alter table public.case_deadlines enable row level security;

create policy case_deadlines_select_manager_secretary
  on public.case_deadlines for select
  to authenticated
  using (public.current_user_role() in ('manager', 'secretary'));

create policy case_deadlines_select_handler_own
  on public.case_deadlines for select
  to authenticated
  using (
    exists (
      select 1 from public.cases c
      where c.id = case_deadlines.case_id and c.handler_id = auth.uid()
    )
  );

create policy case_deadlines_insert
  on public.case_deadlines for insert
  to authenticated
  with check (
    public.current_user_role() = 'manager'
    or exists (
      select 1 from public.cases c
      where c.id = case_deadlines.case_id and c.handler_id = auth.uid()
    )
  );

create policy case_deadlines_update
  on public.case_deadlines for update
  to authenticated
  using (
    public.current_user_role() = 'manager'
    or exists (
      select 1 from public.cases c
      where c.id = case_deadlines.case_id and c.handler_id = auth.uid()
    )
  )
  with check (
    public.current_user_role() = 'manager'
    or exists (
      select 1 from public.cases c
      where c.id = case_deadlines.case_id and c.handler_id = auth.uid()
    )
  );

create policy case_deadlines_delete_manager
  on public.case_deadlines for delete
  to authenticated
  using (public.current_user_role() = 'manager');
