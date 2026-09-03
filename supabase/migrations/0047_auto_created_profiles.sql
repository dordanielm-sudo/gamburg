-- Gamburg CRM - profiles created automatically from a sync, with no login
-- yet.
--
-- handler_name in a synced case/task frequently names someone with no
-- profile at all (confirmed live: 11+ distinct names). Leaving handler_id
-- unset until a manager notices and creates an account meant every case or
-- task attributed to that person sat unassigned in the meantime, and had to
-- be found and fixed by hand once the account finally existed.
--
-- profiles.id is a hard foreign key into auth.users (0001), so a profile can
-- only ever exist alongside a real Supabase Auth user - there is no such
-- thing as "a profile with no login". The Admin API also requires an email
-- to create one, and the sync has no real email to give it. So an
-- auto-created profile gets a placeholder address under .invalid (RFC 2606 -
-- a TLD that can never be registered, so nothing is ever actually sent
-- there) and a random password nobody is told. It behaves like any other
-- profile - handler_id already points at it, it shows up in pickers - except
-- nobody can sign in until a manager replaces the placeholder with a real
-- email on the users screen, which already works today via the existing
-- email-edit action.
--
-- auto_created exists so that screen can find these accounts to finish
-- setting up, without guessing from the placeholder address.
alter table public.profiles add column auto_created boolean not null default false;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, auto_created)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'handler'),
    coalesce((new.raw_user_meta_data ->> 'auto_created')::boolean, false)
  );
  return new;
end;
$$;
