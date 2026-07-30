"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Stepper } from "@/components/ui/stepper";
import { Badge, TONE_HEX } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type {
  CaseTypeStage,
  CaseTypeStageItem,
  CaseStageChecklistEntry,
} from "@/types/database";

export function StageStepperPanel({
  caseId,
  caseNumber,
  stages,
  items,
  checklistEntries,
  currentStage,
  canEdit,
}: {
  caseId: string;
  caseNumber: string;
  stages: CaseTypeStage[];
  items: CaseTypeStageItem[];
  checklistEntries: CaseStageChecklistEntry[];
  currentStage: string | null;
  canEdit: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const stageNames = useMemo(() => stages.map((s) => s.stage_name), [stages]);
  const [current, setCurrent] = useState(currentStage ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const entry of checklistEntries) map[entry.item_id] = entry.done;
    return map;
  });

  const currentIndex = stageNames.indexOf(current);
  const currentStageRow = currentIndex >= 0 ? stages[currentIndex] : null;
  const checklistItems = useMemo(
    () =>
      currentStageRow
        ? items
            .filter((i) => i.stage_id === currentStageRow.id)
            .sort((a, b) => a.display_order - b.display_order)
        : [],
    [items, currentStageRow],
  );

  async function selectStage(index: number) {
    const newValue = stageNames[index];
    if (newValue === current) return;
    setError(null);
    const oldValue = current;
    setCurrent(newValue);
    setPending(true);

    const { error: dbError } = await supabase
      .from("cases")
      .update({ case_stage: newValue })
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
          field_name: "case_stage",
          old_value: oldValue,
          new_value: newValue,
        }),
      });
      const result = await res.json();
      if (result.status === "failure") {
        await supabase.from("cases").update({ case_stage: oldValue }).eq("id", caseId);
        setCurrent(oldValue);
        setError(result.message ?? "כשל בסנכרון");
      }
    } catch {
      setError("לא ניתן להתחבר לשרת הסנכרון");
    }
    setPending(false);
  }

  async function toggleItem(itemId: string) {
    const wasDone = !!doneMap[itemId];
    setDoneMap((prev) => ({ ...prev, [itemId]: !wasDone }));

    const { error: dbError } = await supabase.from("case_stage_checklist").upsert(
      {
        case_id: caseId,
        item_id: itemId,
        done: !wasDone,
        done_at: !wasDone ? new Date().toISOString() : null,
      },
      { onConflict: "case_id,item_id" },
    );

    if (dbError) {
      setDoneMap((prev) => ({ ...prev, [itemId]: wasDone }));
      setError("שגיאה בשמירת תת-שלב");
    }
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
      {checklistItems.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="mb-2 text-xs text-gray-400">
            תתי-שלבים ב&quot;{current}&quot;
          </p>
          <ul className="space-y-1.5">
            {checklistItems.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!doneMap[item.id]}
                  disabled={!canEdit}
                  onChange={() => toggleItem(item.id)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span
                  className={
                    doneMap[item.id] ? "text-gray-400 line-through" : "text-gray-700"
                  }
                >
                  {item.item_text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
