"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hashTone, TONE_BADGE } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

// inline-editable "status"/"case_nature" - both are source fields synced
// from עדכנית, so a change here also has to go back out through the same
// /api/case-updates write-back webhook used for the CRM-only fields
// (section 4.2), not just saved locally.
export function StatusStageEditor({
  caseId,
  caseNumber,
  fieldName,
  value,
  options,
}: {
  caseId: string;
  caseNumber: string;
  fieldName: "status" | "case_nature";
  value: string | null;
  options: string[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [current, setCurrent] = useState(value ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allOptions =
    current && !options.includes(current) ? [current, ...options] : options;

  async function save(newValue: string) {
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
        setError(result.message ?? "כשל בסנכרון");
      }
    } catch {
      setError("לא ניתן להתחבר לשרת הסנכרון");
    }
    setPending(false);
  }

  const tone = current ? hashTone(current) : "gray";

  return (
    <div className="flex items-center gap-1.5">
      {pending && <Spinner className="h-3.5 w-3.5 text-gray-400" />}
      <select
        value={current}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium ${TONE_BADGE[tone]}`}
      >
        <option value="">—</option>
        {allOptions.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-xs text-red-600" title={error}>
          ⚠
        </span>
      )}
    </div>
  );
}
