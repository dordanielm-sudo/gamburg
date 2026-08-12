-- Gamburg CRM - every valued חוצץ field, grouped by case, in one round trip.
--
-- PostgREST caps a select at db.max_rows (1000), so reading the 14,583 valued
-- field rows took fifteen sequential requests. The data is small - the whole
-- table is 29 MB - but fifteen round trips is fifteen network latencies
-- stacked end to end before a single row is used, and the app server does not
-- sit next to the database. That, not the volume, was the cost.
--
-- Returning one jsonb value sidesteps the row cap entirely: it is a single
-- row, so a single request, whatever the field count grows to.
--
-- SECURITY INVOKER (the default for a plain SQL function): RLS on case_fields
-- still applies, so a user restricted by profile_tab_permissions gets only the
-- tabs they may read. Security definer here would hand every user every tab.

create or replace function public.case_fields_grouped()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(g.case_id, g.fields), '{}'::jsonb)
  from (
    select cf.case_id::text as case_id,
           jsonb_agg(
             jsonb_build_object(
               'page_name', cf.page_name,
               'field_name', cf.field_name,
               'value_text', cf.value_text,
               'value_date', cf.value_date,
               'value_number', cf.value_number
             )
             order by cf.page_name, cf.field_name
           ) as fields
    from public.case_fields cf
    -- an empty field shows nothing in a column and offers nothing to filter
    -- on; four fifths of the rows are empty
    where cf.value_text is not null
       or cf.value_date is not null
       or cf.value_number is not null
    group by cf.case_id
  ) g;
$$;

grant execute on function public.case_fields_grouped() to authenticated;
