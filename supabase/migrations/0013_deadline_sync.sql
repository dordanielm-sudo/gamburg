-- Gamburg CRM - pilot import of deadlines (מועדים) from עדכנית's custom
-- fields (vwExportToOuterSystems_UserData), mirroring case-sync/task-sync.
-- טופס 5, כתבי בי-דין, and תאריך דיון are all single-value-per-case fields
-- there (not a repeating list), so case_id + the source field name is a
-- natural upsert key - added as a nullable column so manually-created
-- deadlines (no source field) are unconstrained.

alter table public.case_deadlines add column source_field_name text;

create unique index case_deadlines_case_source_field_idx
  on public.case_deadlines (case_id, source_field_name)
  where source_field_name is not null;

-- touch_case_on_deadline (0007) fired on every insert/update, which meant a
-- routine automated resync of a deadline's due_date would perpetually reset
-- the stuck-case clock - defeating that detection. Only a new deadline
-- appearing or a genuine status change (a handler checking it off) should
-- count as a touch; syncing the same due_date again should not.
create or replace function public.touch_case_on_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' or (TG_OP = 'UPDATE' and new.status is distinct from old.status) then
    update public.cases set last_touched_at = now() where id = new.case_id;
  end if;
  return new;
end;
$$;
