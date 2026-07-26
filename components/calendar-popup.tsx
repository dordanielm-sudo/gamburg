"use client";

import { useMemo, useState } from "react";

const WEEKDAY_LABELS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const MONTH_LABELS = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

export function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function formatSelected(key: string) {
  return new Date(key + "T00:00:00").toLocaleDateString("he-IL");
}

// small calendar icon that opens a medium-sized popup (not full-screen) -
// picking a day filters the list to that exact date; days that have items
// get a small dot marker so it's clear where to look
export function CalendarPopup({
  markedDates,
  selectedDate,
  onSelect,
}: {
  markedDates: Set<string>;
  selectedDate: string | null;
  onSelect: (date: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const weeks = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(new Date(viewYear, viewMonth, day));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [viewYear, viewMonth]);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  const todayKey = toDateKey(today);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="לוח שנה"
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
          selectedDate
            ? "bg-blue-600 text-white"
            : "text-gray-500 hover:bg-gray-200"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-5 w-5"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
          <div className="flex items-center justify-between px-1 pb-2">
            <button
              onClick={prevMonth}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              ‹
            </button>
            <span className="text-sm font-medium text-gray-900">
              {MONTH_LABELS[viewMonth]} {viewYear}
            </span>
            <button
              onClick={nextMonth}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-400">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {weeks.flat().map((d, i) => {
              if (!d) return <div key={i} />;
              const key = toDateKey(d);
              const isSelected = selectedDate === key;
              const isToday = key === todayKey;
              const hasItems = markedDates.has(key);
              return (
                <button
                  key={i}
                  onClick={() => {
                    onSelect(isSelected ? null : key);
                    setOpen(false);
                  }}
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full text-xs ${
                    isSelected
                      ? "bg-blue-600 font-semibold text-white"
                      : isToday
                        ? "border border-blue-400 font-medium text-blue-700"
                        : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {d.getDate()}
                  {hasItems && !isSelected && (
                    <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-blue-500" />
                  )}
                </button>
              );
            })}
          </div>
          {selectedDate && (
            <button
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className="mt-2 w-full text-center text-xs text-gray-500 underline hover:text-gray-900"
            >
              נקה תאריך נבחר
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export { formatSelected as formatCalendarDate };
