"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  deadlineUrgency,
  type CaseDeadlineWithCase,
  type Case,
  type TaskStatus,
} from "@/types/database";

type RangeKey = "week" | "month" | "all";

const RANGE_LABELS: Record<RangeKey, string> = {
  week: "השבוע",
  month: "החודש",
  all: "הכל",
};

// "week" = rolling 7 days; "month" = through the end of the current
// calendar month (not a rolling 30 days, which could spill into next month)
function rangeEndFor(range: RangeKey, today: Date): Date | null {
  if (range === "all") return null;
  if (range === "week") return new Date(today.getTime() + 7 * 86400000);
  return new Date(today.getFullYear(), today.getMonth() + 1, 0);
}

const URGENCY_BADGE: Record<string, string> = {
  overdue: "bg-rose-50 text-rose-700",
  soon: "bg-amber-50 text-amber-700",
};

const URGENCY_LABEL: Record<string, string> = {
  overdue: "באיחור",
  soon: "בקרוב",
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-blue-50 text-blue-700",
  done: "bg-emerald-50 text-emerald-700",
};

const STATUS_LABEL: Record<string, string> = {
  open: "פתוח",
  done: "בוצע",
};

function formatDate(value: string) {
  return new Date(value + "T00:00:00").toLocaleDateString("he-IL");
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function DeadlinesBoard({
  deadlines,
  canCreate,
  cases,
}: {
  deadlines: CaseDeadlineWithCase[];
  canCreate: boolean;
  cases: Pick<Case, "id" | "case_number" | "case_name">[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(deadlines);
  const [range, setRange] = useState<RangeKey>("week");
  const [showDone, setShowDone] = useState(false);
  const [caseFilter, setCaseFilter] = useState("");
  const [handlerFilter, setHandlerFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const labelOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((d) => d.label))).sort((a, b) =>
        a.localeCompare(b, "he"),
      ),
    [rows],
  );

  const caseOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of rows) {
      if (d.case) map.set(d.case.id, `${d.case.case_number} - ${d.case.case_name}`);
    }
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) =>
      a.label.localeCompare(b.label, "he"),
    );
  }, [rows]);

  const handlerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of rows) {
      if (d.case?.handler) map.set(d.case.handler.id, d.case.handler.full_name);
    }
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) =>
      a.label.localeCompare(b.label, "he"),
    );
  }, [rows]);

  const hasActiveFilters = !!caseFilter || !!handlerFilter || !!labelFilter;

  const filtered = useMemo(() => {
    const today = startOfToday();
    const rangeEnd = rangeEndFor(range, today);

    return rows.filter((d) => {
      if (caseFilter && d.case?.id !== caseFilter) return false;
      if (handlerFilter && d.case?.handler?.id !== handlerFilter) return false;
      if (labelFilter && d.label !== labelFilter) return false;
      if (!showDone && d.status === "done") return false;
      if (rangeEnd === null) return true;
      const due = new Date(d.due_date + "T00:00:00");
      // always surface overdue/open items regardless of range, so nothing
      // gets buried once it's already late
      if (due < today && d.status !== "done") return true;
      return due <= rangeEnd;
    });
  }, [rows, range, showDone, caseFilter, handlerFilter, labelFilter]);

  async function handleCreate(formData: FormData) {
    setFormError(null);
    const label = String(formData.get("label") ?? "").trim();
    const dueDate = String(formData.get("due_date") ?? "");
    const caseId = String(formData.get("case_id") ?? "");
    if (!label || !dueDate || !caseId) {
      setFormError("יש למלא נושא, תיק ותאריך");
      return;
    }

    setCreating(true);
    const { data, error } = await supabase
      .from("case_deadlines")
      .insert({ case_id: caseId, label, due_date: dueDate })
      .select(
        "*, case:cases!case_deadlines_case_id_fkey(id, case_number, case_name, handler:profiles!cases_handler_id_fkey(id, full_name))",
      )
      .single<CaseDeadlineWithCase>();
    setCreating(false);

    if (error) {
      setFormError(error.message);
      return;
    }
    setRows((prev) =>
      [...prev, data].sort(
        (a, b) => +new Date(a.due_date) - +new Date(b.due_date),
      ),
    );
  }

  async function toggleDone(deadline: CaseDeadlineWithCase) {
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
    <div className="space-y-6">
      {canCreate && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">מועד חדש</h2>
          <form
            action={handleCreate}
            key={rows.length}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs text-gray-500">נושא</label>
              <input
                name="label"
                placeholder="למשל: טופס 5"
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">תיק</label>
              <select
                name="case_id"
                required
                defaultValue=""
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="" disabled>
                  בחירה...
                </option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.case_number} - {c.case_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">
                תאריך
              </label>
              <input
                name="due_date"
                type="date"
                required
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "מוסיף..." : "הוספה"}
            </button>
          </form>
          {formError && (
            <p className="mt-2 text-sm text-red-700">{formError}</p>
          )}
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1">
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setRange(key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  range === key
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-200"
                }`}
              >
                {RANGE_LABELS[key]}
              </button>
            ))}
          </div>
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
            <select
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">סוג: הכל</option>
              {labelOptions.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setCaseFilter("");
                  setHandlerFilter("");
                  setLabelFilter("");
                }}
                className="text-sm text-gray-500 underline hover:text-gray-900"
              >
                נקה סינון
              </button>
            )}
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showDone}
                onChange={(e) => setShowDone(e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
              הצג גם שבוצעו
            </label>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            אין מועדים בטווח שנבחר
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((d) => {
              const urgency = deadlineUrgency(d.due_date, d.status);
              const showUrgency = urgency === "overdue" || urgency === "soon";
              return (
                <Link
                  key={d.id}
                  href={d.case ? `/cases/${d.case.id}` : "#"}
                  className={`block rounded-xl border bg-white p-4 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/30 ${
                    urgency === "overdue"
                      ? "border-rose-200"
                      : urgency === "soon"
                        ? "border-amber-200"
                        : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={d.status === "done"}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleDone(d)}
                        className="h-4 w-4 accent-blue-600"
                      />
                      <span className="font-medium text-gray-900">
                        {d.label}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {showUrgency && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${URGENCY_BADGE[urgency]}`}
                        >
                          {URGENCY_LABEL[urgency]}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_BADGE[d.status]}`}
                      >
                        {STATUS_LABEL[d.status]}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    {d.case && (
                      <span>
                        תיק: {d.case.case_number} - {d.case.case_name}
                      </span>
                    )}
                    {d.case?.handler?.full_name && (
                      <span>מטפל: {d.case.handler.full_name}</span>
                    )}
                    <span>תאריך יעד: {formatDate(d.due_date)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
