-- Gamburg CRM - per-user חוצץ (tab) visibility ("הרשאות פרטניות... המנהל
-- בוחר איזה חוצצים המשתמש יוכל לראות"). A profile with zero rows here is
-- unrestricted (sees every tab - the default, so nothing changes for
-- anyone until a manager opts a specific user into a restriction). A
-- profile with any rows can only see the page_names listed for them.
-- Manager is always exempt (they're the one configuring this).
--
-- Enforced once, at the case_fields RLS layer, so it's consistent across
-- every consumer (case detail page tabs, the cases-list field picker from
-- migration 0017/0018, the per-case-type fixed columns from 0019) without
-- touching any of that application code.

create table public.profile_tab_permissions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  page_name  text not null,
  created_at timestamptz not null default now(),
  unique (profile_id, page_name)
);

create index profile_tab_permissions_profile_id_idx
  on public.profile_tab_permissions (profile_id);

alter table public.profile_tab_permissions enable row level security;

-- a user must be able to see their own restriction rows, or the case_fields
-- policy's subquery below would see nothing and treat everyone as
-- unrestricted regardless of what's actually configured
create policy profile_tab_permissions_select_own_or_manager
  on public.profile_tab_permissions for select
  to authenticated
  using (profile_id = auth.uid() or public.current_user_role() = 'manager');

create policy profile_tab_permissions_insert_manager
  on public.profile_tab_permissions for insert
  to authenticated
  with check (public.current_user_role() = 'manager');

create policy profile_tab_permissions_delete_manager
  on public.profile_tab_permissions for delete
  to authenticated
  using (public.current_user_role() = 'manager');

-- ---------------------------------------------------------------------------
-- case_fields RLS - same base visibility as before (manager/secretary see
-- all, handler sees their own cases' fields), now AND-ed with the tab
-- restriction check.
-- ---------------------------------------------------------------------------

drop policy case_fields_select_manager_secretary on public.case_fields;
drop policy case_fields_select_handler_own on public.case_fields;

create policy case_fields_select
  on public.case_fields for select
  to authenticated
  using (
    (
      public.current_user_role() in ('manager', 'secretary')
      or exists (
        select 1 from public.cases c
        where c.id = case_fields.case_id and c.handler_id = auth.uid()
      )
    )
    and (
      public.current_user_role() = 'manager'
      or not exists (
        select 1 from public.profile_tab_permissions
        where profile_id = auth.uid()
      )
      or exists (
        select 1 from public.profile_tab_permissions
        where profile_id = auth.uid() and page_name = case_fields.page_name
      )
    )
  );
