"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TaskWithNames, Profile, Case } from "@/types/database";

const TASK_SELECT =
  "*, assigned_to_profile:profiles!tasks_assigned_to_fkey(id, full_name), created_by_profile:profiles!tasks_created_by_fkey(id, full_name), case:cases!tasks_case_id_fkey(id, case_number, case_name)";

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

  async function toggleDone(task: TaskWithNames) {
    const nextStatus = task.status === "open" ? "done" : "open";
    const patch = {
      status: nextStatus,
      completed_at: nextStatus === "done" ? new Date().toISOString() : null,
    } as const;

    setRows((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, ...patch } : t)),
    );

    const { error } = await supabase
      .from("tasks")
      .update(patch)
      .eq("id", task.id);

    if (error) {
      setRows((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }
  }

  const open = filteredRows.filter((t) => t.status === "open");
  const done = filteredRows.filter((t) => t.status === "done");
  const cancelled = filteredRows.filter((t) => t.status === "cancelled");

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

      <TaskList title="פתוחות" tasks={open} onToggle={toggleDone} />
      {showDone && (
        <TaskList title="בוצעו" tasks={done} onToggle={toggleDone} />
      )}
      {cancelled.length > 0 && (
        <TaskList
          title="בוטלו"
          tasks={cancelled}
          onToggle={toggleDone}
          readOnly
        />
      )}
    </div>
  );
}

function TaskList({
  title,
  tasks,
  onToggle,
  readOnly,
}: {
  title: string;
  tasks: TaskWithNames[];
  onToggle: (t: TaskWithNames) => void;
  readOnly?: boolean;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold">
        {title} ({tasks.length})
      </h2>
      {tasks.length === 0 ? (
        <p className="text-sm text-gray-400">אין משימות</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              {!readOnly && (
                <input
                  type="checkbox"
                  checked={t.status === "done"}
                  onChange={() => onToggle(t)}
                />
              )}
              <div className="flex-1">
                <div
                  className={
                    t.status === "done" ? "text-gray-400 line-through" : ""
                  }
                >
                  {t.text}
                </div>
                <div className="text-xs text-gray-500">
                  {t.assigned_to_profile?.full_name &&
                    `למטפל: ${t.assigned_to_profile.full_name}`}
                  {t.case &&
                    ` · תיק ${t.case.case_number} - ${t.case.case_name}`}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
