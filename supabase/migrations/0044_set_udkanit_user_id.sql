-- Gamburg CRM - let a manager set a profile's udkanit_user_id.
--
-- 0043 added the column but nothing could write to it: 0004 revoked UPDATE on
-- public.profiles and granted it back for full_name alone, so an update
-- touching udkanit_user_id is refused at the column GRANT even for a manager,
-- whose RLS policy allows the row. Row policies and column privileges are
-- independent - passing one does not get you past the other.
--
-- Same shape as admin_set_user_status: a SECURITY DEFINER function that checks
-- the caller's app-role itself, rather than widening the GRANT. Widening it
-- would let anyone set their own mapping (profiles_update_own covers their own
-- row), and this value decides which person in עדכנית a task gets filed under
-- - so it belongs to whoever administers the mapping, not to the subject of it.
create or replace function public.admin_set_udkanit_user_id(
  target_id uuid,
  new_id int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() is distinct from 'manager' then
    raise exception 'only a manager may set a user''s עדכנית id'
      using errcode = '42501';
  end if;

  update public.profiles
  set udkanit_user_id = new_id
  where id = target_id;
end;
$$;

revoke all on function public.admin_set_udkanit_user_id(uuid, int) from public;
grant execute on function public.admin_set_udkanit_user_id(uuid, int) to authenticated;
