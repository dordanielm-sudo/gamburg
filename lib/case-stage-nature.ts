// Maps a חדל"פ שלב (CRM-only stepper position) to the closest real value in
// עדכנית: case_nature (מהות תיק), the only field on the case that's actually
// synced two-way. There is no "שלב" column in עדכנית at all - confirmed by
// searching MainTik.HozStage/HALICH (always null) and the NetHoz_* tables
// (a different module, execution proceedings, and empty besides). So moving
// the stepper writes to case_nature instead, via the existing case_nature
// write-back path (already verified against the live vwTikMaut list).
//
// מהות is coarser than שלב - several שלבים share one מהות (same comment as
// in case-sync/route.ts's NATURE_TO_STAGE, the reverse direction of this
// map): קליטה/בדיקה מקדמית/הכנת טופס 5 are all "טופס 5 not filed yet" in
// עדכנית's eyes, and דוחות חודשיים is still "אחרי צו" until a rehabilitation
// order is actually issued.
//
// A חדל"פ case can also run through either of two tracks in עדכנית - via the
// רשם (registrar) or the court - worded differently for the same tier
// (confirmed against the live MautName list). Only tiers 2-4 have a
// registrar wording; tiers 1 and 5 don't split.
const STAGE_TO_NATURE: Record<string, { court: string; registrar?: string }> = {
  "קליטה": { court: "1 - לא הוגש טופס 5" },
  "בדיקה מקדמית": { court: "1 - לא הוגש טופס 5" },
  "הכנת טופס 5": { court: "1 - לא הוגש טופס 5" },
  "ממתין לצו": {
    court: "2 - הוגש טופס 5 מחכים לצו",
    registrar: "2 - הוגש טופס 5 מחכים להחלטת רשם",
  },
  "לאחר צו": {
    court: "3 - צו פתיחת הליכים",
    registrar: "3 - התקבלה החלטת רשם",
  },
  "דוחות חודשיים": {
    court: "3 - צו פתיחת הליכים",
    registrar: "3 - התקבלה החלטת רשם",
  },
  "שיקום": {
    court: "4 - צו שיקום כלכלי",
    registrar: "4 - גובש הסדר",
  },
  "הסתיים": { court: "5 - הפטר" },
};

// Picks the wording matching whichever track the case is already on, so
// moving the stepper forward can't silently switch a case from the רשם
// track to the court track (or vice versa) in עדכנית. Defaults to the court
// wording when the current מהות doesn't say - a brand new case, or one at a
// tier that doesn't split by track.
export function natureForStage(
  stage: string,
  currentNature: string | null,
): string | null {
  const entry = STAGE_TO_NATURE[stage];
  if (!entry) return null;
  const onRegistrarTrack = currentNature?.includes("רשם") ?? false;
  return (onRegistrarTrack && entry.registrar) || entry.court;
}
