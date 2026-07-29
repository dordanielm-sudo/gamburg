"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CaseDocumentWithResponsible, DocumentStatus } from "@/types/database";
import { Badge, TONE_BADGE, type Tone } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { NamedAvatar } from "@/components/ui/avatar";

const STATUS_LABELS: Record<DocumentStatus, string> = {
  valid: "תקין",
  in_correction: "בתיקון",
  correction_needed: "נדרש תיקון",
};

const STATUS_TONE: Record<DocumentStatus, Tone> = {
  valid: "green",
  in_correction: "amber",
  correction_needed: "rose",
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
  const [savingId, setSavingId] = useState<string | null>(null);

  async function updateStatus(doc: CaseDocumentWithResponsible, status: DocumentStatus) {
    setRows((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, status } : d)),
    );
    setSavingId(doc.id);
    const { error } = await supabase
      .from("documents")
      .update({ status })
      .eq("id", doc.id);
    setSavingId(null);
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
                  <div className="flex items-center gap-1.5">
                    {savingId === d.id && <Spinner className="h-3.5 w-3.5 text-gray-400" />}
                    <select
                      value={d.status}
                      onChange={(e) =>
                        updateStatus(d, e.target.value as DocumentStatus)
                      }
                      disabled={savingId === d.id}
                      className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium ${TONE_BADGE[STATUS_TONE[d.status]]}`}
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABELS[d.status]}</Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                <span>{[d.doc_type, formatDate(d.doc_date)].filter(Boolean).join(" · ")}</span>
                {d.responsible?.full_name && (
                  <NamedAvatar name={d.responsible.full_name} size="h-5 w-5 text-[9px]" />
                )}
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
