// Shared week/next-week/month range logic used by the deadlines, tasks, and
// cases screens - kept in one place so the "calendar week" and "end of
// month" definitions can't drift between pages.

export type RangeKey = "week" | "nextWeek" | "month" | "all";

export const RANGE_LABELS: Record<RangeKey, string> = {
  week: "השבוע",
  nextWeek: "שבוע הבא",
  month: "החודש",
  all: "הכל",
};

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// calendar week = Sunday through Saturday (not a rolling 7 days)
export function weekBounds(weeksAhead: number, today: Date) {
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay() + weeksAhead * 7);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return { start: sunday, end: saturday };
}

// "month" = today through the end of the current calendar month (not a
// rolling 30 days, which could spill into next month)
export function rangeBounds(
  range: RangeKey,
  today: Date,
): { start: Date | null; end: Date | null } {
  if (range === "all") return { start: null, end: null };
  if (range === "week") return weekBounds(0, today);
  if (range === "nextWeek") return weekBounds(1, today);
  return {
    start: today,
    end: new Date(today.getFullYear(), today.getMonth() + 1, 0),
  };
}
