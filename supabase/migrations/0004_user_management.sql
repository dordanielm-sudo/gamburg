-- Gamburg CRM - user management (in-app admin panel, manager-only).
--
-- "Deleting" a user is a soft-delete (is_active = false): history on their
-- past cases/tasks/notifications is preserved, they lose all CRM access
-- immediately (current_user_role() below stops recognizing them), and the
-- app-level admin panel additionally disables their Supabase Auth login via
-- the Admin API (service_role, server-side only - not part of this schema).
--
-- role/is_active can only be changed through admin_set_user_status(), never
-- via a raw UPDATE: 'manager' and 'handler' are the same Postgres role
-- (authenticated), so a column-level GRANT can't tell them apart the way it
-- does for public.cases. The function checks the caller's app-role itself.

alter table public.profiles add column is_active boolean not null default true;

-- an inactive profile is no longer recognized as having any role, which
-- shuts it out of every RLS policy that gates on current_user_role().
create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active = true;
$$;

-- self-service: a user may rename themselves, nothing else.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

create or replace function public.admin_set_user_status(
  target_id uuid,
  new_role public.user_role,
  new_active boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() is distinct from 'manager' then
    raise exception 'only a manager may change a user''s role or active status'
      using errcode = '42501';
  end if;

  update public.profiles
  set role = new_role, is_active = new_active
  where id = target_id;
end;
$$;

revoke all on function public.admin_set_user_status(uuid, public.user_role, boolean) from public;
grant execute on function public.admin_set_user_status(uuid, public.user_role, boolean) to authenticated;
