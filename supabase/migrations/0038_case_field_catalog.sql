-- Gamburg CRM - the list of חוצץ fields that exist, without reading their
-- values.
--
-- Every screen that filters on cases builds its field picker by scanning the
-- case_fields rows it already loaded. That forced those screens to load all
-- of them - 67,000 rows once the remaining tabs were pulled from עדכנית, of
-- which 52,000 hold no value at all. An empty row cannot show a value in a
-- column or appear as a choice in a filter, so it was pure payload.
--
-- With this function a screen can load only the rows that carry a value and
-- still offer every field in the picker, which is what those 52,000 rows
-- were really there for.
--
-- SECURITY INVOKER (the default for a plain SQL function): RLS on
-- case_fields still applies, so a user restricted to certain tabs by
-- profile_tab_permissions sees only those tabs listed here too. Making this
-- security definer would leak the names of tabs a user cannot open.

create or replace function public.case_field_catalog()
returns table (page_name text, field_name text)
language sql
stable
set search_path = public
as $$
  select distinct cf.page_name, cf.field_name
  from public.case_fields cf
  order by 1, 2;
$$;

grant execute on function public.case_field_catalog() to authenticated;

-- Serves the distinct scan above from the index instead of reading the
-- table. Also covers the (case_id, page_name) lookups the case detail page
-- makes, which case_fields_case_id_idx only half answered.
create index if not exists case_fields_page_field_idx
  on public.case_fields (page_name, field_name);
