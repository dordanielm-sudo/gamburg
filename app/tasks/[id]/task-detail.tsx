"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  deadlineUrgency,
  type TaskWithNames,
  type TaskStatus,
} from "@/types/database";
import { Badge, type Tone } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "open", label: "פתוחה" },
  { value: "done", label: "בוצעה" },
  { value: "cancelled", label: "בוטלה" },
];

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

// synced from עדכנית (PriorityCode/PriorityName) - only code 3 (גבוהה) is
// worth calling out with a badge, "רגילה" (2) is the default and not shown
const HIGH_PRIORITY_CODE = 3;

function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value + "T00:00:00").toLocaleDateString("he-IL");
}

export function TaskDetail({
  task,
  canEdit,
}: {
  task: TaskWithNames;
  canEdit: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [current, setCurrent] = useState(task);
  const [saving, setSaving] = useState(false);

  const urgency = current.due_date
    ? deadlineUrgency(current.due_date, current.status)
    : null;
  const showUrgency = urgency === "overdue" || urgency === "soon";

  async function setStatus(status: TaskStatus) {
    if (status === current.status) return;
    const previous = current;
    const patch = {
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
    } as const;

    setSaving(true);
    setCurrent((prev) => ({ ...prev, ...patch }));

    const { error } = await supabase
      .from("tasks")
      .update(patch)
      .eq("id", task.id);
    setSaving(false);

    if (error) {
      setCurrent(previous);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-lg font-semibold text-gray-900">
          {current.text}
        </h1>
        <div className="flex shrink-0 items-center gap-1.5">
          {current.priority_code === HIGH_PRIORITY_CODE && (
            <Badge tone="amber">{current.priority_name || "עדיפות גבוהה"}</Badge>
          )}
          {showUrgency && <Badge tone={URGENCY_TONE[urgency]}>{URGENCY_LABEL[urgency]}</Badge>}
          <Badge tone={STATUS_TONE[current.status]}>
            {STATUS_OPTIONS.find((s) => s.value === current.status)?.label}
          </Badge>
        </div>
      </div>

      {canEdit && (
        <div className="mt-4 flex items-center gap-2">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.value}
              disabled={saving || current.status === s.value}
              onClick={() => setStatus(s.value)}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-default ${
                current.status === s.value
                  ? "bg-blue-600 text-white"
                  : "border border-gray-300 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {s.label}
            </button>
          ))}
          {saving && <Spinner className="h-4 w-4 text-gray-400" />}
        </div>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="מטפל" value={current.assigned_to_profile?.full_name ?? "—"} />
        <Field label="נוצר על ידי" value={current.created_by_profile?.full_name ?? "—"} />
        <Field
          label="תיק"
          value={
            current.case ? (
              <Link
                href={`/cases/${current.case.id}`}
                className="text-blue-700 hover:underline"
              >
                {current.case.case_number} - {current.case.case_name}
              </Link>
            ) : (
              "ללא תיק"
            )
          }
        />
        <Field label="תאריך התחלה" value={formatDate(current.start_date)} />
        <Field label="תאריך יעד" value={formatDate(current.due_date)} />
        <Field label="קטגוריה" value={current.category_name ?? "—"} />
        <Field label="נוצרה בתאריך" value={formatDateTime(current.created_at)} />
        <Field label="הושלמה בתאריך" value={formatDateTime(current.completed_at)} />
      </dl>
      {current.notes && (
        <div className="mt-4">
          <dt className="text-xs text-gray-400">הערות</dt>
          <dd className="mt-0.5 text-sm text-gray-700">{current.notes}</dd>
        </div>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-900">{value}</dd>
    </div>
  );
}
