"use client";

import { useState } from "react";
import type { ViewTemplate } from "@/types/database";

// The saved-template controls, shared by every screen that has them
// (cases, deadlines, approvals, and each dashboard chart).
//
// It exists because the same block had been copied onto four screens and
// then improved on only one of them: the dashboard learned which template
// was applied and how to overwrite it, while the other three still dropped
// the selection the moment it was made and could only ever save a new row.
// Correcting a filter there meant saving a near-duplicate under a new name
// and deleting the old one.
//
// The select is bound to appliedId rather than to "", so the control keeps
// showing what is on screen instead of resetting to the placeholder. That
// is what makes "עדכון" mean something: there is an answer to which
// template it would overwrite.

export function TemplateBar({
  templates,
  appliedId,
  onApply,
  onDetach,
  onSave,
  onUpdate,
  onDelete,
  canSave = true,
  saveHint,
}: {
  templates: ViewTemplate[];
  appliedId: string;
  onApply: (id: string) => void;
  onDetach: () => void;
  onSave: (name: string) => Promise<string | null>;
  onUpdate: () => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
  // false while the current view has nothing worth saving (no conditions),
  // so the button explains itself instead of failing on click
  canSave?: boolean;
  saveHint?: string;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const applied = templates.find((t) => t.id === appliedId) ?? null;

  async function run(action: () => Promise<string | null>) {
    setError(null);
    setPending(true);
    const message = await action();
    setPending(false);
    if (message) setError(message);
    return message;
  }

  async function save() {
    if (!name.trim()) {
      setError("יש לתת שם לתבנית");
      return;
    }
    if (!canSave) {
      setError(saveHint ?? "אין מה לשמור");
      return;
    }
    const failed = await run(() => onSave(name.trim()));
    if (!failed) setName("");
  }

  async function remove() {
    if (!applied) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setConfirmingDelete(false);
    await run(() => onDelete(applied.id));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {templates.length > 0 && (
        <select
          value={appliedId}
          onChange={(e) => {
            setConfirmingDelete(false);
            if (e.target.value) onApply(e.target.value);
            else onDetach();
          }}
          aria-label="תבנית שמורה"
          className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">תבנית שמורה...</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

      {applied ? (
        <>
          <button
            onClick={() => run(onUpdate)}
            disabled={pending}
            title={`שמירת המסננים שעל המסך לתוך "${applied.name}"`}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            עדכון התבנית
          </button>
          <button
            onClick={remove}
            disabled={pending}
            className={`rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
              confirmingDelete
                ? "border-rose-300 bg-rose-600 text-white hover:bg-rose-700"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {confirmingDelete ? "למחוק?" : "מחיקה"}
          </button>
          <button
            onClick={() => {
              setConfirmingDelete(false);
              onDetach();
            }}
            title="המשך לערוך בלי לשנות את התבנית"
            className="text-sm text-gray-500 hover:text-gray-900 hover:underline"
          >
            ניתוק
          </button>
        </>
      ) : (
        <>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="שם תבנית חדשה"
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={save}
            disabled={pending}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            שמירה כתבנית
          </button>
        </>
      )}

      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
