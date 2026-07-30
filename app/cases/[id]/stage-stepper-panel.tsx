"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Stepper } from "@/components/ui/stepper";
import { Badge, TONE_HEX } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

export function StageStepperPanel({
  caseId,
  caseNumber,
  stageNames,
  currentStage,
  canEdit,
}: {
  caseId: string;
  caseNumber: string;
  stageNames: string[];
  currentStage: string | null;
  canEdit: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [current, setCurrent] = useState(currentStage ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentIndex = stageNames.indexOf(current);

  async function selectStage(index: number) {
    const newValue = stageNames[index];
    if (newValue === current) return;
    setError(null);
    const oldValue = current;
    setCurrent(newValue);
    setPending(true);

    const { error: dbError } = await supabase
      .from("cases")
      .update({ case_nature: newValue })
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
          field_name: "case_nature",
          old_value: oldValue,
          new_value: newValue,
        }),
      });
      const result = await res.json();
      if (result.status === "failure") {
        await supabase.from("cases").update({ case_nature: oldValue }).eq("id", caseId);
        setCurrent(oldValue);
        setError(result.message ?? "כשל בסנכרון");
      }
    } catch {
      setError("לא ניתן להתחבר לשרת הסנכרון");
    }
    setPending(false);
  }

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      style={{ boxShadow: `inset -3px 0 0 0 ${TONE_HEX.indigo}` }}
    >
      <div className="mb-4 flex items-center justify-between">
        <Badge tone="indigo" dot>
          שלבים בתיק
        </Badge>
        {pending && <Spinner className="h-4 w-4 text-gray-400" />}
      </div>
      {currentIndex === -1 && current && (
        <p className="mb-3 text-xs text-amber-600">
          השלב הנוכחי (&quot;{current}&quot;) לא מזוהה ברשימת השלבים המוגדרת
          לסוג התיק
        </p>
      )}
      <Stepper
        steps={stageNames}
        currentIndex={currentIndex}
        onSelect={canEdit ? selectStage : undefined}
      />
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
