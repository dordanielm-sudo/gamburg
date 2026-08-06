"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCaseFieldValue, type CaseField } from "@/types/database";
import { Spinner } from "@/components/ui/spinner";

// חוצץ (case_fields) equivalent of EditableCaseField. Two differences from
// the plain-column editor:
//
// 1. case_fields splits a value across three typed columns. Which one a given
//    field uses is decided by עדכנית, not by us, so we keep writing to the
//    same column the sync populated - switching columns would change how the
//    value reads back and break the sync's own update.
// 2. The write-back carries page_name as well as field_name: the same field
//    name appears on more than one PageName ("מועד קבלת צו"), so without it
//    Make can't tell which one to write.
type ValueKind = "date" | "number" | "text";

function valueKind(f: CaseField): ValueKind {
  if (f.value_date !== null) return "date";
  if (f.value_number !== null) return "number";
  return "text";
}

function rawValue(f: CaseField, kind: ValueKind): string {
  if (kind === "date") return f.value_date ?? "";
  if (kind === "number") return f.value_number !== null ? String(f.value_number) : "";
  return f.value_text ?? "";
}

export function EditableTabField({
  field,
  caseNumber,
  editing,
}: {
  field: CaseField;
  caseNumber: string;
  editing: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const kind = valueKind(field);
  const [current, setCurrent] = useState(() => rawValue(field, kind));
  const [draft, setDraft] = useState(() => rawValue(field, kind));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function columnPatch(value: string) {
    if (kind === "date") return { value_date: value || null };
    if (kind === "number") {
      const n = value.trim() === "" ? null : Number(value);
      return { value_number: Number.isFinite(n as number) ? n : null };
    }
    return { value_text: value || null };
  }

  async function save() {
    const newValue = draft.trim();
    if (newValue === current) return;
    if (kind === "number" && newValue !== "" && !Number.isFinite(Number(newValue))) {
      setDraft(current);
      setError("ערך חייב להיות מספר");
      return;
    }
    setError(null);
    const oldValue = current;
    setCurrent(newValue);
    setPending(true);

    const { error: dbError } = await supabase
      .from("case_fields")
      .update(columnPatch(newValue))
      .eq("id", field.id);

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
          case_id: field.case_id,
          case_number: caseNumber,
          field_name: field.field_name,
          page_name: field.page_name,
          old_value: oldValue,
          new_value: newValue,
        }),
      });
      const result = await res.json();
      if (result.status === "failure") {
        await supabase
          .from("case_fields")
          .update(columnPatch(oldValue))
          .eq("id", field.id);
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
    // formatted for reading (dates localised, dash when empty), same as before
    return <>{formatCaseFieldValue({ ...field, ...columnPatch(current) })}</>;
  }

  return (
    <span className="flex items-center gap-1.5">
      <input
        type={kind === "date" ? "date" : kind === "number" ? "number" : "text"}
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
