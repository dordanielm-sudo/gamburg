-- Gamburg CRM - granting the case columns the edit screens actually write.
--
-- 0002 deliberately kept `cases` writable only on the CRM-only fields (flags,
-- manager_note, manager_follow_up): everything else came from עדכנית and the
-- CRM had no way to send a change back, so a local edit would just be
-- overwritten by the next sync. 0027 opened status/case_nature/case_stage
-- once the write-back existed for them.
--
-- The edit screens now also write the client details, the case name/type and
-- the open date - but no grant ever followed, so every one of those saves
-- fails with "permission denied for table cases". The UI offered the field
-- and the database refused it.
--
-- These are safe to open for the same reason status was: each save goes out
-- through /api/case-updates, so the change reaches עדכנית instead of waiting
-- to be overwritten.
--
-- case_number stays out, and is the one that must. It is how Make finds the
-- record on the other side (see docs/make-write-back.md) - letting it be
-- edited would break the match for every future write-back on that case,
-- including the one carrying the rename.

grant update (
  client_id_number,
  client_phone,
  client_email,
  client_address,
  case_name,
  case_type,
  opened_date
) on public.cases to authenticated;
