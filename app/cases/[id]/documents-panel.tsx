"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CaseDocumentWithResponsible, DocumentStatus } from "@/types/database";

const STATUS_LABELS: Record<DocumentStatus, string> = {
  valid: "תקין",
  in_correction: "בתיקון",
  correction_needed: "נדרש תיקון",
};

const STATUS_BADGE: Record<DocumentStatus, string> = {
  valid: "bg-emerald-50 text-emerald-700",
  in_correction: "bg-amber-50 text-amber-700",
  correction_needed: "bg-rose-50 text-rose-700",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("he-IL");
}

export function DocumentsPanel({
  documents,
  canEdit,
}: {
  documents: CaseDocumentWithResponsible[];
  canEdit: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(documents);

  async function updateStatus(doc: CaseDocumentWithResponsible, status: DocumentStatus) {
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
      <p className="mb-3 text-xs text-gray-400">
        נמשך אוטומטית מעדכנית - ניתן לעדכן סטטוס, לא להוסיף ידנית.
      </p>

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
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                {[d.doc_type, formatDate(d.doc_date)].filter(Boolean).join(" · ")}
                {d.responsible?.full_name && <span>אחראי: {d.responsible.full_name}</span>}
                {d.file_url && (
                  <a
                    href={d.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    פתיחת מסמך
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
