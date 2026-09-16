// Which deadlines are worth an email reminder, and how far ahead.
//
// Not every deadline warrants one. These four are meetings and hearings
// someone has to physically show up to or prepare for, which is why the
// office asked for them specifically - a document-completion deadline
// slipping by a day is recoverable, a hearing is not.
//
// Matched on source_field_name, the עדכנית field the deadline was synced
// from, rather than on the label: the label is editable in the CRM and a
// handler renaming one would silently switch its reminders off.
//
// page_name is deliberately not part of the match. The deadline-sync
// scenario has never sent it (every case_deadlines row has page_name null),
// so requiring it here would match nothing at all - the exact shape of
// failure AGENTS.md warns about, where a filter that looks right returns an
// empty set and reads as "nothing due today".
export const REMINDER_SOURCE_FIELDS = [
  "מועד אסיפת נושים",
  "מועד ישיבת הסדר",
  "תאריך דיון.",
  "מועד חקירה",
] as const;

// Two reminders per deadline, counted in working days rather than calendar
// days: the last working day before it, and the one before that.
//
// Counting calendar days silently loses the most important reminders. A
// hearing on Sunday would have been announced on Friday and Saturday, when
// the office is closed and nobody reads mail - so the reminder that mattered
// most arrived when it could do the least. In working days the same hearing
// is announced on Thursday and Wednesday.
export const REMINDER_LEAD_WORKING_DAYS = [2, 1] as const;

// Sunday through Thursday. getUTCDay(): 0 = Sunday, 5 = Friday, 6 = Saturday.
export function isWorkingDay(isoDate: string): boolean {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day !== 5 && day !== 6;
}

// The nth working day before a date - which is the day its nth reminder goes
// out. Walks backwards rather than forwards so a due date that itself falls
// on a weekend still gets its reminders, on the working days before it.
export function nthWorkingDayBefore(isoDate: string, n: number): string {
  let cursor = isoDate;
  let remaining = n;
  // A week of weekend in a row is impossible, so this cannot run away; the
  // bound is a guard against a malformed date, not an expected case.
  for (let step = 0; step < n * 7 + 7 && remaining > 0; step++) {
    cursor = addDays(cursor, -1);
    if (isWorkingDay(cursor)) remaining--;
  }
  return cursor;
}

// The office works in Israel; the server does not. Computing "two days from
// today" off the server's UTC date is right for most of the day and wrong
// for the hours either side of midnight - which is exactly when a nightly
// job tends to run.
export const OFFICE_TIME_ZONE = "Asia/Jerusalem";

export function officeToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is what a date column wants.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OFFICE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
