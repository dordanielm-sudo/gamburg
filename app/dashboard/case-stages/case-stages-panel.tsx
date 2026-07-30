"use client";

import { useMemo, useState, useTransition } from "react";
import {
  addStage,
  deleteStage,
  moveStage,
  addChecklistItem,
  deleteChecklistItem,
} from "./actions";
import { Stepper } from "@/components/ui/stepper";
import type { CaseTypeStage, CaseTypeStageItem } from "@/types/database";

export function CaseStagesPanel({
  stages,
  items,
  caseTypeOptions,
}: {
  stages: CaseTypeStage[];
  items: CaseTypeStageItem[];
  caseTypeOptions: string[];
}) {
  const [caseType, setCaseType] = useState("");
  const [stageName, setStageName] = useState("");
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState("");
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

  const itemsByStage = useMemo(() => {
    const map = new Map<string, CaseTypeStageItem[]>();
    for (const item of items) {
      const group = map.get(item.stage_id) ?? [];
      group.push(item);
      map.set(item.stage_id, group);
    }
    for (const group of map.values()) {
      group.sort((a, b) => a.display_order - b.display_order);
    }
    return map;
  }, [items]);

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

  function handleAddItem(stageId: string) {
    setError(null);
    if (!newItemText.trim()) return;
    const existing = itemsByStage.get(stageId) ?? [];
    const nextOrder =
      existing.length > 0
        ? Math.max(...existing.map((i) => i.display_order)) + 1
        : 0;
    startTransition(async () => {
      try {
        await addChecklistItem(stageId, newItemText, nextOrder);
        setNewItemText("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בהוספת תת-שלב");
      }
    });
  }

  function handleDeleteItem(id: string) {
    startTransition(async () => {
      try {
        await deleteChecklistItem(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה במחיקת תת-שלב");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-semibold text-gray-900">בחירת סוג תיק</h2>
        <p className="mb-3 text-xs text-gray-400">
          רשימת השלבים שתגדיר כאן תוצג כתרשים שלבים (stepper) בכרטיס כל תיק
          מהסוג הזה, וניתן יהיה לעדכן את שלב התיק בלחיצה על שלב ברשימה. לכל
          שלב אפשר להוסיף תתי-שלבים (צ&apos;קליסט) שיוצגו מתחת לשלב הנוכחי.
        </p>
        <input
          list="case-type-options"
          value={caseType}
          onChange={(e) => {
            setCaseType(e.target.value);
            setExpandedStageId(null);
          }}
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
                {stagesForType.map((s, i) => {
                  const stageItems = itemsByStage.get(s.id) ?? [];
                  const isExpanded = expandedStageId === s.id;
                  return (
                    <li
                      key={s.id}
                      className="rounded-lg border border-gray-100 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => setExpandedStageId(isExpanded ? null : s.id)}
                          className="flex-1 text-right font-medium text-gray-900 hover:text-blue-700"
                        >
                          {i + 1}. {s.stage_name}
                          {stageItems.length > 0 && (
                            <span className="mr-2 text-xs font-normal text-gray-400">
                              ({stageItems.length} תתי-שלבים)
                            </span>
                          )}
                        </button>
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
                      </div>

                      {isExpanded && (
                        <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
                          {stageItems.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between text-xs text-gray-700"
                            >
                              <span>{item.item_text}</span>
                              <button
                                onClick={() => handleDeleteItem(item.id)}
                                disabled={pending}
                                className="text-rose-600 hover:text-rose-800 hover:underline"
                              >
                                הסרה
                              </button>
                            </div>
                          ))}
                          <div className="flex gap-2 pt-1">
                            <input
                              value={newItemText}
                              onChange={(e) => setNewItemText(e.target.value)}
                              placeholder="תת-שלב חדש..."
                              className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                            />
                            <button
                              onClick={() => handleAddItem(s.id)}
                              disabled={pending}
                              className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                            >
                              הוספה
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
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
