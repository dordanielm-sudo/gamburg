"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";

// Free-text sibling of StatusStageEditor: same optimistic-save + write-back
// contract (save locally, POST /api/case-updates, revert if Make rejects),
// for the plain source columns on cases (client contact details, case name).
//
// Rendered as static text until the card's edit mode is switched on, so the
// default reading view stays a reading view and a stray click can't change
// a synced value.
export function EditableCaseField({
  caseId,
  caseNumber,
  fieldName,
  value,
  editing,
  type = "text",
  placeholder = "—",
}: {
  caseId: string;
  caseNumber: string;
  fieldName: string;
  value: string | null;
  editing: boolean;
  type?: "text" | "tel" | "email" | "date";
  placeholder?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [current, setCurrent] = useState(value ?? "");
  const [draft, setDraft] = useState(value ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const newValue = draft.trim();
    if (newValue === current) return;
    setError(null);
    const oldValue = current;
    setCurrent(newValue);
    setPending(true);

    const { error: dbError } = await supabase
      .from("cases")
      .update({ [fieldName]: newValue || null })
      .eq("id", caseId);

    if (dbError) {
      setCurrent(oldValue);
      setDraft(oldValue);
      setPending(false);
      setError("שגיאה בשמירה");
      return;
    }

    try {
      const res = await fetch("/api/case-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: caseId,
          case_number: caseNumber,
          field_name: fieldName,
          old_value: oldValue,
          new_value: newValue,
        }),
      });
      const result = await res.json();
      if (result.status === "failure") {
        await supabase
          .from("cases")
          .update({ [fieldName]: oldValue || null })
          .eq("id", caseId);
        setCurrent(oldValue);
        setDraft(oldValue);
        setError(result.message ?? "כשל בסנכרון");
      }
    } catch {
      setError("לא ניתן להתחבר לשרת הסנכרון");
    }
    setPending(false);
  }

  if (!editing) {
    return <span>{current || placeholder}</span>;
  }

  return (
    <span className="flex items-center gap-1.5">
      <input
        type={type}
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(current);
            e.currentTarget.blur();
          }
        }}
        className="w-full min-w-0 rounded-md border border-blue-300 bg-blue-50/40 px-2 py-1 text-sm focus:border-blue-500 focus:bg-white focus:outline-none disabled:opacity-50"
      />
      {pending && <Spinner className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
      {error && (
        <span className="shrink-0 text-xs text-red-600" title={error}>
          ⚠
        </span>
      )}
    </span>
  );
}
