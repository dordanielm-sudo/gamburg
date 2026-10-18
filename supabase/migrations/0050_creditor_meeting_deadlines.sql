-- Gamburg CRM - creditors' meeting and arrangement session as standing
-- deadlines, derived from the case's own חוצץ data.
--
-- The office asked for מועד אסיפת נושים and מועד ישיבת הסדר (both on the
-- "הסדר נושים" tab) to appear in the deadlines list permanently, not as
-- something a handler adds by hand. That was wired through the Make
-- deadline-sync scenario, and the client reported both missing: the dates
-- sit in the tab, the deadlines list has nothing.
--
-- The scenario had three ways to miss them, any one sufficient:
--   - it only reads cases with TikType = חדל"פ;
--   - its incremental window looks at UserData_Records.tsModifyDate alone,
--     and a tab filled for the first time has only tsCreateDate - the same
--     hole that hid case 1543/0 from the case sync;
--   - the switch to a three-hour window came with no backfill, so a date
--     entered before the switch and never edited since was never sent.
--
-- None of this needs Make. case-field-sync already brings the whole tab,
-- for every case type, into case_fields - the dates are in this database.
-- A second pipeline computing the same thing from the same source with its
-- own filters is how the two drifted apart in the first place. So the
-- deadline is now derived here, from the row that holds the date.
--
-- Scoped to these two fields only. The other deadline fields still come
-- through the scenario, and whether they should follow non-חדל"פ cases
-- too is an open question for the office - moving them would change what
-- the list shows, not just fix it.
--
-- Matched on (page, field), not field alone: a field name is not unique
-- across tabs (0041), and two tabs feeding one (case_id, source_field_name)
-- deadline would overwrite each other.

create or replace function public.case_fields_sync_standing_deadline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.value_date is null then
    return new;
  end if;

  if not (btrim(new.page_name) = 'הסדר נושים'
          and btrim(new.field_name) in ('מועד אסיפת נושים', 'מועד ישיבת הסדר')) then
    return new;
  end if;

  -- case-field-sync upserts the whole tab every time it is touched, so most
  -- updates here rewrite the same date. Only a real change is worth acting
  -- on - and it matters below, where a change can reopen the deadline.
  if TG_OP = 'UPDATE' and new.value_date is not distinct from old.value_date then
    return new;
  end if;

  insert into public.case_deadlines (case_id, source_field_name, page_name, label, due_date)
  values (new.case_id, btrim(new.field_name), btrim(new.page_name), btrim(new.field_name), new.value_date)
  on conflict (case_id, source_field_name) where source_field_name is not null
  do update set
    due_date  = excluded.due_date,
    page_name = excluded.page_name,
    -- label is left alone: it is editable in the CRM.
    --
    -- status is left alone too, with one exception. A handler checking the
    -- meeting off must survive a resync - but a meeting moved to a new
    -- future date is a meeting that has not happened yet, and leaving it
    -- closed would hide it from the list and from the email reminders,
    -- which is the complaint this migration answers.
    status = case
               when case_deadlines.due_date is distinct from excluded.due_date
                    and excluded.due_date >= current_date
               then 'open'::public.task_status
               else case_deadlines.status
             end;

  return new;
end;
$$;

create trigger case_fields_sync_standing_deadline
  after insert or update of value_date, page_name, field_name on public.case_fields
  for each row execute function public.case_fields_sync_standing_deadline();

-- Backfill: every date already in the tab becomes a deadline now, rather
-- than waiting for someone to edit it.
--
-- The touch trigger is held off for this one statement. It resets a case's
-- stuck-case clock on every new deadline, which is right when a deadline is
-- genuinely added and wrong for a backfill - it would mark ~80 cases as
-- recently worked on because a migration ran. Same for the update-side touch,
-- which a reopened deadline would set off.
alter table public.case_deadlines disable trigger case_deadlines_touch_case_insert;
alter table public.case_deadlines disable trigger case_deadlines_touch_case_update;

insert into public.case_deadlines (case_id, source_field_name, page_name, label, due_date)
select cf.case_id, btrim(cf.field_name), btrim(cf.page_name), btrim(cf.field_name), cf.value_date
from public.case_fields cf
where cf.value_date is not null
  and btrim(cf.page_name) = 'הסדר נושים'
  and btrim(cf.field_name) in ('מועד אסיפת נושים', 'מועד ישיבת הסדר')
on conflict (case_id, source_field_name) where source_field_name is not null
do update set
  due_date  = excluded.due_date,
  page_name = excluded.page_name,
  status = case
             when case_deadlines.due_date is distinct from excluded.due_date
                  and excluded.due_date >= current_date
             then 'open'::public.task_status
             else case_deadlines.status
           end
where case_deadlines.due_date is distinct from excluded.due_date
   or case_deadlines.page_name is distinct from excluded.page_name;

alter table public.case_deadlines enable trigger case_deadlines_touch_case_insert;
alter table public.case_deadlines enable trigger case_deadlines_touch_case_update;
