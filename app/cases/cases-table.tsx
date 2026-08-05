"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  formatCaseFieldValue,
  isCaseStuck,
  type CaseTypeColumnPreset,
  type CaseWithRelations,
  type CasesViewConfig,
  type ViewFilterCondition,
  type ViewTemplate,
} from "@/types/database";
import { CalendarPopup, formatCalendarDate } from "@/components/calendar-popup";
import { RANGE_LABELS, rangeBounds, startOfToday, type RangeKey } from "@/lib/date-ranges";
import { Badge, hashTone, TONE_HEX, type Tone } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { NamedAvatar } from "@/components/ui/avatar";
import { FilterBuilder, matchesConditions } from "@/components/filter-builder";

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

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

// סינון מתקדם: the fixed-column half of the field picker (the other half
// is built dynamically from whatever חוצץ fields exist on the loaded cases)
const FIXED_FIELD_DEFS: {
  key: string;
  label: string;
  getValue: (c: CaseWithRelations) => string | null;
}[] = [
  { key: "status", label: "סטטוס", getValue: (c) => c.status },
  { key: "case_type", label: "סוג תיק", getValue: (c) => c.case_type },
  { key: "case_nature", label: "מהות תיק", getValue: (c) => c.case_nature },
  { key: "team", label: "צוות", getValue: (c) => c.team },
  { key: "handler", label: "מטפל", getValue: (c) => c.handler?.full_name ?? null },
];

// the fixed columns are drag-reorderable (per-user, persisted); the leading
// accent strip and the per-case-type dynamic columns are not part of this -
// they stay pinned at the start/end respectively
type ColumnKey =
  | "case_number"
  | "case_name"
  | "case_type"
  | "handler"
  | "team"
  | "status"
  | "opened_date"
  | "flags"
  | "follow_up"
  | "manager_note"
  | "open_tasks"
  | "last_touched";

const ALL_COLUMNS: ColumnKey[] = [
  "case_number",
  "case_name",
  "case_type",
  "handler",
  "team",
  "status",
  "opened_date",
  "flags",
  "follow_up",
  "manager_note",
  "open_tasks",
  "last_touched",
];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  case_number: "מספר תיק",
  case_name: "שם תיק",
  case_type: "סוג",
  handler: "מטפל",
  team: "צוות",
  status: "סטטוס",
  opened_date: "תאריך פתיחה",
  flags: "דגלים",
  follow_up: "מעקב",
  manager_note: "הערת מנהל",
  open_tasks: "משימות פתוחות",
  last_touched: "נגיעה אחרונה",
};

const COLUMN_SORT_KEY: Partial<Record<ColumnKey, SortKey>> = {
  case_number: "case_number",
  case_name: "case_name",
  opened_date: "opened_date",
  last_touched: "last_touched_at",
};

const CELL_CLASS: Record<ColumnKey, string> = {
  case_number: "px-4 py-3.5 font-medium text-gray-500 whitespace-nowrap",
  case_name: "px-4 py-3.5 font-semibold text-gray-900",
  case_type: "px-4 py-3.5 text-gray-600",
  handler: "px-4 py-3.5 text-gray-600",
  team: "px-4 py-3.5 text-gray-600",
  status: "px-4 py-3.5",
  opened_date: "px-4 py-3.5 whitespace-nowrap text-gray-600",
  flags: "px-4 py-3.5",
  follow_up: "px-4 py-3.5 text-center",
  manager_note: "px-4 py-3.5",
  open_tasks: "px-4 py-3.5 text-center",
  last_touched: "px-4 py-3.5 whitespace-nowrap",
};

// tolerates a stale saved order (unknown keys from an older column set, or
// missing keys from a newly added column) instead of breaking
function sanitizeColumnOrder(order: string[] | null | undefined): ColumnKey[] {
  const known = new Set<string>(ALL_COLUMNS);
  const valid = (order ?? []).filter((k): k is ColumnKey => known.has(k));
  const missing = ALL_COLUMNS.filter((k) => !valid.includes(k));
  return [...valid, ...missing];
}

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
  currentUserId,
  initialColumnOrder,
  viewTemplates,
}: {
  cases: CaseWithRelations[];
  canEdit: boolean;
  columnPresets: CaseTypeColumnPreset[];
  isManager: boolean;
  currentUserId: string;
  initialColumnOrder: string[] | null;
  viewTemplates: ViewTemplate[];
}) {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState(cases);
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(() =>
    sanitizeColumnOrder(initialColumnOrder),
  );
  const dragKeyRef = useRef<ColumnKey | null>(null);
  const [dragOverKey, setDragOverKey] = useState<ColumnKey | null>(null);
  const [search, setSearch] = useState("");
  // initialized from the URL so dashboard donut slices/KPI tiles can link
  // straight into a pre-filtered cases list (e.g. /cases?status=פתוח)
  const [handlerFilter, setHandlerFilter] = useState(
    () => searchParams.get("handler") ?? "",
  );
  const [statusFilter, setStatusFilter] = useState(
    () => searchParams.get("status") ?? "",
  );
  const [natureFilter, setNatureFilter] = useState(
    () => searchParams.get("case_nature") ?? "",
  );
  const [typeFilter, setTypeFilter] = useState(
    () => searchParams.get("case_type") ?? "",
  );
  const [flagFilter, setFlagFilter] = useState<"" | (typeof FLAG_DEFS)[number]["key"]>("");
  const [range, setRange] = useState<RangeKey>("all");
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [tabFilter, setTabFilter] = useState("");
  const [selectedFieldNames, setSelectedFieldNames] = useState<Set<string>>(
    new Set(),
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(100);
  const [pageJumpInput, setPageJumpInput] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("last_touched_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [syncStatus, setSyncStatus] = useState<Record<string, SyncStatus>>({});

  // סינון מתקדם + תבניות שמורות (migration 0031) - conditions on either a
  // fixed column or a specific חוצץ field, each allowing multiple values
  // (OR within a condition, AND across conditions)
  const [templates, setTemplates] = useState(viewTemplates);
  const [advancedFilters, setAdvancedFilters] = useState<ViewFilterCondition[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateError, setTemplateError] = useState<string | null>(null);

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

  const caseFieldKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of rows) {
      for (const f of c.case_fields) set.add(`${f.page_name}::${f.field_name}`);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "he"));
  }, [rows]);

  const advancedFieldOptions = useMemo(
    () => [
      ...FIXED_FIELD_DEFS.map((d) => ({ key: `fixed:${d.key}`, label: d.label })),
      ...caseFieldKeys.map((k) => {
        const [pageName, fieldName] = k.split("::");
        return { key: `case_field:${k}`, label: `${pageName} / ${fieldName}` };
      }),
    ],
    [caseFieldKeys],
  );

  const valueForKey = useCallback((c: CaseWithRelations, pickerKey: string): string | null => {
    if (pickerKey.startsWith("fixed:")) {
      const key = pickerKey.slice("fixed:".length);
      const def = FIXED_FIELD_DEFS.find((d) => d.key === key);
      return def ? def.getValue(c) : null;
    }
    if (pickerKey.startsWith("case_field:")) {
      const [pageName, fieldName] = pickerKey.slice("case_field:".length).split("::");
      const match = c.case_fields.find(
        (f) => f.page_name === pageName && f.field_name === fieldName,
      );
      return match ? formatCaseFieldValue(match) : null;
    }
    return null;
  }, []);

  function applyTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    const config = template.config as CasesViewConfig;
    setAdvancedFilters(config.filters ?? []);
    if (config.columns) setColumnOrder(sanitizeColumnOrder(config.columns));
    if (config.sortKey) setSortKey(config.sortKey as SortKey);
    if (config.sortDir) setSortDir(config.sortDir);
  }

  async function saveTemplate() {
    setTemplateError(null);
    if (!templateName.trim()) {
      setTemplateError("יש לתת שם לתבנית");
      return;
    }
    if (advancedFilters.length === 0) {
      setTemplateError("יש להוסיף לפחות תנאי סינון אחד");
      return;
    }
    const nextOrder =
      templates.length > 0 ? Math.max(...templates.map((t) => t.display_order)) + 1 : 0;
    const config: CasesViewConfig = {
      filters: advancedFilters,
      columns: columnOrder,
      sortKey,
      sortDir,
    };
    const { data, error } = await supabase
      .from("view_templates")
      .insert({
        screen: "cases",
        name: templateName.trim(),
        config,
        display_order: nextOrder,
        created_by: currentUserId,
      })
      .select()
      .single<ViewTemplate>();
    if (error || !data) {
      setTemplateError("שגיאה בשמירת התבנית");
      return;
    }
    setTemplates((prev) => [...prev, data]);
    setTemplateName("");
  }

  async function deleteTemplate(id: string) {
    const { error } = await supabase.from("view_templates").delete().eq("id", id);
    if (!error) setTemplates((prev) => prev.filter((t) => t.id !== id));
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
    if (advancedFilters.length > 0) {
      list = list.filter((c) => matchesConditions(c, advancedFilters, valueForKey));
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

    // clicking a column header groups rows-with-a-value before empty rows
    // (or the opposite, on the next click) rather than letting "" just
    // fall wherever it lands in plain string comparison
    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const aEmpty = av === null || av === undefined || av === "";
      const bEmpty = bv === null || bv === undefined || bv === "";
      if (aEmpty !== bEmpty) {
        const emptyCmp = aEmpty ? 1 : -1;
        return sortDir === "asc" ? emptyCmp : -emptyCmp;
      }
      if (aEmpty && bEmpty) return 0;
      const cmp = av! < bv! ? -1 : av! > bv! ? 1 : 0;
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
    advancedFilters,
    valueForKey,
    range,
    calendarDate,
    sortKey,
    sortDir,
  ]);

  // any change to search/filters reshuffles what "page 1" even means, so
  // jump back there rather than leaving the user stranded on a page that
  // may no longer exist (or shows unrelated rows) once the count changes.
  // Adjusted during render (React's recommended pattern for this) rather
  // than in an effect, to avoid an extra cascading render.
  const filtersSignature = JSON.stringify([
    search,
    handlerFilter,
    statusFilter,
    natureFilter,
    typeFilter,
    flagFilter,
    advancedFilters,
    range,
    calendarDate,
    pageSize,
  ]);
  const [pageResetKey, setPageResetKey] = useState(filtersSignature);
  if (filtersSignature !== pageResetKey) {
    setPageResetKey(filtersSignature);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );

  function jumpToPage() {
    const n = Number(pageJumpInput);
    if (Number.isInteger(n) && n >= 1 && n <= pageCount) {
      setPage(n);
    }
    setPageJumpInput("");
  }

  // windowed page numbers around the current page, plus first/last, so a
  // large case list doesn't render hundreds of page buttons in a row
  const pageWindow = useMemo(() => {
    const span = 2;
    const nums = new Set<number>([
      1,
      pageCount,
      ...Array.from(
        { length: span * 2 + 1 },
        (_, i) => currentPage - span + i,
      ).filter((n) => n >= 1 && n <= pageCount),
    ]);
    return Array.from(nums).sort((a, b) => a - b);
  }, [currentPage, pageCount]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function saveColumnOrder(order: ColumnKey[]) {
    await supabase.from("profile_column_orders").upsert(
      { profile_id: currentUserId, table_key: "cases", column_order: order },
      { onConflict: "profile_id,table_key" },
    );
  }

  function handleColumnDrop(targetKey: ColumnKey) {
    const from = dragKeyRef.current;
    dragKeyRef.current = null;
    setDragOverKey(null);
    if (!from || from === targetKey) return;
    setColumnOrder((prev) => {
      const fromIdx = prev.indexOf(from);
      const toIdx = prev.indexOf(targetKey);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...prev];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      saveColumnOrder(next);
      return next;
    });
  }

  function resetColumnOrder() {
    setColumnOrder(ALL_COLUMNS);
    saveColumnOrder(ALL_COLUMNS);
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
    advancedFilters.length > 0 ||
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
    setAdvancedFilters([]);
    setRange("all");
    setCalendarDate(null);
    setTabFilter("");
    setSelectedFieldNames(new Set());
  }

  function renderCell(key: ColumnKey, c: CaseWithRelations, rowTone: Tone) {
    switch (key) {
      case "case_number":
        return (
          <Link href={`/cases/${c.id}`} className="hover:text-blue-700 hover:underline">
            {c.case_number}
          </Link>
        );
      case "case_name":
        return (
          <>
            <Link href={`/cases/${c.id}`} className="hover:text-blue-700 hover:underline">
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
          </>
        );
      case "case_type":
        return c.case_type ?? "—";
      case "handler":
        return c.handler?.full_name ? <NamedAvatar name={c.handler.full_name} /> : "—";
      case "team":
        return c.team ?? "—";
      case "status":
        return c.status ? (
          <Badge tone={rowTone} dot>
            {c.status}
          </Badge>
        ) : (
          <span className="text-gray-400">—</span>
        );
      case "opened_date":
        return formatDate(c.opened_date);
      case "flags":
        return (
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
                  onChange={(e) => updateCase(c.id, f.key, e.target.checked)}
                />
                {f.label}
              </label>
            ))}
          </div>
        );
      case "follow_up":
        return (
          <input
            type="checkbox"
            checked={c.manager_follow_up}
            disabled={!canEdit}
            onChange={(e) => updateCase(c.id, "manager_follow_up", e.target.checked)}
            className="h-4 w-4 accent-blue-600"
          />
        );
      case "manager_note":
        return (
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
        );
      case "open_tasks": {
        const openCount = c.tasks.filter(
          (t) => t.status !== "done" && t.status !== "cancelled",
        ).length;
        return openCount > 0 ? (
          <Badge tone="blue">{openCount}</Badge>
        ) : (
          <span className="text-gray-400">0</span>
        );
      }
      case "last_touched":
        return (
          <div className="flex items-center gap-2">
            <span className="text-gray-600">{formatDate(c.last_touched_at)}</span>
            {isCaseStuck(c.last_touched_at) && <Badge tone="amber">תיק תקוע</Badge>}
            <SyncBadge sync={syncStatus[c.id]} />
          </div>
        );
    }
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
        {templates.length > 0 && (
          <select
            value=""
            onChange={(e) => e.target.value && applyTemplate(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">תבנית שמורה...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            advancedFilters.length > 0
              ? "border-indigo-300 bg-indigo-50 text-indigo-700"
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          סינון מתקדם{advancedFilters.length > 0 ? ` (${advancedFilters.length})` : ""}
        </button>
        {isManager && (
          <Link
            href="/dashboard/case-columns"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            ניהול עמודות לפי סוג תיק
          </Link>
        )}
        {isManager && (
          <Link
            href="/dashboard/case-stages"
            className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            ניהול שלבים לפי סוג תיק
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
        {JSON.stringify(columnOrder) !== JSON.stringify(ALL_COLUMNS) && (
          <button
            onClick={resetColumnOrder}
            className="text-sm text-gray-500 underline hover:text-gray-900"
          >
            איפוס סדר עמודות
          </button>
        )}

        <span className="mr-auto">
          <Badge tone="indigo">
            {filtered.length} תיקים
            {pageCount > 1 ? ` · עמוד ${currentPage} מתוך ${pageCount}` : ""}
          </Badge>
        </span>
      </div>

      {showAdvanced && (
        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
          <FilterBuilder
            items={rows}
            fieldOptions={advancedFieldOptions}
            getValue={valueForKey}
            conditions={advancedFilters}
            onConditionsChange={setAdvancedFilters}
          />

          {isManager && (
            <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-indigo-100 pt-3">
              <div className="min-w-[200px] flex-1">
                <label className="mb-1 block text-xs text-gray-500">
                  שם תבנית
                </label>
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="למשל: תיקים תקועים בחדל&quot;פ"
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <button
                onClick={saveTemplate}
                className="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-900"
              >
                שמירה כתבנית
              </button>
              {templates.length > 0 && (
                <select
                  value=""
                  onChange={(e) => e.target.value && deleteTemplate(e.target.value)}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-500 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">מחיקת תבנית...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          {templateError && (
            <p className="mt-2 text-xs text-red-700">{templateError}</p>
          )}
        </div>
      )}

      <p className="mb-1.5 text-xs text-gray-400">
        ניתן לגרור את כותרות העמודות כדי לשנות את סדר התצוגה
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-indigo-100 bg-indigo-50/60 text-right">
            <tr>
              <th className="w-1 p-0" aria-hidden />
              {columnOrder.map((key) => {
                const sortKeyForCol = COLUMN_SORT_KEY[key];
                return (
                  <th
                    key={key}
                    draggable
                    onDragStart={() => (dragKeyRef.current = key)}
                    onDragEnter={() => setDragOverKey(key)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleColumnDrop(key)}
                    onClick={sortKeyForCol ? () => toggleSort(sortKeyForCol) : undefined}
                    title="גרור לשינוי סדר העמודות"
                    className={`cursor-grab px-4 py-3 font-semibold whitespace-nowrap text-indigo-900 select-none active:cursor-grabbing ${
                      sortKeyForCol ? "hover:text-indigo-700" : ""
                    } ${dragOverKey === key ? "bg-indigo-100" : ""}`}
                  >
                    {COLUMN_LABELS[key]}
                  </th>
                );
              })}
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
            {paginated.map((c) => {
              const rowTone = c.status ? hashTone(c.status) : "gray";
              return (
                <Fragment key={c.id}>
                <tr
                  className="border-b border-gray-100 transition-colors hover:bg-gray-50/60"
                  style={{ boxShadow: `inset -3px 0 0 0 ${TONE_HEX[rowTone]}` }}
                >
                  <td className="w-1 p-0" aria-hidden />
                  {columnOrder.map((key) => (
                    <td key={key} className={CELL_CLASS[key]}>
                      {renderCell(key, c, rowTone)}
                    </td>
                  ))}
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>תיקים בעמוד:</span>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              onClick={() => setPageSize(size)}
              className={`rounded-md px-2.5 py-1 ${
                size === pageSize
                  ? "bg-indigo-600 text-white"
                  : "border border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {size}
            </button>
          ))}
        </div>

        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              הקודם
            </button>
            {pageWindow.map((p, i) => (
              <Fragment key={p}>
                {i > 0 && pageWindow[i - 1] !== p - 1 && (
                  <span className="px-1 text-gray-400">…</span>
                )}
                <button
                  onClick={() => setPage(p)}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    p === currentPage
                      ? "bg-indigo-600 text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {p}
                </button>
              </Fragment>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage === pageCount}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              הבא
            </button>
            <input
              type="number"
              min={1}
              max={pageCount}
              value={pageJumpInput}
              onChange={(e) => setPageJumpInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && jumpToPage()}
              placeholder="עמוד…"
              className="mr-1 w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <button
              onClick={jumpToPage}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              עבור
            </button>
          </div>
        )}
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

