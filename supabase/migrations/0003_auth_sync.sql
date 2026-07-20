-- Gamburg CRM - Stage 2: keep public.profiles in sync with auth.users.
--
-- Users are created by the manager via the Supabase Dashboard ("Invite
-- user") or the Admin API, with user_metadata like:
--   { "full_name": "אורית כהן", "role": "handler" }
-- role defaults to 'handler' when not supplied. This is a one-way sync
-- (auth.users -> profiles); there is no self-service signup in stage א'.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'handler')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
