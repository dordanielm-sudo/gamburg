"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  deadlineUrgency,
  taskTitle,
  type TaskWithNames,
  type TaskStatus,
  type Profile,
  type Case,
} from "@/types/database";
import { CalendarPopup, formatCalendarDate } from "@/components/calendar-popup";
import { CaseCombobox, type CaseOption } from "@/components/case-combobox";
import { RANGE_LABELS, rangeBounds, startOfToday, type RangeKey } from "@/lib/date-ranges";
import { Badge, TONE_HEX, type Tone } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { InlineEdit } from "@/components/ui/inline-edit";
import { TaskPriorityEditor } from "./task-priority-editor";
import { collectPriorityOptions } from "@/lib/task-priority";
import { EditToggle, SYNC_HINT } from "@/components/ui/edit-toggle";
import { NamedAvatar } from "@/components/ui/avatar";

const TASK_SELECT =
  "*, assigned_to_profile:profiles!tasks_assigned_to_fkey(id, full_name), created_by_profile:profiles!tasks_created_by_fkey(id, full_name), case:cases!tasks_case_id_fkey(id, case_number, case_name)";

const STATUS_LABELS: Record<TaskStatus, string> = {
  open: "פתוחה",
  done: "בוצעה",
  cancelled: "בוטלה",
};

const STATUS_TONE: Record<TaskStatus, Tone> = {
  open: "blue",
  done: "green",
  cancelled: "gray",
};

const URGENCY_TONE: Record<string, Tone> = {
  overdue: "rose",
  soon: "amber",
};

const URGENCY_LABEL: Record<string, string> = {
  overdue: "באיחור",
  soon: "בקרוב",
};

function formatDate(value: string) {
  return new Date(value + "T00:00:00").toLocaleDateString("he-IL");
}

type SortKey =
  | "text"
  | "case"
  | "priority"
  | "status"
  | "assignee"
  | "start_date"
  | "due_date";

const SORT_LABELS: Record<SortKey, string> = {
  text: "משימה",
  case: "תיק",
  priority: "דחיפות",
  status: "סטטוס",
  assignee: "מטפל",
  start_date: "תאריך התחלה",
  due_date: "תאריך יעד",
};

// null/empty always sinks to the bottom regardless of direction, so an
// undated or unassigned task never buries the rows that do have a value
function sortValue(t: TaskWithNames, key: SortKey): string | number | null {
  switch (key) {
    case "text":
      return taskTitle(t);
    case "case":
      return t.case?.case_number ?? null;
    case "priority":
      return t.priority_code ?? null;
    case "status":
      return t.status;
    case "assignee":
      return t.assigned_to_profile?.full_name ?? null;
    case "start_date":
      return t.start_date;
    case "due_date":
      return t.due_date;
  }
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState(tasks);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createCaseId, setCreateCaseId] = useState("");
  const [createCaseText, setCreateCaseText] = useState("");
  const [caseFilter, setCaseFilter] = useState("");
  const [handlerFilter, setHandlerFilter] = useState("");
  // The status control is a navigation, not local state: anything other than
  // "פתוחות" needs rows the server did not send, so the choice has to reach
  // it. Absent means the default, which is also the cheap query.
  const statusParam = searchParams.get("status");
  const statusFilter: TaskStatus | "" =
    statusParam === null
      ? "open"
      : statusParam === "all"
        ? ""
        : (statusParam as TaskStatus);
  function setStatusFilter(next: TaskStatus | "") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "open") params.delete("status");
    else params.set("status", next === "" ? "all" : next);
    const query = params.toString();
    router.push(query ? `/tasks?${query}` : "/tasks");
  }
  const [priorityFilter, setPriorityFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("due_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [range, setRange] = useState<RangeKey>("all");
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(() => searchParams.get("overdue") === "1");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [pageJumpInput, setPageJumpInput] = useState("");

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

  // built from the data rather than a fixed list - עדכנית has no enum for
  // priority and more codes than the two seen so far may show up. Shared by
  // the filter dropdown and the inline editor, so both always offer the same
  // set; collectPriorityOptions sorts ascending, and the filter shows the
  // highest first.
  const priorityOptions = useMemo(() => collectPriorityOptions(rows), [rows]);
  const priorityFilterOptions = useMemo(
    () => [...priorityOptions].reverse(),
    [priorityOptions],
  );

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
      if (priorityFilter && String(t.priority_code ?? "") !== priorityFilter)
        return false;
      if (overdueOnly) {
        if (!t.due_date || t.status !== "open") return false;
        return new Date(t.due_date + "T00:00:00") < today;
      }
      if (start === null && end === null) return true;
      // strict windows: a range shows only tasks actually due inside it.
      // No-date tasks and overdue carryover used to leak into every range,
      // which made all the buttons look identical once the עדכנית sync
      // filled the board with old open tasks - overdue lives under באיחור
      if (!t.due_date) return false;
      const due = new Date(t.due_date + "T00:00:00");
      if (start && due < start) return false;
      if (end && due > end) return false;
      return true;
    });
  }, [rows, caseFilter, handlerFilter, statusFilter, priorityFilter, range, calendarDate, overdueOnly]);

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
        subject: text,
        assigned_to: assignedTo,
        created_by: currentUserId,
        case_id: caseId,
        due_date: dueDate,
        notes,
      })
      .select(TASK_SELECT)
      .single<TaskWithNames>();

    if (error) {
      setCreating(false);
      setFormError(error.message);
      return;
    }
    setRows((prev) => [data, ...prev]);
    setCreateCaseId("");
    setCreateCaseText("");

    // Saved in the CRM first, then opened in עדכנית - a failure past this
    // point leaves a CRM-only task rather than losing what was typed, so it
    // reports the reason instead of undoing the row.
    try {
      const res = await fetch("/api/task-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: data.id }),
      });
      const result = await res.json();
      // an error response carries `error`, not `message` - checking only the
      // latter swallowed exactly the failures worth seeing (a missing column,
      // an unreachable route), leaving a CRM-only task and no explanation
      if (!res.ok || result.status !== "success") {
        setFormError(
          result.message ??
            result.error ??
            `הסנכרון לעדכנית נכשל (${res.status})`,
        );
      } else if (result.record_id) {
        setRows((prev) =>
          prev.map((t) =>
            t.id === data.id ? { ...t, source_task_id: result.record_id } : t,
          ),
        );
      }
    } catch {
      setFormError("המשימה נשמרה ב-CRM אך לא ניתן היה לפתוח אותה בעדכנית");
    }
    setCreating(false);
  }

  async function handleDelete(task: TaskWithNames) {
    if (!confirm(`למחוק לצמיתות את המשימה "${taskTitle(task)}"? לא ניתן לשחזר.`)) {
      return;
    }
    setDeletingId(task.id);
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    setDeletingId(null);
    if (!error) {
      setRows((prev) => prev.filter((t) => t.id !== task.id));
    }
  }

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const aEmpty = av === null || av === "";
      const bEmpty = bv === null || bv === "";
      if (aEmpty || bEmpty) {
        if (aEmpty && bEmpty) return 0;
        return aEmpty ? 1 : -1;
      }
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv), "he") * dir;
    });
  }, [filteredRows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // dates read best oldest-first, priority highest-first
      setSortDir(key === "priority" ? "desc" : "asc");
    }
  }

  // pagination, same shape as the cases table: filters changing resets to
  // page 1 (adjusted during render rather than in an effect)
  const filtersSignature = JSON.stringify([
    caseFilter,
    handlerFilter,
    statusFilter,
    priorityFilter,
    range,
    calendarDate,
    overdueOnly,
    pageSize,
  ]);
  const [pageResetKey, setPageResetKey] = useState(filtersSignature);
  if (filtersSignature !== pageResetKey) {
    setPageResetKey(filtersSignature);
    setPage(1);
  }
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedRows = sortedRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const pageWindow = (() => {
    const span = 2;
    const nums = new Set<number>([
      1,
      pageCount,
      ...Array.from(
        { length: span * 2 + 1 },
        (_, i) => currentPage - span + i,
      ).filter((n) => n >= 1 && n <= pageCount),
    ]);
    return Array.from(nums).sort((a, b) => a - b);
  })();

  function jumpToPage() {
    const n = Number(pageJumpInput);
    if (Number.isInteger(n) && n >= 1 && n <= pageCount) {
      setPage(n);
    }
    setPageJumpInput("");
  }

  const hasActiveFilters =
    !!caseFilter ||
    !!handlerFilter ||
    statusFilter !== "open" ||
    !!priorityFilter ||
    !!calendarDate ||
    overdueOnly;

  // a task can stand alone with no case (case_id is nullable), and the
  // write-back is keyed on the case - so a case-less task is editable
  // locally but has nothing to push to עדכנית
  function syncFor(t: TaskWithNames) {
    // no case, or no source_task_id, means nothing to write back to: the
    // first has no case to hang the change on, the second is a task that
    // only ever existed in the CRM, so עדכנית has no record to update.
    if (!t.case || !t.source_task_id) return undefined;
    return {
      entityType: "task" as const,
      caseId: t.case.id,
      caseNumber: t.case.case_number,
      entityId: t.id,
      sourceRef: t.source_task_id,
    };
  }

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
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating && <Spinner className="h-4 w-4" />}
              {creating ? "יוצר..." : "יצירה"}
            </button>
          </form>
          {formError && (
            <p className="mt-2 text-sm text-red-700">{formError}</p>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {canCreate && (
          <EditToggle
            editing={editing}
            onToggle={() => setEditing((v) => !v)}
            hint={SYNC_HINT}
          />
        )}
        <div className="scroll-strip flex max-w-full shrink-0 items-center gap-1 overflow-x-auto rounded-full bg-gray-100 p-1">
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
        {priorityOptions.length > 0 && (
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">דחיפות: הכל</option>
            {priorityFilterOptions.map((p) => (
              <option key={p.code} value={String(p.code)}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {hasActiveFilters && (
          <button
            onClick={() => {
              setCaseFilter("");
              setHandlerFilter("");
              setStatusFilter("open");
              setPriorityFilter("");
              setCalendarDate(null);
              setOverdueOnly(false);
            }}
            className="text-sm text-gray-500 underline hover:text-gray-900"
          >
            נקה סינון
          </button>
        )}
        <span className="mr-auto">
          <Badge tone="indigo">
            {sortedRows.length} משימות
            {pageCount > 1 ? ` · עמוד ${currentPage} מתוך ${pageCount}` : ""}
          </Badge>
        </span>
      </div>

      {sortedRows.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-400 shadow-sm">
          אין משימות
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-indigo-100 bg-indigo-50/60 text-right">
              <tr>
                <th className="w-1 p-0" aria-hidden />
                {(
                  [
                    ["text", ""],
                    ["case", ""],
                    ["priority", "text-center"],
                    ["status", "text-center"],
                    ["assignee", ""],
                    ["due_date", ""],
                  ] as [SortKey, string][]
                ).map(([key, align]) => (
                  <th
                    key={key}
                    onClick={() => toggleSort(key)}
                    title="לחיצה למיון"
                    className={`cursor-pointer px-4 py-3 font-semibold whitespace-nowrap text-indigo-900 select-none hover:text-indigo-700 ${align}`}
                  >
                    {SORT_LABELS[key]}
                    {sortKey === key && (
                      <span className="mr-1 text-xs">
                        {sortDir === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </th>
                ))}
                {canCreate && (
                  <th className="px-4 py-3 font-semibold text-indigo-900">פעולות</th>
                )}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((t) => {
                const urgency =
                  t.due_date && t.status === "open"
                    ? deadlineUrgency(t.due_date, t.status)
                    : null;
                const showUrgency = urgency === "overdue" || urgency === "soon";
                // one primary badge per row: an open task's urgency (overdue/
                // soon) is more actionable than "it's open" - only rows that
                // actually need attention get a colored side accent, so red
                // stays meaningful instead of every row having some color
                const primaryTone: Tone = showUrgency ? URGENCY_TONE[urgency] : STATUS_TONE[t.status];
                const primaryLabel = showUrgency ? URGENCY_LABEL[urgency] : STATUS_LABELS[t.status];
                const canDelete = canCreate && t.status !== "open";
                const deleting = deletingId === t.id;
                return (
                  <tr
                    key={t.id}
                    className="border-b border-gray-100 transition-colors hover:bg-gray-50/60"
                    style={
                      showUrgency
                        ? { boxShadow: `inset -3px 0 0 0 ${TONE_HEX[primaryTone]}` }
                        : undefined
                    }
                  >
                    <td className="w-1 p-0" aria-hidden />
                    <td className="px-4 py-3.5">
                      {editing ? (
                        <InlineEdit
                          table="tasks"
                          rowId={t.id}
                          column="subject"
                          value={taskTitle(t)}
                          editing
                          sync={syncFor(t)}
                        />
                      ) : (
                        <Link
                          href={`/tasks/${t.id}`}
                          prefetch={false}
                          className="font-semibold text-gray-900 hover:text-blue-700 hover:underline"
                        >
                          {taskTitle(t)}
                        </Link>
                      )}
                      {editing ? (
                        <div className="mt-1">
                          <InlineEdit
                            table="tasks"
                            rowId={t.id}
                            column="notes"
                            value={t.notes}
                            editing
                            placeholder="הערה"
                            sync={syncFor(t)}
                          />
                        </div>
                      ) : (
                        (t.notes || t.category_name) && (
                          <div className="mt-0.5 text-xs text-gray-400">
                            {[t.category_name, t.notes].filter(Boolean).join(" · ")}
                          </div>
                        )
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-gray-600">
                      {t.case ? (
                        <Link
                          href={`/cases/${t.case.id}`}
                          prefetch={false}
                          className="hover:text-blue-700 hover:underline"
                        >
                          {t.case.case_number} - {t.case.case_name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center whitespace-nowrap">
                      <TaskPriorityEditor
                        task={t}
                        options={priorityOptions}
                        editing={editing}
                      />
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <Badge tone={primaryTone} size="md">
                        {primaryLabel}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-gray-600">
                      {t.assigned_to_profile?.full_name ? (
                        <NamedAvatar name={t.assigned_to_profile.full_name} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-gray-600">
                      <InlineEdit
                        table="tasks"
                        rowId={t.id}
                        column="due_date"
                        value={t.due_date}
                        editing={editing}
                        kind="date"
                        render={(v) => (v ? formatDate(v) : "—")}
                        sync={syncFor(t)}
                      />
                    </td>
                    {canCreate && (
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(t)}
                            disabled={deleting}
                            className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-800 hover:underline disabled:opacity-50"
                          >
                            {deleting && <Spinner className="h-3 w-3" />}
                            מחיקה
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sortedRows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>משימות בעמוד:</span>
            {[25, 50, 100].map((size) => (
              <button
                key={size}
                onClick={() => setPageSize(size)}
                className={`rounded-md px-2.5 py-1 ${
                  size === pageSize
                    ? "bg-indigo-600 text-white"
                    : "border border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {size}
              </button>
            ))}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                הקודם
              </button>
              {pageWindow.map((p, i) => (
                <span key={p} className="flex items-center">
                  {i > 0 && pageWindow[i - 1] !== p - 1 && (
                    <span className="px-1 text-gray-400">…</span>
                  )}
                  <button
                    onClick={() => setPage(p)}
                    className={`rounded-md px-3 py-1.5 text-sm ${
                      p === currentPage
                        ? "bg-indigo-600 text-white"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {p}
                  </button>
                </span>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage === pageCount}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                הבא
              </button>
              <input
                type="number"
                min={1}
                max={pageCount}
                value={pageJumpInput}
                onChange={(e) => setPageJumpInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && jumpToPage()}
                placeholder="עמוד…"
                className="mr-1 w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
              />
              <button
                onClick={jumpToPage}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                עבור
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
