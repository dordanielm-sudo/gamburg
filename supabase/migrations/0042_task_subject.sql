-- Gamburg CRM - split a task's כותרת from its גוף, the way עדכנית stores it.
--
-- dbo.Tasks keeps two columns: TaskSubject, the title, set on all 10,153
-- tasks, and TaskText, an optional body present on 3,828 of them (and never
-- without a subject). The incoming sync used to merge the two into this
-- table's single `text` column as "subject: text", which made the write-back
-- ambiguous: an edit in the CRM went to TaskText, leaving TaskSubject on its
-- old value, so the next sync merged them again and the title grew a copy of
-- the body appended to it. Same shape of problem as client_address, which is
-- split in עדכנית and refused for exactly this reason - except here the two
-- halves are independent fields, so the CRM can just hold both.
--
-- `text` becomes nullable because most tasks have no body at all.
alter table public.tasks add column subject text;

alter table public.tasks alter column text drop not null;

-- Whatever a task shows today is its title, so that is what moves to subject:
-- for a synced task that is the merged string, and for a CRM-native one the
-- single line someone typed. The body starts empty and the next incoming sync
-- fills in the real TaskText for every task still open in עדכנית. A task
-- already closed there never syncs again and keeps showing exactly what it
-- shows now, so nothing is lost by not attempting to un-merge the string.
update public.tasks set subject = text, text = null;
