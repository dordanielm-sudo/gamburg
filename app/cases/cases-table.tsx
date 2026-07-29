"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  formatCaseFieldValue,
  isCaseStuck,
  type CaseTypeColumnPreset,
  type CaseWithRelations,
} from "@/types/database";
import { CalendarPopup, formatCalendarDate } from "@/components/calendar-popup";
import { RANGE_LABELS, rangeBounds, startOfToday, type RangeKey } from "@/lib/date-ranges";
import { Badge, hashTone, TONE_HEX } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { NamedAvatar } from "@/components/ui/avatar";

type SortKey = "case_number" | "case_name" | "opened_date" | "last_touched_at";

type EditableField =
  | "flag_problematic_client"
  | "flag_non_paying"
  | "flag_transferring_documents"
  | "manager_follow_up"
  | "manager_note";

interface SyncStatus {
  phase: "saving" | "success" | "warning" | "failure";
  message?: string;
}

const FLAG_DEFS = [
  { key: "flag_problematic_client", label: "לקוח בעייתי" },
  { key: "flag_non_paying", label: "לא משלם" },
  { key: "flag_transferring_documents", label: "מעביר מסמכים" },
] as const;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("he-IL");
}

function uniqueSorted(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort(
    (a, b) => a.localeCompare(b, "he"),
  );
}

// a deadline/task counts toward the case's date-range match if it's still
// open and due in the window - already-late-but-open items always count,
// same "don't bury it" rule as the deadlines/tasks screens
function itemMatchesRange(
  dueDate: string | null,
  status: string,
  today: Date,
  start: Date | null,
  end: Date | null,
  calendarDate: string | null,
) {
  if (!dueDate || status === "done" || status === "cancelled") return false;
  const due = new Date(dueDate + "T00:00:00");
  if (!calendarDate && due < today) return true;
  if (start && due < start) return false;
  if (end && due > end) return false;
  return true;
}

export function CasesTable({
  cases,
  canEdit,
  columnPresets,
  isManager,
}: {
  cases: CaseWithRelations[];
  canEdit: boolean;
  columnPresets: CaseTypeColumnPreset[];
  isManager: boolean;
}) {
  const [rows, setRows] = useState(cases);
  const [search, setSearch] = useState("");
  const [handlerFilter, setHandlerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [natureFilter, setNatureFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [flagFilter, setFlagFilter] = useState<"" | (typeof FLAG_DEFS)[number]["key"]>("");
  const [range, setRange] = useState<RangeKey>("all");
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [tabFilter, setTabFilter] = useState("");
  const [selectedFieldNames, setSelectedFieldNames] = useState<Set<string>>(
    new Set(),
  );
  const [sortKey, setSortKey] = useState<SortKey>("last_touched_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [syncStatus, setSyncStatus] = useState<Record<string, SyncStatus>>({});

  const supabase = useMemo(() => createClient(), []);

  const handlerOptions = useMemo(
    () => uniqueSorted(rows.map((c) => c.handler?.full_name ?? null)),
    [rows],
  );
  const statusOptions = useMemo(
    () => uniqueSorted(rows.map((c) => c.status)),
    [rows],
  );
  const natureOptions = useMemo(
    () => uniqueSorted(rows.map((c) => c.case_nature)),
    [rows],
  );
  const typeOptions = useMemo(
    () => uniqueSorted(rows.map((c) => c.case_type)),
    [rows],
  );

  // fixed extra columns for the currently-selected סוג תיק (only when the
  // type filter is narrowed to exactly one type - otherwise rows would need
  // different columns, which a flat table can't show)
  const activeColumnPresets = useMemo(
    () =>
      typeFilter
        ? columnPresets
            .filter((p) => p.case_type === typeFilter)
            .sort((a, b) => a.display_order - b.display_order)
        : [],
    [columnPresets, typeFilter],
  );

  // חוצצים available across all cases (page_name) and, once one is picked,
  // the field names within it - drives the "extra row per case" display
  const tabOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of rows) for (const f of c.case_fields) set.add(f.page_name);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "he"));
  }, [rows]);

  const fieldOptionsForTab = useMemo(() => {
    if (!tabFilter) return [];
    const set = new Set<string>();
    for (const c of rows) {
      for (const f of c.case_fields) {
        if (f.page_name === tabFilter) set.add(f.field_name);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "he"));
  }, [rows, tabFilter]);

  function toggleFieldName(name: string) {
    setSelectedFieldNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  // days that have an open deadline/task somewhere, for the calendar's dot
  // markers - across all cases, not just the currently filtered ones
  const markedDates = useMemo(() => {
    const set = new Set<string>();
    for (const c of rows) {
      for (const d of c.case_deadlines) if (d.due_date) set.add(d.due_date);
      for (const t of c.tasks) if (t.due_date) set.add(t.due_date);
    }
    return set;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? rows.filter((c) =>
          [c.case_number, c.case_name, c.client_id_number, c.client_phone]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q)),
        )
      : rows;

    if (handlerFilter) {
      list = list.filter((c) => c.handler?.full_name === handlerFilter);
    }
    if (statusFilter) {
      list = list.filter((c) => c.status === statusFilter);
    }
    if (natureFilter) {
      list = list.filter((c) => c.case_nature === natureFilter);
    }
    if (typeFilter) {
      list = list.filter((c) => c.case_type === typeFilter);
    }
    if (flagFilter) {
      list = list.filter((c) => c[flagFilter]);
    }

    // date range/calendar filter mixes deadlines and tasks: a case matches
    // if it has any open deadline OR task due in the picked window
    if (range !== "all" || calendarDate) {
      const today = startOfToday();
      const { start, end } = calendarDate
        ? {
            start: new Date(calendarDate + "T00:00:00"),
            end: new Date(calendarDate + "T00:00:00"),
          }
        : rangeBounds(range, today);
      list = list.filter((c) =>
        [...c.case_deadlines, ...c.tasks].some((item) =>
          itemMatchesRange(
            item.due_date,
            item.status,
            today,
            start,
            end,
            calendarDate,
          ),
        ),
      );
    }

    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [
    rows,
    search,
    handlerFilter,
    statusFilter,
    natureFilter,
    typeFilter,
    flagFilter,
    range,
    calendarDate,
    sortKey,
    sortDir,
  ]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // section 4.2: (1) save immediately to Supabase (optimistic), (2) tell
  // Make about the change via /api/case-updates, (3) show its
  // success/failure/warning response, (4) on failure, undo the optimistic
  // write both in the UI and in Supabase.
  async function updateCase(
    id: string,
    field: EditableField,
    value: boolean | string,
  ) {
    const current = rows.find((r) => r.id === id);
    if (!current) return;
    const oldValue = current[field];

    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setSyncStatus((s) => ({ ...s, [id]: { phase: "saving" } }));

    const { error } = await supabase
      .from("cases")
      .update({ [field]: value })
      .eq("id", id);

    if (error) {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: oldValue } : r)));
      setSyncStatus((s) => ({ ...s, [id]: { phase: "failure", message: "שגיאה בשמירה" } }));
      return;
    }

    try {
      const res = await fetch("/api/case-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: id,
          case_number: current.case_number,
          field_name: field,
          old_value: oldValue,
          new_value: value,
        }),
      });
      const result = await res.json();

      setSyncStatus((s) => ({
        ...s,
        [id]: { phase: result.status ?? "failure", message: result.message },
      }));

      if (result.status === "failure") {
        await supabase.from("cases").update({ [field]: oldValue }).eq("id", id);
        setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: oldValue } : r)));
      }
    } catch {
      setSyncStatus((s) => ({
        ...s,
        [id]: { phase: "failure", message: "לא ניתן להתחבר לשרת הסנכרון" },
      }));
    }
  }

  const hasActiveFilters =
    !!search ||
    !!handlerFilter ||
    !!statusFilter ||
    !!natureFilter ||
    !!typeFilter ||
    !!flagFilter ||
    range !== "all" ||
    !!calendarDate ||
    !!tabFilter;

  function clearFilters() {
    setSearch("");
    setHandlerFilter("");
    setStatusFilter("");
    setNatureFilter("");
    setTypeFilter("");
    setFlagFilter("");
    setRange("all");
    setCalendarDate(null);
    setTabFilter("");
    setSelectedFieldNames(new Set());
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400">
          תיקים עם מועד/משימה פתוחים ב:
        </span>
        <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1">
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
            <button
              key={key}
              onClick={() => {
                setRange(key);
                setCalendarDate(null);
              }}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                !calendarDate && range === key
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              {RANGE_LABELS[key]}
            </button>
          ))}
        </div>
        <CalendarPopup
          markedDates={markedDates}
          selectedDate={calendarDate}
          onSelect={setCalendarDate}
        />
        {calendarDate && (
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium whitespace-nowrap text-blue-700">
            {formatCalendarDate(calendarDate)}
          </span>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="חיפוש לפי מספר תיק, שם, ת.ז או טלפון..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pr-9 pl-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <FilterSelect
          label="מטפל"
          value={handlerFilter}
          onChange={setHandlerFilter}
          options={handlerOptions}
        />
        <FilterSelect
          label="סטטוס"
          value={statusFilter}
          onChange={setStatusFilter}
          options={statusOptions}
        />
        <FilterSelect
          label="שלב/תהליך"
          value={natureFilter}
          onChange={setNatureFilter}
          options={natureOptions}
        />
        <FilterSelect
          label="סוג תיק"
          value={typeFilter}
          onChange={setTypeFilter}
          options={typeOptions}
        />
        <select
          value={flagFilter}
          onChange={(e) =>
            setFlagFilter(e.target.value as typeof flagFilter)
          }
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">דגל: הכל</option>
          {FLAG_DEFS.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <FilterSelect
          label="חוצץ"
          value={tabFilter}
          onChange={(v) => {
            setTabFilter(v);
            setSelectedFieldNames(new Set());
          }}
          options={tabOptions}
        />
        {tabFilter && (
          <FieldPicker
            fields={fieldOptionsForTab}
            selected={selectedFieldNames}
            onToggle={toggleFieldName}
          />
        )}
        {isManager && (
          <Link
            href="/dashboard/case-columns"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            ניהול עמודות לפי סוג תיק
          </Link>
        )}

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-gray-500 underline hover:text-gray-900"
          >
            נקה סינון
          </button>
        )}

        <span className="mr-auto">
          <Badge tone="indigo">{filtered.length} תיקים</Badge>
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-indigo-100 bg-indigo-50/60 text-right">
            <tr>
              <th className="w-1 p-0" aria-hidden />
              <Th onClick={() => toggleSort("case_number")}>מספר תיק</Th>
              <Th onClick={() => toggleSort("case_name")}>שם תיק</Th>
              <th className="px-4 py-3 font-semibold text-indigo-900">סוג</th>
              <th className="px-4 py-3 font-semibold text-indigo-900">מטפל</th>
              <th className="px-4 py-3 font-semibold text-indigo-900">צוות</th>
              <th className="px-4 py-3 font-semibold text-indigo-900">סטטוס</th>
              <Th onClick={() => toggleSort("opened_date")}>תאריך פתיחה</Th>
              <th className="px-4 py-3 font-semibold text-indigo-900">דגלים</th>
              <th className="px-4 py-3 font-semibold text-indigo-900">מעקב</th>
              <th className="px-4 py-3 font-semibold text-indigo-900">
                הערת מנהל
              </th>
              <Th onClick={() => toggleSort("last_touched_at")}>
                נגיעה אחרונה
              </Th>
              {activeColumnPresets.map((p) => (
                <th
                  key={p.id}
                  className="px-4 py-3 font-semibold text-indigo-900 whitespace-nowrap"
                >
                  {p.field_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const stuck = isCaseStuck(c.last_touched_at);
              const sync = syncStatus[c.id];
              const rowTone = c.status ? hashTone(c.status) : "gray";
              return (
                <Fragment key={c.id}>
                <tr
                  className="border-b border-gray-100 transition-colors hover:bg-gray-50/60"
                  style={{ boxShadow: `inset -3px 0 0 0 ${TONE_HEX[rowTone]}` }}
                >
                  <td className="w-1 p-0" aria-hidden />
                  <td className="px-4 py-3.5 font-medium text-gray-500 whitespace-nowrap">
                    <Link
                      href={`/cases/${c.id}`}
                      className="hover:text-blue-700 hover:underline"
                    >
                      {c.case_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 font-semibold text-gray-900">
                    <Link
                      href={`/cases/${c.id}`}
                      className="hover:text-blue-700 hover:underline"
                    >
                      {c.case_name}
                    </Link>
                    {(c.spouse_details?.name ||
                      c.spouse_details?.id_number ||
                      c.spouse_details?.phone) && (
                      <span
                        title="בן/בת זוג שותף/ה בתיק"
                        className="mr-2 rounded-full bg-purple-50 px-1.5 py-0.5 text-[11px] font-medium text-purple-700"
                      >
                        + בן/בת זוג
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">
                    {c.case_type ?? "—"}
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">
                    {c.handler?.full_name ? (
                      <NamedAvatar name={c.handler.full_name} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-gray-600">
                    {c.team ?? "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    {c.status ? (
                      <Badge tone={rowTone} dot>
                        {c.status}
                      </Badge>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-gray-600">
                    {formatDate(c.opened_date)}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-1.5">
                      {FLAG_DEFS.map((f) => (
                        <label
                          key={f.key}
                          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            c[f.key]
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-gray-200 text-gray-400"
                          } ${canEdit ? "cursor-pointer" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={c[f.key]}
                            disabled={!canEdit}
                            onChange={(e) =>
                              updateCase(c.id, f.key, e.target.checked)
                            }
                          />
                          {f.label}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <input
                      type="checkbox"
                      checked={c.manager_follow_up}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateCase(c.id, "manager_follow_up", e.target.checked)
                      }
                      className="h-4 w-4 accent-blue-600"
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <input
                      type="text"
                      defaultValue={c.manager_note ?? ""}
                      disabled={!canEdit}
                      placeholder={canEdit ? "הערה..." : ""}
                      onBlur={(e) =>
                        e.target.value !== (c.manager_note ?? "") &&
                        updateCase(c.id, "manager_note", e.target.value)
                      }
                      className="w-full rounded-md border border-transparent px-2 py-1 text-sm focus:border-blue-300 focus:ring-1 focus:ring-blue-300 focus:outline-none disabled:bg-transparent"
                    />
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">
                        {formatDate(c.last_touched_at)}
                      </span>
                      {stuck && <Badge tone="amber">תיק תקוע</Badge>}
                      <SyncBadge sync={sync} />
                    </div>
                  </td>
                  {activeColumnPresets.map((p) => {
                    const field = c.case_fields.find(
                      (f) =>
                        f.page_name === p.page_name &&
                        f.field_name === p.field_name,
                    );
                    return (
                      <td
                        key={p.id}
                        className="px-4 py-3.5 whitespace-nowrap text-gray-600"
                      >
                        {field ? formatCaseFieldValue(field) : "—"}
                      </td>
                    );
                  })}
                </tr>
                {tabFilter && selectedFieldNames.size > 0 && (
                  <tr className="border-b border-gray-100 bg-gray-50/40">
                    <td
                      colSpan={12 + activeColumnPresets.length}
                      className="px-4 py-2"
                    >
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
                        {Array.from(selectedFieldNames).map((fieldName) => {
                          const field = c.case_fields.find(
                            (f) =>
                              f.page_name === tabFilter &&
                              f.field_name === fieldName,
                          );
                          return (
                            <span key={fieldName}>
                              <span className="text-gray-400">
                                {fieldName}:{" "}
                              </span>
                              {field ? formatCaseFieldValue(field) : "—"}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={12 + activeColumnPresets.length}
                  className="px-4 py-8 text-center text-gray-400"
                >
                  לא נמצאו תיקים
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SyncBadge({ sync }: { sync?: SyncStatus }) {
  if (!sync) return null;
  if (sync.phase === "saving") {
    return (
      <span className="flex items-center gap-1 text-xs text-gray-400">
        <Spinner className="h-3 w-3" /> שומר…
      </span>
    );
  }
  if (sync.phase === "success") {
    return (
      <span className="text-xs text-green-700" title={sync.message}>
        מסונכרן
      </span>
    );
  }
  if (sync.phase === "warning") {
    return (
      <span
        className="text-xs text-amber-700"
        title={sync.message ?? "אזהרה מהסנכרון"}
      >
        אזהרת סנכרון
      </span>
    );
  }
  return (
    <span className="text-xs text-red-600" title={sync.message}>
      כשל בסנכרון
    </span>
  );
}

function FieldPicker({
  fields,
  selected,
  onToggle,
}: {
  fields: string[];
  selected: Set<string>;
  onToggle: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
      >
        שדות להצגה{selected.size > 0 ? ` (${selected.size})` : ""}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-md border border-gray-200 bg-white p-2 shadow-lg">
          {fields.length === 0 ? (
            <p className="p-2 text-xs text-gray-400">אין שדות זמינים</p>
          ) : (
            fields.map((name) => (
              <label
                key={name}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(name)}
                  onChange={() => onToggle(name)}
                  className="h-4 w-4 accent-blue-600"
                />
                {name}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
    >
      <option value="">{label}: הכל</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function Th({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className="cursor-pointer px-4 py-3 font-medium text-gray-600 hover:text-gray-900"
    >
      {children}
    </th>
  );
}
