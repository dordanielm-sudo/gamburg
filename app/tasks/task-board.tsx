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
  const [caseFilter, setCaseFilter] = useState("");
  const [handlerFilter, setHandlerFilter] = useState("");
  const [showDone, setShowDone] = useState(false);

  const caseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of rows) {
      if (t.case) map.set(t.case.id, `${t.case.case_number} - ${t.case.case_name}`);
    }
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) =>
      a.label.localeCompare(b.label, "he"),
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

  const filteredRows = useMemo(() => {
    return rows.filter((t) => {
      if (caseFilter && t.case?.id !== caseFilter) return false;
      if (handlerFilter && t.assigned_to !== handlerFilter) return false;
      return true;
    });
  }, [rows, caseFilter, handlerFilter]);

  async function handleCreate(formData: FormData) {
    setFormError(null);

    const text = String(formData.get("text") ?? "").trim();
    const assignedTo = String(formData.get("assigned_to") ?? "");
    const caseId = String(formData.get("case_id") ?? "") || null;
    const dueDate = String(formData.get("due_date") ?? "") || null;

    if (!text || !assignedTo) {
      setFormError("יש למלא תיאור ומטפל");
      return;
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
      })
      .select(TASK_SELECT)
      .single<TaskWithNames>();
    setCreating(false);

    if (error) {
      setFormError(error.message);
      return;
    }
    setRows((prev) => [data, ...prev]);
  }

  const open = filteredRows.filter((t) => t.status === "open").sort(byDueDate);
  const done = filteredRows.filter((t) => t.status === "done").sort(byDueDate);
  const cancelled = filteredRows
    .filter((t) => t.status === "cancelled")
    .sort(byDueDate);

  const hasActiveFilters = !!caseFilter || !!handlerFilter;

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
            <div>
              <label className="mb-1 block text-xs text-gray-500">
                תיק (אופציונלי)
              </label>
              <select
                name="case_id"
                defaultValue=""
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              >
                <option value="">ללא תיק</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.case_number} - {c.case_name}
                  </option>
                ))}
              </select>
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
        <select
          value={caseFilter}
          onChange={(e) => setCaseFilter(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">תיק: הכל</option>
          {caseOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
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
        {hasActiveFilters && (
          <button
            onClick={() => {
              setCaseFilter("");
              setHandlerFilter("");
            }}
            className="text-sm text-gray-500 underline hover:text-gray-900"
          >
            נקה סינון
          </button>
        )}
        <label className="mr-auto flex items-center gap-1.5 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
            className="h-4 w-4 accent-blue-600"
          />
          הצג גם שבוצעו
        </label>
      </div>

      <TaskGroup title="פתוחות" tasks={open} />
      {showDone && <TaskGroup title="בוצעו" tasks={done} />}
      {cancelled.length > 0 && <TaskGroup title="בוטלו" tasks={cancelled} />}
    </div>
  );
}

function TaskGroup({
  title,
  tasks,
}: {
  title: string;
  tasks: TaskWithNames[];
}) {
  return (
    <section>
      <h2 className="mb-3 font-semibold text-gray-900">
        {title} ({tasks.length})
      </h2>
      {tasks.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-400 shadow-sm">
          אין משימות
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </div>
      )}
    </section>
  );
}

function TaskCard({ task: t }: { task: TaskWithNames }) {
  const urgency = t.due_date ? deadlineUrgency(t.due_date, t.status) : null;
  const showUrgency = urgency === "overdue" || urgency === "soon";

  return (
    <Link
      href={`/tasks/${t.id}`}
      className={`block rounded-xl border bg-white p-4 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/30 ${
        urgency === "overdue"
          ? "border-rose-200"
          : urgency === "soon"
            ? "border-amber-200"
            : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium text-gray-900">{t.text}</span>
        <div className="flex shrink-0 items-center gap-1.5">
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
      </div>
    </Link>
  );
}
