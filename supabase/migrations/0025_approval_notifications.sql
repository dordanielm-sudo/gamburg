-- Gamburg CRM - notifications for בקרה ואישורים: managers get notified when
-- a new request comes in, and the submitter gets notified once it's
-- decided (approved/rejected). A trigger, same pattern as notify_new_task,
-- so it fires regardless of which client (UI, future API) writes the row.

alter type public.notification_type add value 'approval_request_submitted';
alter type public.notification_type add value 'approval_request_decided';

create or replace function public.notify_on_approval_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  case_label text;
  mgr record;
begin
  select case_number || ' - ' || case_name into case_label
  from public.cases where id = new.case_id;

  if TG_OP = 'INSERT' then
    for mgr in select id from public.profiles where role = 'manager' and is_active loop
      insert into public.notifications (type, user_id, case_id, title, body)
      values (
        'approval_request_submitted',
        mgr.id,
        new.case_id,
        'בקשת אישור חדשה',
        new.request_type || ' - תיק ' || coalesce(case_label, '')
      );
    end loop;
  elsif TG_OP = 'UPDATE'
    and new.status is distinct from old.status
    and new.status in ('approved', 'rejected')
  then
    insert into public.notifications (type, user_id, case_id, title, body)
    values (
      'approval_request_decided',
      new.submitted_by,
      new.case_id,
      case when new.status = 'approved' then 'בקשת האישור שלך אושרה' else 'בקשת האישור שלך נדחתה' end,
      new.request_type || ' - תיק ' || coalesce(case_label, '')
    );
  end if;

  return new;
end;
$$;

create trigger approval_requests_notify_insert
after insert on public.approval_requests
for each row execute function public.notify_on_approval_request();

create trigger approval_requests_notify_update
after update on public.approval_requests
for each row execute function public.notify_on_approval_request();
