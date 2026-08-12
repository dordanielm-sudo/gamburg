-- Gamburg CRM - which user in עדכנית a CRM profile is.
--
-- Needed to create a task in עדכנית rather than only update one. Assignment
-- there is a row in dbo.TaskUsers keyed on UserID (dbo.Tasks.MetaplimNames is
-- only a display string alongside it), so writing a new task means knowing the
-- assignee's numeric UserID.
--
-- Matching on the name instead was tried and does not hold up against the live
-- data: MetaplimNames abbreviates ("מזל" for מזל אשטה, "מלי" for מלי גרובר),
-- some values name nobody in the login list at all ("עדי זיקרי", 894 tasks),
-- and at least one is outright ambiguous - "שירן " matches both שירן טולדנו
-- and שירן סלע. A wrong match here assigns a real task to the wrong person
-- silently, so the mapping is stated once, by hand, instead of guessed.
--
-- Nullable: a profile with no mapping simply cannot have tasks created for it
-- in עדכנית, and the write-back says so rather than picking someone.
alter table public.profiles add column udkanit_user_id int;

comment on column public.profiles.udkanit_user_id is
  'vwExportToOuterSystems_LoginUsers.UserID - set by a manager on the users screen';
