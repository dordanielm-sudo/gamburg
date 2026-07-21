"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TaskWithNames, TaskStatus } from "@/types/database";

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

export function CaseTasksPanel({
  tasks,
  currentUserId,
  isManager,
}: {
  tasks: TaskWithNames[];
  currentUserId: string;
  isManager: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(tasks);

  async function toggleDone(task: TaskWithNames) {
    if (task.status === "cancelled") return;
    const nextStatus: TaskStatus = task.status === "open" ? "done" : "open";
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

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
      <h2 className="mb-3 font-semibold">משימות ({rows.length})</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">אין משימות לתיק זה</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((t) => {
            const canToggle =
              t.status !== "cancelled" &&
              (isManager || t.assigned_to === currentUserId);
            return (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                {canToggle ? (
                  <input
                    type="checkbox"
                    checked={t.status === "done"}
                    onChange={() => toggleDone(t)}
                    className="h-4 w-4 accent-blue-600"
                  />
                ) : (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_BADGE[t.status]}`}
                  >
                    {STATUS_LABELS[t.status]}
                  </span>
                )}
                <div className="flex-1">
                  <div
                    className={
                      t.status === "done" || t.status === "cancelled"
                        ? "text-sm text-gray-400 line-through"
                        : "text-sm font-medium text-gray-900"
                    }
                  >
                    {t.text}
                  </div>
                  {t.assigned_to_profile?.full_name && (
                    <div className="text-xs text-gray-500">
                      למטפל: {t.assigned_to_profile.full_name}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
