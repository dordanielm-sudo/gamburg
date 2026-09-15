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

// Two reminders per deadline: one with a working day still in hand, one the
// day before.
export const REMINDER_DAYS_BEFORE = [2, 1] as const;

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
