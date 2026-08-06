-- Gamburg CRM - making the stepper actually show something.
--
-- Two problems this fixes:
--
-- 1. The 0029 seed wrote case_type='חדלפ' (no gershayim), but cases synced
--    from עדכנית carry TikType='חדל"פ' (with). The stepper looks stages up
--    by exact case_type match, so it found none and rendered nothing. The
--    update below realigns the seeded rows to whatever spelling the cases
--    table actually holds, so it's correct either way round.
--
-- 2. case_stage (the stepper's position) is CRM-native and only ever set by
--    a human clicking the stepper - it was null on every case, so even with
--    stages loaded nothing was highlighted, and someone would have had to
--    click through 1,600+ cases by hand. Instead derive a starting stage
--    from מהות תיק (case_nature), which IS synced.
--
--    The mapping is deliberately conservative: מהות תיק is coarser than
--    שלב (several שלב values collapse into one מהות), so where a מהות spans
--    a range of stages we pick the EARLIEST one it could be. "לא הוגש טופס
--    5" could mean קליטה, בדיקה מקדמית or הכנת טופס 5 - we say קליטה, and
--    the handler advances it. Claiming the later stage would assert
--    progress the CRM has no evidence for.
--
--    Only fills stages that are still null, so this is safe to re-run and
--    never overwrites a stage a handler has already set.

-- 1. realign the seeded case_type to the spelling the cases table uses
update public.case_type_stages s
set case_type = c.case_type
from (
  select distinct case_type
  from public.cases
  where replace(case_type, '"', '') = 'חדלפ'
    and case_type is not null
) c
where replace(s.case_type, '"', '') = 'חדלפ'
  and s.case_type is distinct from c.case_type;

-- 2. derive an opening stage from מהות תיק for חדל"פ cases that have none
update public.cases c
set case_stage = m.stage
from (
  values
    ('לא הוגש טופס 5',      'קליטה'),
    ('מחכים לצו',           'ממתין לצו'),
    ('צו פתיחת הליכים',     'לאחר צו'),
    ('שיקום',               'שיקום'),
    ('הפטר',                'הסתיים')
) as m(needle, stage)
where c.case_stage is null
  and c.case_nature is not null
  and replace(c.case_type, '"', '') = 'חדלפ'
  and c.case_nature like '%' || m.needle || '%'
  -- only assign a stage this case_type actually has configured
  and exists (
    select 1 from public.case_type_stages s
    where s.case_type = c.case_type and s.stage_name = m.stage
  );
