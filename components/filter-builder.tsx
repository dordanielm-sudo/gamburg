"use client";

import { useMemo, useState } from "react";
import type { ViewFilterCondition } from "@/types/database";

export interface FilterFieldOption {
  key: string;
  label: string;
}

// A value and how many of the items in scope have it. The count is what makes
// the list answerable rather than just a list: "פעיל (312)" says both that the
// value exists and that picking it is worth doing, and a value that would
// empty the screen shows up as (0) instead of only revealing itself after the
// click.
interface ValueCount {
  value: string;
  count: number;
}

function countValues<T>(
  items: T[],
  key: string,
  getValue: (item: T, key: string) => string | null,
): ValueCount[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = getValue(item, key);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value, "he"));
}

// The value picker: a roomy panel rather than the cramped scroll box this
// used to be. A field like מהות תיק has a couple of dozen values, and reading
// them through a 128px window meant scrolling to find out what was even on
// offer.
//
// The search box earns its place on the חוצץ fields, where a value list can
// run long; it is hidden below ten values, where it would only be noise.
function ValuePicker({
  options,
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: {
  options: ValueCount[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onSelectAll?: () => void;
  onClear?: () => void;
}) {
  const [search, setSearch] = useState("");
  const shown = search.trim()
    ? options.filter((o) => o.value.includes(search.trim()))
    : options;

  return (
    <div className="rounded-md border border-gray-300 bg-white">
      {(options.length > 10 || onSelectAll || onClear) && (
        <div className="flex items-center gap-2 border-b border-gray-100 p-2">
          {options.length > 10 && (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש ערך..."
              className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
            />
          )}
          <span className="mr-auto flex shrink-0 gap-2 text-xs">
            {onSelectAll && (
              <button
                onClick={onSelectAll}
                className="text-blue-600 hover:underline"
              >
                בחר הכל
              </button>
            )}
            {onClear && selected.size > 0 && (
              <button onClick={onClear} className="text-gray-500 hover:underline">
                נקה
              </button>
            )}
          </span>
        </div>
      )}
      <div className="max-h-64 overflow-y-auto p-2">
        {shown.length === 0 ? (
          <span className="text-xs text-gray-400">
            {options.length === 0 ? "אין ערכים בשדה הזה" : "אין התאמה לחיפוש"}
          </span>
        ) : (
          <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((o) => (
              <label
                key={o.value}
                className={`flex items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-gray-50 ${
                  o.count === 0 ? "text-gray-400" : "text-gray-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(o.value)}
                  onChange={() => onToggle(o.value)}
                  className="h-3.5 w-3.5 shrink-0"
                />
                <span className="flex-1 truncate" title={o.value}>
                  {o.value}
                </span>
                <span className="shrink-0 tabular-nums text-gray-400">
                  {o.count}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
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

  // The items a new condition would be choosing among: what the conditions
  // already in the list leave behind. Without this the picker offers values
  // that cannot co-occur with what is already selected, and picking one
  // empties the screen with no explanation - filter to סוג תיק = חדל"פ and
  // the שלב list still offered stages only הסדר נושים cases ever reach.
  const itemsForNew = useMemo(
    () =>
      conditions.length > 0
        ? items.filter((item) => matchesConditions(item, conditions, getValue))
        : items,
    [items, conditions, getValue],
  );

  const valueOptions = useMemo(
    () => (pickerKey ? countValues(itemsForNew, pickerKey, getValue) : []),
    [itemsForNew, pickerKey, getValue],
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
  const editingOptions = useMemo(() => {
    if (!editingKey || editingIndex === null) return [];
    // Narrowed by the *other* conditions, never by the one being edited.
    // Including it would mean only its already-chosen values have a nonzero
    // count, so a value could be removed and then never put back.
    const others = conditions.filter((_, i) => i !== editingIndex);
    const scope =
      others.length > 0
        ? items.filter((item) => matchesConditions(item, others, getValue))
        : items;
    const counted = countValues(scope, editingKey, getValue);
    // A value the condition holds but no item currently has - a template
    // written before the data changed, say - would otherwise be missing from
    // the list, leaving it checked in the chip with no checkbox to uncheck.
    // It appears at 0 instead, greyed, and can be removed like any other.
    const present = new Set(counted.map((o) => o.value));
    const orphans = (openCondition?.values ?? [])
      .filter((v) => !present.has(v))
      .map((value) => ({ value, count: 0 }));
    return orphans.length === 0
      ? counted
      : [...counted, ...orphans].sort((a, b) =>
          a.value.localeCompare(b.value, "he"),
        );
  }, [items, conditions, editingIndex, editingKey, openCondition, getValue]);

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

  function setEditingValues(values: string[]) {
    if (editingIndex === null) return;
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
          <div className="mb-1.5 flex items-center justify-between gap-2">
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
          <ValuePicker
            options={editingOptions}
            selected={new Set(editing.values)}
            onToggle={toggleEditingValue}
            onSelectAll={() => setEditingValues(editingOptions.map((o) => o.value))}
          />
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px]">
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
            <button
              onClick={addCondition}
              disabled={pickerValues.size === 0}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              הוספת תנאי
              {pickerValues.size > 0 ? ` (${pickerValues.size})` : ""}
            </button>
          )}
        </div>

        {pickerKey && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">
              ערך - אפשר לסמן כמה, והמספר לצד כל ערך הוא כמה תואמים לו כרגע
            </label>
            <ValuePicker
              options={valueOptions}
              selected={pickerValues}
              onToggle={toggleValue}
              onSelectAll={() =>
                setPickerValues(new Set(valueOptions.map((o) => o.value)))
              }
              onClear={() => setPickerValues(new Set())}
            />
          </div>
        )}
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
