"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  deadlineUrgency,
  type CaseDeadline,
  type TaskStatus,
} from "@/types/database";
import { Badge, TONE_HEX, type Tone } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { InlineEdit } from "@/components/ui/inline-edit";
import { EditToggle, SYNC_HINT } from "@/components/ui/edit-toggle";

const PANEL_TONE: Tone = "amber";

const URGENCY_TONE: Record<string, Tone> = {
  overdue: "rose",
  soon: "amber",
  normal: "gray",
  done: "green",
};

const URGENCY_LABEL: Record<string, string> = {
  overdue: "באיחור",
  soon: "בקרוב",
  normal: "פתוח",
  done: "בוצע",
};

function formatDate(value: string) {
  return new Date(value + "T00:00:00").toLocaleDateString("he-IL");
}

export function DeadlinesPanel({
  deadlines,
  canEdit,
  caseId,
  caseNumber,
}: {
  deadlines: CaseDeadline[];
  canEdit: boolean;
  caseId: string;
  caseNumber: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(deadlines);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // a deadline is a field on the case in עדכנית, named by source_field_name -
  // without it there is no field over there to write to
  function sync(d: CaseDeadline) {
    if (!d.source_field_name) return undefined;
    return {
      entityType: "deadline" as const,
      caseId,
      caseNumber,
      entityId: d.id,
      sourceRef: d.source_field_name,
    };
  }

  async function toggleDone(deadline: CaseDeadline) {
    const status: TaskStatus = deadline.status === "open" ? "done" : "open";
    setRows((prev) =>
      prev.map((d) => (d.id === deadline.id ? { ...d, status } : d)),
    );
    setSavingId(deadline.id);
    const { error } = await supabase
      .from("case_deadlines")
      .update({ status })
      .eq("id", deadline.id);
    setSavingId(null);
    if (error) {
      setRows((prev) =>
        prev.map((d) => (d.id === deadline.id ? deadline : d)),
      );
    }
  }

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      style={{ boxShadow: `inset -3px 0 0 0 ${TONE_HEX[PANEL_TONE]}` }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <Badge tone={PANEL_TONE} dot>
            מועדים ({rows.length})
          </Badge>
          <p className="mt-1.5 text-xs text-gray-400">
            נמשך אוטומטית מעדכנית - לא ניתן להוסיף מועד ידנית.
          </p>
        </div>
        {canEdit && (
          <EditToggle
            editing={editing}
            onToggle={() => setEditing((v) => !v)}
            hint={SYNC_HINT}
          />
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">אין מועדים רשומים</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((d) => {
            const urgency = deadlineUrgency(d.due_date, d.status);
            return (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                {canEdit && (
                  <span className="relative flex h-4 w-4 items-center justify-center">
                    {savingId === d.id ? (
                      <Spinner className="h-4 w-4 text-gray-400" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={d.status === "done"}
                        onChange={() => toggleDone(d)}
                        className="h-4 w-4 accent-blue-600"
                      />
                    )}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className={
                      d.status === "done" && !editing
                        ? "text-sm text-gray-400 line-through"
                        : "text-sm font-medium text-gray-900"
                    }
                  >
                    <InlineEdit
                      table="case_deadlines"
                      rowId={d.id}
                      column="label"
                      value={d.label}
                      editing={editing}
                      sync={sync(d)}
                    />
                  </div>
                  {(editing || d.notes) && (
                    <div className="mt-0.5 text-xs text-gray-500">
                      <InlineEdit
                        table="case_deadlines"
                        rowId={d.id}
                        column="notes"
                        value={d.notes}
                        editing={editing}
                        placeholder="הערה"
                        sync={sync(d)}
                      />
                    </div>
                  )}
                  {editing && (
                    <div className="mt-1 grid gap-1 sm:grid-cols-2">
                      <InlineEdit
                        table="case_deadlines"
                        rowId={d.id}
                        column="zoom_link"
                        value={d.zoom_link}
                        editing
                        placeholder="קישור זום"
                        sync={sync(d)}
                      />
                      <InlineEdit
                        table="case_deadlines"
                        rowId={d.id}
                        column="address"
                        value={d.address}
                        editing
                        placeholder="כתובת"
                        sync={sync(d)}
                      />
                    </div>
                  )}
                </div>
                {!editing && d.zoom_link && (
                  <a
                    href={d.zoom_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 whitespace-nowrap hover:underline"
                  >
                    זום
                  </a>
                )}
                <span className="shrink-0 text-sm text-gray-600 whitespace-nowrap">
                  <InlineEdit
                    table="case_deadlines"
                    rowId={d.id}
                    column="due_date"
                    value={d.due_date}
                    editing={editing}
                    kind="date"
                    render={(v) => (v ? formatDate(v) : "—")}
                    sync={sync(d)}
                  />
                </span>
                <Badge tone={URGENCY_TONE[urgency]}>{URGENCY_LABEL[urgency]}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
