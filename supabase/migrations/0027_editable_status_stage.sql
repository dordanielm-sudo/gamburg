-- Gamburg CRM - allow CRM users to edit case status/stage directly from the
-- case card, syncing back to עדכנית via the same /api/case-updates
-- write-back flow already used for the CRM-only fields (section 4.2).
--
-- status/case_nature were originally "read-only מעדכנית בשלב א'" (see 0001) -
-- the client has since asked (per their spec sheet) for two-way editing on
-- these two fields specifically. RLS row policies (cases_update_manager /
-- cases_update_handler_own) already correctly gate WHICH rows a user may
-- touch - only the column-level grant from 0002 was blocking these two
-- particular columns, so this widens that grant and nothing else.

grant update (status, case_nature) on public.cases to authenticated;
