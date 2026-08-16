-- Gamburg CRM - let a task be deleted while a notification still points at it.
--
-- notifications.task_id references tasks(id) with no ON DELETE action, so the
-- default NO ACTION applies and deleting the task raises a foreign key
-- violation. Hit by task-deletions (a task deleted in עדכנית is deleted here
-- too), but it has always applied to the delete button on the tasks board as
-- well - it just went unnoticed there, because a task old enough to be worth
-- deleting by hand has usually had its notification read and cleared.
--
-- CASCADE rather than SET NULL: the notification is "משימה חדשה הוקצתה לך"
-- about a task that no longer exists. It links to a page that would 404, and
-- with a null task_id it would sit in the bell forever with nothing to open.
-- Nothing about it is worth keeping once its subject is gone.
--
-- case_id is deliberately left alone. Cases are never deleted - they are only
-- ever inserted or updated by the sync (see 0001) - so it has no equivalent
-- failure mode, and giving it a cascade would only make a future accidental
-- case delete quieter than it should be.
alter table public.notifications
  drop constraint notifications_task_id_fkey;

alter table public.notifications
  add constraint notifications_task_id_fkey
  foreign key (task_id) references public.tasks (id) on delete cascade;
