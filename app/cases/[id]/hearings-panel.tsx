"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Hearing, HearingStatus } from "@/types/database";

const STATUS_LABELS: Record<HearingStatus, string> = {
  scheduled: "מתוזמן",
  held: "התקיים",
  postponed: "נדחה",
  cancelled: "בוטל",
};

const STATUS_BADGE: Record<HearingStatus, string> = {
  scheduled: "bg-blue-50 text-blue-700",
  held: "bg-emerald-50 text-emerald-700",
  postponed: "bg-amber-50 text-amber-700",
  cancelled: "bg-gray-100 text-gray-500",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function HearingsPanel({
  caseId,
  hearings,
  canEdit,
}: {
  caseId: string;
  hearings: Hearing[];
  canEdit: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(hearings);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(formData: FormData) {
    setFormError(null);
    const hearingAt = String(formData.get("hearing_at") ?? "");
    if (!hearingAt) {
      setFormError("יש למלא תאריך ושעה");
      return;
    }

    setCreating(true);
    const { data, error } = await supabase
      .from("hearings")
      .insert({
        case_id: caseId,
        court: String(formData.get("court") ?? "").trim() || null,
        judge: String(formData.get("judge") ?? "").trim() || null,
        hearing_type: String(formData.get("hearing_type") ?? "").trim() || null,
        hearing_at: new Date(hearingAt).toISOString(),
        notes: String(formData.get("notes") ?? "").trim() || null,
      })
      .select("*")
      .single<Hearing>();
    setCreating(false);

    if (error) {
      setFormError(error.message);
      return;
    }
    setRows((prev) =>
      [data, ...prev].sort(
        (a, b) => +new Date(b.hearing_at) - +new Date(a.hearing_at),
      ),
    );
  }

  async function updateStatus(hearing: Hearing, status: HearingStatus) {
    setRows((prev) =>
      prev.map((h) => (h.id === hearing.id ? { ...h, status } : h)),
    );
    const { error } = await supabase
      .from("hearings")
      .update({ status })
      .eq("id", hearing.id);
    if (error) {
      setRows((prev) =>
        prev.map((h) => (h.id === hearing.id ? hearing : h)),
      );
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold">דיונים ({rows.length})</h2>

      {canEdit && (
        <form
          action={handleCreate}
          key={rows.length}
          className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3"
        >
          <input
            name="court"
            placeholder="בית משפט"
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            name="judge"
            placeholder="שופט/ת"
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            name="hearing_type"
            placeholder="סוג דיון"
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            name="hearing_at"
            type="datetime-local"
            required
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            name="notes"
            placeholder="הערות"
            className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="col-span-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "מוסיף..." : "הוספת דיון"}
          </button>
          {formError && (
            <p className="col-span-2 text-sm text-red-700">{formError}</p>
          )}
        </form>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">אין דיונים רשומים</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((h) => (
            <li key={h.id} className="py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {formatDateTime(h.hearing_at)}
                </span>
                {canEdit ? (
                  <select
                    value={h.status}
                    onChange={(e) =>
                      updateStatus(h, e.target.value as HearingStatus)
                    }
                    className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[h.status]}`}
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[h.status]}`}
                  >
                    {STATUS_LABELS[h.status]}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                {[h.court, h.judge, h.hearing_type].filter(Boolean).join(" · ") ||
                  "—"}
              </div>
              {h.notes && (
                <div className="mt-1 text-xs text-gray-600">{h.notes}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
