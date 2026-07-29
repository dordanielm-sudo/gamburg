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
}: {
  deadlines: CaseDeadline[];
  canEdit: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(deadlines);
  const [savingId, setSavingId] = useState<string | null>(null);

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
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2"
      style={{ boxShadow: `inset -3px 0 0 0 ${TONE_HEX[PANEL_TONE]}` }}
    >
      <div className="mb-3">
        <Badge tone={PANEL_TONE} dot>
          מועדים ({rows.length})
        </Badge>
        <p className="mt-1.5 text-xs text-gray-400">
          נמשך אוטומטית מעדכנית - ניתן לסמן כבוצע, לא להוסיף ידנית.
        </p>
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
                <div className="flex-1">
                  <div
                    className={
                      d.status === "done"
                        ? "text-sm text-gray-400 line-through"
                        : "text-sm font-medium text-gray-900"
                    }
                  >
                    {d.label}
                  </div>
                  {d.notes && (
                    <div className="text-xs text-gray-500">{d.notes}</div>
                  )}
                </div>
                {d.zoom_link && (
                  <a
                    href={d.zoom_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 whitespace-nowrap hover:underline"
                  >
                    זום
                  </a>
                )}
                <span className="text-sm text-gray-600 whitespace-nowrap">
                  {formatDate(d.due_date)}
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
