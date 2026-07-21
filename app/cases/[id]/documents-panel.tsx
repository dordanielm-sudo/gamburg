"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CaseDocument, DocumentStatus } from "@/types/database";

const STATUS_LABELS: Record<DocumentStatus, string> = {
  pending: "בהמתנה",
  received: "התקבל",
  missing: "חסר",
};

const STATUS_BADGE: Record<DocumentStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  received: "bg-emerald-50 text-emerald-700",
  missing: "bg-rose-50 text-rose-700",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("he-IL");
}

export function DocumentsPanel({
  caseId,
  documents,
  canEdit,
}: {
  caseId: string;
  documents: CaseDocument[];
  canEdit: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(documents);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(formData: FormData) {
    setFormError(null);
    const title = String(formData.get("title") ?? "").trim();
    if (!title) {
      setFormError("יש למלא שם מסמך");
      return;
    }

    const docDate = String(formData.get("doc_date") ?? "");

    setCreating(true);
    const { data, error } = await supabase
      .from("documents")
      .insert({
        case_id: caseId,
        title,
        doc_type: String(formData.get("doc_type") ?? "").trim() || null,
        status: String(formData.get("status") ?? "pending") as DocumentStatus,
        doc_date: docDate || null,
      })
      .select("*")
      .single<CaseDocument>();
    setCreating(false);

    if (error) {
      setFormError(error.message);
      return;
    }
    setRows((prev) => [data, ...prev]);
  }

  async function updateStatus(doc: CaseDocument, status: DocumentStatus) {
    setRows((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, status } : d)),
    );
    const { error } = await supabase
      .from("documents")
      .update({ status })
      .eq("id", doc.id);
    if (error) {
      setRows((prev) => prev.map((d) => (d.id === doc.id ? doc : d)));
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold">מסמכים ({rows.length})</h2>

      {canEdit && (
        <form
          action={handleCreate}
          key={rows.length}
          className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3"
        >
          <input
            name="title"
            placeholder="שם מסמך"
            required
            className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            name="doc_type"
            placeholder="סוג מסמך"
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            name="doc_date"
            type="date"
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <select
            name="status"
            defaultValue="pending"
            className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={creating}
            className="col-span-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? "מוסיף..." : "הוספת מסמך"}
          </button>
          {formError && (
            <p className="col-span-2 text-sm text-red-700">{formError}</p>
          )}
        </form>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">אין מסמכים רשומים</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((d) => (
            <li key={d.id} className="py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {d.title}
                </span>
                {canEdit ? (
                  <select
                    value={d.status}
                    onChange={(e) =>
                      updateStatus(d, e.target.value as DocumentStatus)
                    }
                    className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[d.status]}`}
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[d.status]}`}
                  >
                    {STATUS_LABELS[d.status]}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                {[d.doc_type, formatDate(d.doc_date)].filter(Boolean).join(" · ")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
