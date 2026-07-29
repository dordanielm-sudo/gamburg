"use client";

import { useMemo, useState, useTransition } from "react";
import { addColumnPreset, deleteColumnPreset } from "./actions";
import type { CaseTypeColumnPreset } from "@/types/database";

export function CaseColumnsPanel({
  presets,
  caseTypeOptions,
  fieldOptions,
}: {
  presets: CaseTypeColumnPreset[];
  caseTypeOptions: string[];
  fieldOptions: { page_name: string; field_name: string }[];
}) {
  const [caseType, setCaseType] = useState("");
  const [pageName, setPageName] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pageOptions = useMemo(
    () =>
      Array.from(new Set(fieldOptions.map((f) => f.page_name))).sort((a, b) =>
        a.localeCompare(b, "he"),
      ),
    [fieldOptions],
  );

  const fieldNameOptions = useMemo(
    () =>
      Array.from(
        new Set(
          fieldOptions
            .filter((f) => f.page_name === pageName)
            .map((f) => f.field_name),
        ),
      ).sort((a, b) => a.localeCompare(b, "he")),
    [fieldOptions, pageName],
  );

  const presetsForType = useMemo(
    () =>
      caseType
        ? presets.filter((p) => p.case_type === caseType)
        : [],
    [presets, caseType],
  );

  function handleAdd() {
    setError(null);
    if (!caseType.trim() || !pageName.trim() || !fieldName.trim()) {
      setError("יש למלא סוג תיק, חוצץ ושדה");
      return;
    }
    const nextOrder =
      presetsForType.length > 0
        ? Math.max(...presetsForType.map((p) => p.display_order)) + 1
        : 0;
    startTransition(async () => {
      try {
        await addColumnPreset(caseType, pageName, fieldName, nextOrder);
        setFieldName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בהוספה");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteColumnPreset(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה במחיקה");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-semibold text-gray-900">בחירת סוג תיק</h2>
        <p className="mb-3 text-xs text-gray-400">
          העמודות שתגדיר כאן יופיעו במסך ניהול תיקים כשמסננים &quot;סוג
          תיק&quot; לערך הזה בדיוק.
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
            עמודות עבור {caseType}
          </h2>

          {presetsForType.length === 0 ? (
            <p className="mb-4 text-sm text-gray-400">אין עמודות מוגדרות עדיין</p>
          ) : (
            <ul className="mb-4 space-y-1.5">
              {presetsForType.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm"
                >
                  <span>
                    <span className="text-gray-400">{p.page_name} / </span>
                    <span className="font-medium text-gray-900">
                      {p.field_name}
                    </span>
                  </span>
                  <button
                    onClick={() => handleDelete(p.id)}
                    disabled={pending}
                    className="text-xs text-rose-600 hover:text-rose-800 hover:underline"
                  >
                    הסרה
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-4">
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-xs text-gray-500">חוצץ</label>
              <input
                list="page-name-options"
                value={pageName}
                onChange={(e) => {
                  setPageName(e.target.value);
                  setFieldName("");
                }}
                placeholder="למשל: חדל&quot;פ"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <datalist id="page-name-options">
                {pageOptions.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs text-gray-500">שדה</label>
              <input
                list="field-name-options"
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
                placeholder="למשל: סכום צו"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <datalist id="field-name-options">
                {fieldNameOptions.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </div>
            <button
              onClick={handleAdd}
              disabled={pending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "מוסיף..." : "הוספת עמודה"}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </section>
      )}
    </div>
  );
}
