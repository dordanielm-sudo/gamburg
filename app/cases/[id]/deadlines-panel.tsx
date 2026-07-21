"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  deadlineUrgency,
  type CaseDeadline,
  type TaskStatus,
} from "@/types/database";

const URGENCY_BADGE: Record<string, string> = {
  overdue: "bg-rose-50 text-rose-700",
  soon: "bg-amber-50 text-amber-700",
  normal: "bg-gray-100 text-gray-600",
  done: "bg-emerald-50 text-emerald-700",
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
  caseId,
  deadlines,
  canEdit,
}: {
  caseId: string;
  deadlines: CaseDeadline[];
  canEdit: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(deadlines);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(formData: FormData) {
    setFormError(null);
    const label = String(formData.get("label") ?? "").trim();
    const dueDate = String(formData.get("due_date") ?? "");
    if (!label || !dueDate) {
      setFormError("יש למלא נושא ותאריך");
      return;
    }

    setCreating(true);
    const { data, error } = await supabase
      .from("case_deadlines")
      .insert({
        case_id: caseId,
        label,
        due_date: dueDate,
        notes: String(formData.get("notes") ?? "").trim() || null,
      })
      .select("*")
      .single<CaseDeadline>();
    setCreating(false);

    if (error) {
      setFormError(error.message);
      return;
    }
    setRows((prev) =>
      [data, ...prev].sort(
        (a, b) => +new Date(a.due_date) - +new Date(b.due_date),
      ),
    );
  }

  async function toggleDone(deadline: CaseDeadline) {
    const status: TaskStatus = deadline.status === "open" ? "done" : "open";
    setRows((prev) =>
      prev.map((d) => (d.id === deadline.id ? { ...d, status } : d)),
    );
    const { error } = await supabase
      .from("case_deadlines")
      .update({ status })
      .eq("id", deadline.id);
    if (error) {
      setRows((prev) =>
        prev.map((d) => (d.id === deadline.id ? deadline : d)),
      );
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
      <h2 className="mb-3 font-semibold">מועדים ({rows.length})</h2>

      {canEdit && (
        <form
          action={handleCreate}
          key={rows.length}
          className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3 sm:grid-cols-4"
        >
          <input
            name="label"
            placeholder="נושא (למשל: טופס 5)"
            required
            className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2"
          />
          <input
            name="due_date"
            type="date"
            required
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "מוסיף..." : "הוספת מועד"}
          </button>
          <input
            name="notes"
            placeholder="הערות"
            className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5 text-sm sm:col-span-4"
          />
          {formError && (
            <p className="col-span-2 text-sm text-red-700 sm:col-span-4">
              {formError}
            </p>
          )}
        </form>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">אין מועדים רשומים</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((d) => {
            const urgency = deadlineUrgency(d.due_date, d.status);
            return (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                {canEdit && (
                  <input
                    type="checkbox"
                    checked={d.status === "done"}
                    onChange={() => toggleDone(d)}
                    className="h-4 w-4 accent-blue-600"
                  />
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
                <span className="text-sm text-gray-600 whitespace-nowrap">
                  {formatDate(d.due_date)}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${URGENCY_BADGE[urgency]}`}
                >
                  {URGENCY_LABEL[urgency]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
