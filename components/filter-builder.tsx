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

// A checkbox list of every value the field actually takes across the items.
// Shared by the "add a condition" picker and by editing one already in the
// list, so both offer the same choices in the same order.
function ValueChecklist({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex max-h-32 flex-wrap gap-x-3 gap-y-1 overflow-y-auto rounded-md border border-gray-300 bg-white p-2">
      {options.length === 0 ? (
        <span className="text-xs text-gray-400">אין ערכים</span>
      ) : (
        options.map((v) => (
          <label key={v} className="flex items-center gap-1.5 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={selected.has(v)}
              onChange={() => onToggle(v)}
              className="h-3.5 w-3.5"
            />
            {v}
          </label>
        ))
      )}
    </div>
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
  // index of the condition whose values are open for editing, or null. Kept
  // as an index rather than a copy so the chip always edits what is on
  // screen - a template applied while one is open swaps the list underneath.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const valueOptions = useMemo(
    () =>
      pickerKey
        ? uniqueSortedValues(items.map((item) => getValue(item, pickerKey)))
        : [],
    [items, pickerKey, getValue],
  );

  // A stale index (the list was replaced by a template while a chip was open)
  // resolves to null, which closes the editor instead of throwing. A
  // "not_empty" condition has no values to edit, so it never opens either -
  // it arrives from a per-field chart's click-through, and all you can do
  // with it is keep it or drop it.
  const openCondition =
    editingIndex === null ? null : (conditions[editingIndex] ?? null);
  const editing = openCondition?.op === "not_empty" ? null : openCondition;
  // Keyed on the field, not on the condition object: toggling a value makes a
  // new object every time, and rescanning every case on each click is work
  // that produces the same list.
  const editingKey = editing?.key ?? "";
  const editingOptions = useMemo(
    () =>
      editingKey
        ? uniqueSortedValues(items.map((item) => getValue(item, editingKey)))
        : [],
    [items, editingKey, getValue],
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

  // Toggling the last remaining value would leave a condition that matches
  // nothing and cannot be recovered from the chip (it would render with no
  // values), so removing it is treated as deleting the condition.
  function toggleEditingValue(v: string) {
    if (editingIndex === null || !editing) return;
    const values = editing.values.includes(v)
      ? editing.values.filter((x) => x !== v)
      : [...editing.values, v];
    if (values.length === 0) {
      removeCondition(editingIndex);
      return;
    }
    onConditionsChange(
      conditions.map((c, i) => (i === editingIndex ? { ...c, values } : c)),
    );
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
    setEditingIndex(null);
  }

  return (
    <div>
      {conditions.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2">
          {conditions.map((cond, i) => (
            <li
              key={i}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shadow-sm ${
                editingIndex === i
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-700"
              }`}
            >
              {cond.op === "not_empty" ? (
                <span>{fieldLabel(cond.key)}: יש ערך</span>
              ) : (
                <button
                  onClick={() => setEditingIndex(editingIndex === i ? null : i)}
                  title="עריכת הערכים בתנאי"
                  className="hover:underline"
                >
                  {fieldLabel(cond.key)}: {cond.values.join(" / ")}
                </button>
              )}
              <button
                onClick={() => removeCondition(i)}
                title="הסרת התנאי"
                className={
                  editingIndex === i
                    ? "text-indigo-200 hover:text-white"
                    : "text-gray-400 hover:text-rose-600"
                }
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-indigo-800">
              עריכת {fieldLabel(editing.key)}
            </span>
            <button
              onClick={() => setEditingIndex(null)}
              className="text-xs text-indigo-600 hover:underline"
            >
              סיום
            </button>
          </div>
          <ValueChecklist
            options={editingOptions}
            selected={new Set(editing.values)}
            onToggle={toggleEditingValue}
          />
        </div>
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
            <ValueChecklist
              options={valueOptions}
              selected={pickerValues}
              onToggle={toggleValue}
            />
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
    if (cond.op === "not_empty") return value !== null && value !== "";
    return value !== null && cond.values.includes(value);
  });
}
