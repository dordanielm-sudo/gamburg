"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  deadlineUrgency,
  type TaskWithNames,
  type TaskStatus,
  type Profile,
  type Case,
} from "@/types/database";
import { CalendarPopup, formatCalendarDate } from "@/components/calendar-popup";
import { CaseCombobox, type CaseOption } from "@/components/case-combobox";
import { RANGE_LABELS, rangeBounds, startOfToday, type RangeKey } from "@/lib/date-ranges";

const TASK_SELECT =
  "*, assigned_to_profile:profiles!tasks_assigned_to_fkey(id, full_name), created_by_profile:profiles!tasks_created_by_fkey(id, full_name), case:cases!tasks_case_id_fkey(id, case_number, case_name)";

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: "פתוחה",
  done: "בוצעה",
  cancelled: "בוטלה",
};

const STATUS_BADGE: Record<TaskStatus, string> = {
  open: "bg-blue-50 text-blue-700",
  done: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const URGENCY_BADGE: Record<string, string> = {
  overdue: "bg-rose-50 text-rose-700",
  soon: "bg-amber-50 text-amber-700",
};

const URGENCY_LABEL: Record<string, string> = {
  overdue: "באיחור",
  soon: "בקרוב",
};

// synced from עדכנית (PriorityCode/PriorityName) - only code 3 (גבוהה) is
// worth calling out with a badge, "רגילה" (2) is the default and not shown
const HIGH_PRIORITY_CODE = 3;

function formatDate(value: string) {
  return new Date(value + "T00:00:00").toLocaleDateString("he-IL");
}

// earliest due date first; tasks without a due date sink to the bottom
function byDueDate(a: TaskWithNames, b: TaskWithNames) {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date.localeCompare(b.due_date);
}

export function TaskBoard({
  tasks,
  canCreate,
  assignees,
  cases,
  currentUserId,
}: {
  tasks: TaskWithNames[];
  canCreate: boolean;
  assignees: Pick<Profile, "id" | "full_name">[];
  cases: Pick<Case, "id" | "case_number" | "case_name">[];
  currentUserId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(tasks);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createCaseId, setCreateCaseId] = useState("");
  const [createCaseText, setCreateCaseText] = useState("");
  const [caseFilter, setCaseFilter] = useState("");
  const [handlerFilter, setHandlerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("open");
  const [range, setRange] = useState<RangeKey>("all");
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);

  const caseOptions = useMemo(() => {
    const map = new Map<string, CaseOption>();
    for (const t of rows) {
      if (t.case) map.set(t.case.id, t.case);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.case_number.localeCompare(b.case_number, "he"),
    );
  }, [rows]);

  const handlerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of rows) {
      if (t.assigned_to_profile)
        map.set(t.assigned_to_profile.id, t.assigned_to_profile.full_name);
    }
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) =>
      a.label.localeCompare(b.label, "he"),
    );
  }, [rows]);

  const caseFilterOption = caseOptions.find((c) => c.id === caseFilter);
  const caseFilterText = caseFilterOption
    ? `${caseFilterOption.case_number} - ${caseFilterOption.case_name}`
    : "";

  const markedDates = useMemo(
    () => new Set(rows.filter((t) => t.due_date).map((t) => t.due_date as string)),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const today = startOfToday();
    // a specific day picked on the calendar takes over from the range
    // buttons entirely - show exactly that day, no overdue carryover
    const { start, end } = calendarDate
      ? {
          start: new Date(calendarDate + "T00:00:00"),
          end: new Date(calendarDate + "T00:00:00"),
        }
      : rangeBounds(range, today);

    return rows.filter((t) => {
      if (caseFilter && t.case?.id !== caseFilter) return false;
      if (handlerFilter && t.assigned_to !== handlerFilter) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      if (overdueOnly) {
        if (!t.due_date || t.status !== "open") return false;
        return new Date(t.due_date + "T00:00:00") < today;
      }
      if (start === null && end === null) return true;
      if (!t.due_date) return true;
      const due = new Date(t.due_date + "T00:00:00");
      if (!calendarDate && due < today && t.status === "open") return true;
      if (start && due < start) return false;
      if (end && due > end) return false;
      return true;
    });
  }, [rows, caseFilter, handlerFilter, statusFilter, range, calendarDate, overdueOnly]);

  async function handleCreate(formData: FormData) {
    setFormError(null);

    const text = String(formData.get("text") ?? "").trim();
    const assignedTo = String(formData.get("assigned_to") ?? "");
    const dueDate = String(formData.get("due_date") ?? "") || null;
    const notes = String(formData.get("notes") ?? "").trim() || null;

    if (!text || !assignedTo) {
      setFormError("יש למלא תיאור ומטפל");
      return;
    }

    const manualCaseNumber = createCaseText.trim();
    let caseId: string | null = createCaseId || null;
    if (!caseId && manualCaseNumber) {
      const { data: foundCase } = await supabase
        .from("cases")
        .select("id")
        .eq("case_number", manualCaseNumber)
        .maybeSingle();
      if (!foundCase) {
        setFormError(`לא נמצא תיק עם מספר "${manualCaseNumber}"`);
        return;
      }
      caseId = foundCase.id;
    }

    setCreating(true);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        text,
        assigned_to: assignedTo,
        created_by: currentUserId,
        case_id: caseId,
        due_date: dueDate,
        notes,
      })
      .select(TASK_SELECT)
      .single<TaskWithNames>();
    setCreating(false);

    if (error) {
      setFormError(error.message);
      return;
    }
    setRows((prev) => [data, ...prev]);
    setCreateCaseId("");
    setCreateCaseText("");
  }

  async function handleDelete(task: TaskWithNames) {
    if (!confirm(`למחוק לצמיתות את המשימה "${task.text}"? לא ניתן לשחזר.`)) {
      return;
    }
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (!error) {
      setRows((prev) => prev.filter((t) => t.id !== task.id));
    }
  }

  const sortedRows = [...filteredRows].sort(byDueDate);
  const hasActiveFilters =
    !!caseFilter ||
    !!handlerFilter ||
    statusFilter !== "open" ||
    !!calendarDate ||
    overdueOnly;

  return (
    <div className="space-y-6">
      {canCreate && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">משימה חדשה</h2>
          <form
            action={handleCreate}
            key={rows.length}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="min-w-[240px] flex-1">
              <label className="mb-1 block text-xs text-gray-500">
                תיאור
              </label>
              <input
                name="text"
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">מטפל</label>
              <select
                name="assigned_to"
                required
                defaultValue=""
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              >
                <option value="" disabled>
                  בחירה...
                </option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-56">
              <CaseCombobox
                cases={cases}
                label="תיק (אופציונלי)"
                placeholder="ללא תיק - הקלד לחיפוש..."
                onSelect={(c) => {
                  setCreateCaseId(c.id);
                  setCreateCaseText("");
                }}
                onTextChange={(text) => {
                  setCreateCaseId("");
                  setCreateCaseText(text);
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">
                תאריך יעד (אופציונלי)
              </label>
              <input
                name="due_date"
                type="date"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs text-gray-500">
                הערות (אופציונלי)
              </label>
              <input
                name="notes"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "יוצר..." : "יצירה"}
            </button>
          </form>
          {formError && (
            <p className="mt-2 text-sm text-red-700">{formError}</p>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1">
          <button
            onClick={() => {
              setOverdueOnly((v) => !v);
              setCalendarDate(null);
            }}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              overdueOnly
                ? "bg-rose-600 text-white"
                : "text-rose-700 hover:bg-gray-200"
            }`}
          >
            באיחור
          </button>
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
            <button
              key={key}
              onClick={() => {
                setRange(key);
                setCalendarDate(null);
                setOverdueOnly(false);
              }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                !calendarDate && !overdueOnly && range === key
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              {RANGE_LABELS[key]}
            </button>
          ))}
        </div>
        <CalendarPopup
          markedDates={markedDates}
          selectedDate={calendarDate}
          onSelect={(date) => {
            setCalendarDate(date);
            setOverdueOnly(false);
          }}
        />
        {calendarDate && (
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium whitespace-nowrap text-blue-700">
            {formatCalendarDate(calendarDate)}
          </span>
        )}
        <CaseCombobox
          key={caseFilter}
          cases={caseOptions}
          placeholder="תיק: הכל"
          initialText={caseFilterText}
          className="w-56"
          onSelect={(c) => setCaseFilter(c.id)}
          onTextChange={(text) => {
            if (!text) setCaseFilter("");
          }}
        />
        <select
          value={handlerFilter}
          onChange={(e) => setHandlerFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">מטפל: הכל</option>
          {handlerOptions.map((h) => (
            <option key={h.id} value={h.id}>
              {h.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "")}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">סטטוס: הכל</option>
          <option value="open">פתוחות</option>
          <option value="done">בוצעו</option>
          <option value="cancelled">בוטלו</option>
        </select>
        {hasActiveFilters && (
          <button
            onClick={() => {
              setCaseFilter("");
              setHandlerFilter("");
              setStatusFilter("open");
              setCalendarDate(null);
              setOverdueOnly(false);
            }}
            className="text-sm text-gray-500 underline hover:text-gray-900"
          >
            נקה סינון
          </button>
        )}
        <span className="mr-auto rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          {sortedRows.length} משימות
        </span>
      </div>

      {sortedRows.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-400 shadow-sm">
          אין משימות
        </p>
      ) : (
        <div className="space-y-2">
          {sortedRows.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              canDelete={canCreate && t.status !== "open"}
              onDelete={() => handleDelete(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task: t,
  canDelete,
  onDelete,
}: {
  task: TaskWithNames;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const urgency =
    t.due_date && t.status === "open"
      ? deadlineUrgency(t.due_date, t.status)
      : null;
  const showUrgency = urgency === "overdue" || urgency === "soon";

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/30 ${
        urgency === "overdue"
          ? "border-rose-200"
          : urgency === "soon"
            ? "border-amber-200"
            : "border-gray-200"
      }`}
    >
      <Link href={`/tasks/${t.id}`} className="block">
        <div className="flex items-start justify-between gap-3">
          <span className="font-medium text-gray-900">{t.text}</span>
          <div className="flex shrink-0 items-center gap-1.5">
            {t.priority_code === HIGH_PRIORITY_CODE && (
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-orange-700">
                {t.priority_name || "עדיפות גבוהה"}
              </span>
            )}
            {showUrgency && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${URGENCY_BADGE[urgency]}`}
              >
                {URGENCY_LABEL[urgency]}
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_BADGE[t.status]}`}
            >
              {STATUS_LABELS[t.status]}
            </span>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          {t.assigned_to_profile?.full_name && (
            <span>מטפל: {t.assigned_to_profile.full_name}</span>
          )}
          {t.case && (
            <span>
              תיק: {t.case.case_number} - {t.case.case_name}
            </span>
          )}
          {t.due_date && <span>תאריך יעד: {formatDate(t.due_date)}</span>}
          {t.category_name && <span>קטגוריה: {t.category_name}</span>}
        </div>
        {t.notes && <div className="mt-1 text-xs text-gray-500">{t.notes}</div>}
      </Link>
      {canDelete && (
        <div className="mt-2 flex justify-end">
          <button
            onClick={onDelete}
            className="text-xs text-rose-600 hover:text-rose-800 hover:underline"
          >
            מחיקה לצמיתות
          </button>
        </div>
      )}
    </div>
  );
}
