-- Gamburg CRM - Stage 1 schema
-- Entities per אפיון sections 2-3: profiles (users/roles), cases, tasks,
-- notifications, and a generic outbound-sync log for the CRM -> Make -> עדכנית
-- write-back flow described in section 4.2.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('manager', 'handler', 'secretary');
create type public.task_status as enum ('open', 'done');
create type public.notification_type as enum ('new_task', 'new_document', 'stuck_case');
create type public.webhook_status as enum ('pending', 'success', 'failure', 'warning');

-- ---------------------------------------------------------------------------
-- profiles (2.2) - one row per auth.users, holds the role used by RLS
-- ---------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null,
  role       public.user_role not null default 'handler',
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'CRM users. Auto-populated from auth.users on signup (wired in stage 2).';

-- ---------------------------------------------------------------------------
-- cases (2.1)
-- Columns marked "source" are owned by עדכנית and only ever written by the
-- Make sync job (service_role, bypasses RLS). Columns marked "CRM" are owned
-- by this app and are the only ones regular users may update.
-- ---------------------------------------------------------------------------

create table public.cases (
  id         uuid primary key default gen_random_uuid(),

  -- source fields (מעדכנית)
  case_number      text not null unique,   -- מספר תיק - מזהה ייחודי מעדכנית
  case_name        text not null,
  opened_date      date,
  case_type        text,
  case_nature      text,                   -- מהות תיק
  handler_id       uuid references public.profiles (id), -- מטפל בתיק
  external_ref     text,                   -- זיהוי נוסף (מזהה ממערכת חיצונית, נשמר as-is)
  status           text,                   -- סטטוס תיק - read-only מעדכנית בשלב א'
  client_id_number text,                   -- ת.ז לקוח
  client_phone     text,
  spouse_details   jsonb,                  -- פרטי בן/בת זוג (מבנה חופשי: שם/ת.ז/טלפון)
  source_updated_at timestamptz,           -- "עודכן לאחרונה" בעדכנית - למשיכה אינקרמנטלית

  -- CRM-only fields
  flag_problematic_client       boolean not null default false,
  flag_non_paying                boolean not null default false,
  flag_transferring_documents    boolean not null default false,
  manager_note                   text,
  manager_follow_up              boolean not null default false, -- תיבת מעקב מנהל

  -- derived
  last_touched_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cases_handler_id_idx on public.cases (handler_id);
create index cases_status_idx on public.cases (status);
create index cases_last_touched_at_idx on public.cases (last_touched_at);

comment on column public.cases.status is 'Read-only from עדכנית today; kept as a plain column so a future two-way sync needs no migration.';

-- keep updated_at current, and recompute last_touched_at only when an actual
-- "touch" happens: status change, flag change, note, or follow-up toggle
-- (section 4.4: "עדכון/הערה/שינוי סטטוס"). A plain hourly re-sync from
-- עדכנית that changes no such field does not reset the stuck-case clock.
create or replace function public.cases_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if (new.status is distinct from old.status)
     or (new.flag_problematic_client is distinct from old.flag_problematic_client)
     or (new.flag_non_paying is distinct from old.flag_non_paying)
     or (new.flag_transferring_documents is distinct from old.flag_transferring_documents)
     or (new.manager_note is distinct from old.manager_note)
     or (new.manager_follow_up is distinct from old.manager_follow_up)
  then
    new.last_touched_at = now();
  end if;
  return new;
end;
$$;

create trigger cases_before_update
before update on public.cases
for each row execute function public.cases_before_update();

-- ---------------------------------------------------------------------------
-- tasks (2.3)
-- ---------------------------------------------------------------------------

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  text         text not null,
  created_by   uuid not null references public.profiles (id),
  assigned_to  uuid not null references public.profiles (id),
  case_id      uuid references public.cases (id),
  status       public.task_status not null default 'open',
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index tasks_assigned_to_status_idx on public.tasks (assigned_to, status);
create index tasks_case_id_idx on public.tasks (case_id);

-- creating a task on a case counts as a "touch" on that case
create or replace function public.touch_case_on_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.case_id is not null then
    update public.cases set last_touched_at = now() where id = new.case_id;
  end if;
  return new;
end;
$$;

create trigger tasks_touch_case
after insert on public.tasks
for each row execute function public.touch_case_on_task();

-- ---------------------------------------------------------------------------
-- notifications (2.4)
-- ---------------------------------------------------------------------------

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  type       public.notification_type not null,
  user_id    uuid not null references public.profiles (id),
  case_id    uuid references public.cases (id),
  task_id    uuid references public.tasks (id),
  title      text,
  body       text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx on public.notifications (user_id, is_read);

-- auto-create a "new_task" notification for the assignee (definer function so
-- it works regardless of who/what inserted the task, e.g. the manager's session)
create or replace function public.notify_new_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (type, user_id, case_id, task_id, title, body)
  values ('new_task', new.assigned_to, new.case_id, new.id, 'משימה חדשה', new.text);
  return new;
end;
$$;

create trigger tasks_notify_assignee
after insert on public.tasks
for each row execute function public.notify_new_task();

-- ---------------------------------------------------------------------------
-- case_sync_log (4.2) - generic write-back queue/audit trail.
-- Every CRM-side change to a "syncable" case field is logged here, sent to
-- Make as a webhook, and updated with the synchronous success/failure/warning
-- response. This table is the foundation for stage 4; created now so the
-- schema doesn't need to change later.
-- ---------------------------------------------------------------------------

create table public.case_sync_log (
  id             uuid primary key default gen_random_uuid(),
  case_id        uuid not null references public.cases (id),
  field_name     text not null,
  old_value      text,
  new_value      text,
  changed_by     uuid references public.profiles (id),
  webhook_status public.webhook_status not null default 'pending',
  webhook_message text,
  created_at     timestamptz not null default now(),
  responded_at   timestamptz
);

create index case_sync_log_case_id_idx on public.case_sync_log (case_id);
create index case_sync_log_status_idx on public.case_sync_log (webhook_status);
