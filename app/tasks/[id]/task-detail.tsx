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
import { NamedAvatar } from "@/components/ui/avatar";
import { FieldGroup } from "@/components/ui/field-group";
import { InlineEdit } from "@/components/ui/inline-edit";
import { EditToggle, SYNC_HINT, LOCAL_HINT } from "@/components/ui/edit-toggle";
import { priorityLabel, priorityTone } from "@/lib/task-priority";

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
  const [editing, setEditing] = useState(false);

  // A task written back to עדכנית needs both a case and a source_task_id -
  // the id עדכנית knows it by. A CRM-only task has neither counterpart, so it
  // saves locally and skips the webhook.
  const sync =
    current.case && current.source_task_id
      ? {
          entityType: "task" as const,
          caseId: current.case.id,
          caseNumber: current.case.case_number,
          entityId: current.id,
          sourceRef: current.source_task_id,
        }
      : undefined;

  function field(
    column: string,
    value: string | number | null,
    kind: "text" | "textarea" | "date" | "number" = "text",
    render?: (v: string) => React.ReactNode,
  ) {
    return (
      <InlineEdit
        table="tasks"
        rowId={current.id}
        column={column}
        value={value}
        editing={editing}
        kind={kind}
        render={render}
        sync={sync}
      />
    );
  }

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
        <h1 className="min-w-0 flex-1 text-lg font-semibold text-gray-900">
          {field("text", current.text)}
        </h1>
        <div className="flex shrink-0 items-center gap-1.5">
          {priorityLabel(current.priority_code, current.priority_name) && (
            <Badge tone={priorityTone(current.priority_code)}>
              {priorityLabel(current.priority_code, current.priority_name)}
            </Badge>
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
          <div className="ms-auto">
            <EditToggle
              editing={editing}
              onToggle={() => setEditing((v) => !v)}
              hint={sync ? SYNC_HINT : LOCAL_HINT}
            />
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <FieldGroup
          title="פרטי משימה"
          tone="indigo"
          fields={[
            {
              label: "מטפל",
              value: current.assigned_to_profile?.full_name ? (
                <NamedAvatar name={current.assigned_to_profile.full_name} />
              ) : (
                "—"
              ),
            },
            {
              label: "תיק",
              value: current.case ? (
                <Link
                  href={`/cases/${current.case.id}`}
                  className="text-blue-700 hover:underline"
                >
                  {current.case.case_number} - {current.case.case_name}
                </Link>
              ) : (
                "ללא תיק"
              ),
            },
            {
              label: "דחיפות",
              value: priorityLabel(
                current.priority_code,
                current.priority_name,
              ) ? (
                <Badge tone={priorityTone(current.priority_code)}>
                  {priorityLabel(current.priority_code, current.priority_name)}
                </Badge>
              ) : (
                "—"
              ),
            },
            { label: "קטגוריה", value: current.category_name ?? "—" },
            { label: "משתמשים מעודכנים", value: current.informed_users_names ?? "—" },
            {
              label: "תאריך התחלה",
              value: field("start_date", current.start_date, "date", (v) =>
                formatDate(v || null),
              ),
            },
            {
              label: "תאריך יעד",
              value: field("due_date", current.due_date, "date", (v) =>
                formatDate(v || null),
              ),
            },
          ]}
        />
        <FieldGroup
          title="מעקב"
          tone="purple"
          fields={[
            {
              label: "נוצר על ידי",
              value: current.created_by_profile?.full_name ? (
                <NamedAvatar name={current.created_by_profile.full_name} />
              ) : (
                "—"
              ),
            },
            { label: "נוצרה בתאריך", value: formatDateTime(current.created_at) },
            { label: "הושלמה בתאריך", value: formatDateTime(current.completed_at) },
          ]}
        />
      </div>
      {(editing || current.notes) && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
          <div className="text-xs text-gray-400">הערות</div>
          <div className="mt-0.5 text-sm text-gray-700">
            {field("notes", current.notes, "textarea")}
          </div>
        </div>
      )}
    </section>
  );
}
