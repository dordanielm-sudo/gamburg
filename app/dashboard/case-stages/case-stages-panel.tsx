"use client";

import { useMemo, useState, useTransition } from "react";
import { addStage, deleteStage, moveStage } from "./actions";
import { Stepper } from "@/components/ui/stepper";
import type { CaseTypeStage } from "@/types/database";

export function CaseStagesPanel({
  stages,
  caseTypeOptions,
}: {
  stages: CaseTypeStage[];
  caseTypeOptions: string[];
}) {
  const [caseType, setCaseType] = useState("");
  const [stageName, setStageName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const stagesForType = useMemo(
    () =>
      caseType
        ? stages
            .filter((s) => s.case_type === caseType)
            .sort((a, b) => a.display_order - b.display_order)
        : [],
    [stages, caseType],
  );

  function handleAdd() {
    setError(null);
    if (!caseType.trim() || !stageName.trim()) {
      setError("יש למלא סוג תיק ושם שלב");
      return;
    }
    const nextOrder =
      stagesForType.length > 0
        ? Math.max(...stagesForType.map((s) => s.display_order)) + 1
        : 0;
    startTransition(async () => {
      try {
        await addStage(caseType, stageName, nextOrder);
        setStageName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בהוספה");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteStage(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה במחיקה");
      }
    });
  }

  function handleMove(id: string, direction: "up" | "down") {
    startTransition(async () => {
      try {
        await moveStage(stagesForType, id, direction);
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בשינוי סדר");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-semibold text-gray-900">בחירת סוג תיק</h2>
        <p className="mb-3 text-xs text-gray-400">
          רשימת השלבים שתגדיר כאן תוצג כתרשים שלבים (stepper) בכרטיס כל תיק
          מהסוג הזה, וניתן יהיה לעדכן את שלב התיק בלחיצה על שלב ברשימה.
        </p>
        <input
          list="case-type-options"
          value={caseType}
          onChange={(e) => setCaseType(e.target.value)}
          placeholder="הקלד או בחר סוג תיק..."
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <datalist id="case-type-options">
          {caseTypeOptions.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </section>

      {caseType && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold text-gray-900">
            שלבים עבור {caseType}
          </h2>

          {stagesForType.length === 0 ? (
            <p className="mb-4 text-sm text-gray-400">אין שלבים מוגדרים עדיין</p>
          ) : (
            <>
              <div className="mb-4 rounded-lg border border-gray-100 p-4">
                <Stepper steps={stagesForType.map((s) => s.stage_name)} currentIndex={-1} />
              </div>
              <ul className="mb-4 space-y-1.5">
                {stagesForType.map((s, i) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-gray-900">
                      {i + 1}. {s.stage_name}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleMove(s.id, "up")}
                        disabled={pending || i === 0}
                        className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30"
                      >
                        למעלה
                      </button>
                      <button
                        onClick={() => handleMove(s.id, "down")}
                        disabled={pending || i === stagesForType.length - 1}
                        className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30"
                      >
                        למטה
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        disabled={pending}
                        className="text-xs text-rose-600 hover:text-rose-800 hover:underline"
                      >
                        הסרה
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-4">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs text-gray-500">
                שם שלב
              </label>
              <input
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                placeholder="למשל: קליטה"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={pending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "מוסיף..." : "הוספת שלב"}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </section>
      )}
    </div>
  );
}
