"use client";

import { useMemo, useState } from "react";
import type { ViewFilterCondition } from "@/types/database";

export interface FilterFieldOption {
  key: string;
  label: string;
}

function uniqueSortedValues(values: (string | null)[]) {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort(
    (a, b) => a.localeCompare(b, "he"),
  );
}

// shared across every screen that supports "סינון מתקדם" (cases, and the
// dashboard's per-chart pre-filter) - the caller supplies the item list,
// the pickable fields, and how to read a field's value off an item; this
// component only builds/edits the condition list, it doesn't apply it
export function FilterBuilder<T>({
  items,
  fieldOptions,
  getValue,
  conditions,
  onConditionsChange,
}: {
  items: T[];
  fieldOptions: FilterFieldOption[];
  getValue: (item: T, key: string) => string | null;
  conditions: ViewFilterCondition[];
  onConditionsChange: (next: ViewFilterCondition[]) => void;
}) {
  const [pickerKey, setPickerKey] = useState("");
  const [pickerValues, setPickerValues] = useState<Set<string>>(new Set());

  const valueOptions = useMemo(
    () =>
      pickerKey
        ? uniqueSortedValues(items.map((item) => getValue(item, pickerKey)))
        : [],
    [items, pickerKey, getValue],
  );

  function fieldLabel(key: string) {
    return fieldOptions.find((f) => f.key === key)?.label ?? key;
  }

  function toggleValue(v: string) {
    setPickerValues((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  function addCondition() {
    if (!pickerKey || pickerValues.size === 0) return;
    onConditionsChange([
      ...conditions,
      { key: pickerKey, values: Array.from(pickerValues) },
    ]);
    setPickerKey("");
    setPickerValues(new Set());
  }

  function removeCondition(index: number) {
    onConditionsChange(conditions.filter((_, i) => i !== index));
  }

  return (
    <div>
      {conditions.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {conditions.map((cond, i) => (
            <li
              key={i}
              className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm"
            >
              {fieldLabel(cond.key)}: {cond.values.join(" / ")}
              <button
                onClick={() => removeCondition(i)}
                className="text-gray-400 hover:text-rose-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs text-gray-500">שדה</label>
          <select
            value={pickerKey}
            onChange={(e) => {
              setPickerKey(e.target.value);
              setPickerValues(new Set());
            }}
            className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">בחר שדה...</option>
            {fieldOptions.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {pickerKey && (
          <div className="min-w-[200px]">
            <label className="mb-1 block text-xs text-gray-500">
              ערך (אפשר לבחור כמה)
            </label>
            <div className="flex max-h-32 flex-wrap gap-x-3 gap-y-1 overflow-y-auto rounded-md border border-gray-300 bg-white p-2">
              {valueOptions.length === 0 ? (
                <span className="text-xs text-gray-400">אין ערכים</span>
              ) : (
                valueOptions.map((v) => (
                  <label
                    key={v}
                    className="flex items-center gap-1.5 text-xs text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={pickerValues.has(v)}
                      onChange={() => toggleValue(v)}
                      className="h-3.5 w-3.5"
                    />
                    {v}
                  </label>
                ))
              )}
            </div>
          </div>
        )}

        <button
          onClick={addCondition}
          disabled={!pickerKey || pickerValues.size === 0}
          className="mt-5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          הוספת תנאי
        </button>
      </div>
    </div>
  );
}

export function matchesConditions<T>(
  item: T,
  conditions: ViewFilterCondition[],
  getValue: (item: T, key: string) => string | null,
): boolean {
  return conditions.every((cond) => {
    const value = getValue(item, cond.key);
    return value !== null && cond.values.includes(value);
  });
}
