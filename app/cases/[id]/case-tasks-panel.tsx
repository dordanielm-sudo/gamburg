"use client";

import { useState } from "react";
import Link from "next/link";
import {
  deadlineUrgency,
  type TaskWithNames,
  type TaskStatus,
} from "@/types/database";
import { Badge, type Tone } from "@/components/ui/badge";
import { NamedAvatar } from "@/components/ui/avatar";

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

function byDueDate(a: TaskWithNames, b: TaskWithNames) {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date.localeCompare(b.due_date);
}

export function CaseTasksPanel({ tasks }: { tasks: TaskWithNames[] }) {
  const [showDone, setShowDone] = useState(false);

  const doneCount = tasks.filter((t) => t.status === "done").length;
  const visibleRows = (
    showDone ? tasks : tasks.filter((t) => t.status !== "done")
  ).sort(byDueDate);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">משימות ({visibleRows.length})</h2>
        {doneCount > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => setShowDone(e.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
            הצג גם שבוצעו ({doneCount})
          </label>
        )}
      </div>
      {visibleRows.length === 0 ? (
        <p className="text-sm text-gray-400">אין משימות פתוחות לתיק זה</p>
      ) : (
        <div className="space-y-2">
          {visibleRows.map((t) => {
            const urgency = t.due_date
              ? deadlineUrgency(t.due_date, t.status)
              : null;
            const showUrgency = urgency === "overdue" || urgency === "soon";
            return (
              <Link
                key={t.id}
                href={`/tasks/${t.id}`}
                className={`block rounded-lg border p-3 transition-colors hover:border-blue-300 hover:bg-blue-50/30 ${
                  urgency === "overdue"
                    ? "border-rose-200"
                    : urgency === "soon"
                      ? "border-amber-200"
                      : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-medium text-gray-900">
                    {t.text}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {showUrgency && (
                      <Badge tone={URGENCY_TONE[urgency]}>{URGENCY_LABEL[urgency]}</Badge>
                    )}
                    <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABELS[t.status]}</Badge>
                  </div>
                </div>
                {(t.assigned_to_profile?.full_name || t.due_date) && (
                  <div className="mt-1.5 flex items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    {t.assigned_to_profile?.full_name && (
                      <NamedAvatar name={t.assigned_to_profile.full_name} size="h-5 w-5 text-[9px]" />
                    )}
                    {t.due_date && <span>יעד: {formatDate(t.due_date)}</span>}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
