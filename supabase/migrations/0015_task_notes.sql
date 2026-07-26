-- Gamburg CRM - free-text notes on a task, separate from the main text/
-- description, per explicit request. Also: manager-only permanent delete
-- for completed/cancelled tasks (explicit request: "לבדוק מבחינת משימות
-- שבוצעו למחוק אותם מה-CRM" - a real, irreversible delete, not an archive).

alter table public.tasks add column notes text;

grant update (notes) on public.tasks to authenticated;

create policy tasks_delete_manager
  on public.tasks for delete
  to authenticated
  using (public.current_user_role() = 'manager');
