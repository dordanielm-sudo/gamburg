-- Gamburg CRM - בקרה ואישורים: a generic 3-step approval workflow (עובד
-- מטפל מגיש -> עורך דין בודק -> מנהלת מאשרת), per the client's spec
-- example ("בקשה להחרגת רכב"). request_type is free text rather than an
-- enum so any future approval type works without a migration - same
-- reasoning as case_fields' generic shape.

create type public.approval_status as enum (
  'pending_review',
  'pending_approval',
  'approved',
  'rejected'
);

create table public.approval_requests (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases (id) on delete cascade,
  request_type text not null,             -- e.g. "בקשה להחרגת רכב"
  status       public.approval_status not null default 'pending_review',
  submitted_by uuid not null references public.profiles (id),  -- עובד מטפל
  reviewed_by  uuid references public.profiles (id),            -- עורך דין בודק
  approved_by  uuid references public.profiles (id),            -- מנהלת מאשרת
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index approval_requests_case_id_idx on public.approval_requests (case_id);
create index approval_requests_status_idx on public.approval_requests (status);

create or replace function public.approval_requests_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger approval_requests_before_update
before update on public.approval_requests
for each row execute function public.approval_requests_before_update();

-- adding/changing an approval request counts as a "touch" on the case
-- (section 4.4), same pattern as case_deadlines/hearings
create or replace function public.touch_case_on_approval_request()
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

create trigger approval_requests_touch_case_insert
after insert on public.approval_requests
for each row execute function public.touch_case_on_approval_request();

create trigger approval_requests_touch_case_update
after update on public.approval_requests
for each row execute function public.touch_case_on_approval_request();

-- ---------------------------------------------------------------------------
-- RLS - same shape as case_deadlines: manager/secretary see everything,
-- handler sees only their own cases' requests. Any authenticated user who
-- can see a case can submit a request for it and move it along the
-- workflow; a manager-only check for the final approval step is enforced
-- in application code (the button simply isn't offered to non-managers),
-- not at the RLS layer, since "who happens to review/approve" isn't tied
-- to a fixed role beyond the final approval.
-- ---------------------------------------------------------------------------

alter table public.approval_requests enable row level security;

create policy approval_requests_select_manager_secretary
  on public.approval_requests for select
  to authenticated
  using (public.current_user_role() in ('manager', 'secretary'));

create policy approval_requests_select_handler_own
  on public.approval_requests for select
  to authenticated
  using (
    exists (
      select 1 from public.cases c
      where c.id = approval_requests.case_id and c.handler_id = auth.uid()
    )
  );

create policy approval_requests_insert
  on public.approval_requests for insert
  to authenticated
  with check (
    public.current_user_role() = 'manager'
    or exists (
      select 1 from public.cases c
      where c.id = approval_requests.case_id and c.handler_id = auth.uid()
    )
  );

create policy approval_requests_update
  on public.approval_requests for update
  to authenticated
  using (
    public.current_user_role() = 'manager'
    or exists (
      select 1 from public.cases c
      where c.id = approval_requests.case_id and c.handler_id = auth.uid()
    )
  )
  with check (
    public.current_user_role() = 'manager'
    or exists (
      select 1 from public.cases c
      where c.id = approval_requests.case_id and c.handler_id = auth.uid()
    )
  );

create policy approval_requests_delete_manager
  on public.approval_requests for delete
  to authenticated
  using (public.current_user_role() = 'manager');
