"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  deadlineUrgency,
  type CaseDeadlineWithCase,
  type Case,
  type TaskStatus,
  type ViewFilterCondition,
  type ViewTemplate,
} from "@/types/database";
import { CalendarPopup, formatCalendarDate } from "@/components/calendar-popup";
import { CaseCombobox, type CaseOption } from "@/components/case-combobox";
import { RANGE_LABELS, rangeBounds, startOfToday, type RangeKey } from "@/lib/date-ranges";
import { Badge, TONE_HEX, type Tone } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { NamedAvatar } from "@/components/ui/avatar";
import { FilterBuilder, matchesConditions } from "@/components/filter-builder";

const DEADLINE_FIELD_OPTIONS = [
  { key: "label", label: "נושא" },
  { key: "status", label: "סטטוס" },
  { key: "handler", label: "מטפל" },
  { key: "client_updated", label: "לקוח מעודכן" },
  { key: "preparation_done", label: "הכנה בוצעה" },
];

function getDeadlineValue(d: CaseDeadlineWithCase, key: string): string | null {
  switch (key) {
    case "label":
      return d.label;
    case "status":
      return d.status === "done" ? "בוצע" : "פתוח";
    case "handler":
      return d.case?.handler?.full_name ?? null;
    case "client_updated":
      return d.client_updated ? "כן" : "לא";
    case "preparation_done":
      return d.preparation_done ? "כן" : "לא";
    default:
      return null;
  }
}

const URGENCY_TONE: Record<string, Tone> = {
  overdue: "rose",
  soon: "amber",
};

const URGENCY_LABEL: Record<string, string> = {
  overdue: "באיחור",
  soon: "בקרוב",
};

const STATUS_TONE: Record<string, Tone> = {
  open: "blue",
  done: "green",
};

const STATUS_LABEL: Record<string, string> = {
  open: "פתוח",
  done: "בוצע",
};

function formatDate(value: string) {
  return new Date(value + "T00:00:00").toLocaleDateString("he-IL");
}

export function DeadlinesBoard({
  deadlines,
  canCreate,
  cases,
  viewTemplates,
  isManager,
  currentUserId,
}: {
  deadlines: CaseDeadlineWithCase[];
  canCreate: boolean;
  cases: Pick<Case, "id" | "case_number" | "case_name">[];
  viewTemplates: ViewTemplate[];
  isManager: boolean;
  currentUserId: string;
}) {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(deadlines);
  const [range, setRange] = useState<RangeKey>("week");
  const [calendarDate, setCalendarDate] = useState<string | null>(
    () => searchParams.get("date"),
  );
  const [showDone, setShowDone] = useState(false);
  const [caseFilter, setCaseFilter] = useState("");
  const [handlerFilter, setHandlerFilter] = useState("");
  const [labelFilter, setLabelFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createCaseId, setCreateCaseId] = useState("");
  const [createCaseText, setCreateCaseText] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  // סינון מתקדם + תבניות שמורות (screen="deadlines")
  const [templates, setTemplates] = useState(viewTemplates);
  const [advancedFilters, setAdvancedFilters] = useState<ViewFilterCondition[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateError, setTemplateError] = useState<string | null>(null);

  const labelOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((d) => d.label))).sort((a, b) =>
        a.localeCompare(b, "he"),
      ),
    [rows],
  );

  const caseOptions = useMemo(() => {
    const map = new Map<string, CaseOption>();
    for (const d of rows) {
      if (d.case) map.set(d.case.id, d.case);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.case_number.localeCompare(b.case_number, "he"),
    );
  }, [rows]);

  const handlerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of rows) {
      if (d.case?.handler) map.set(d.case.handler.id, d.case.handler.full_name);
    }
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) =>
      a.label.localeCompare(b.label, "he"),
    );
  }, [rows]);

  const hasActiveFilters =
    !!caseFilter ||
    !!handlerFilter ||
    !!labelFilter ||
    !!calendarDate ||
    advancedFilters.length > 0;

  function applyTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    if (template) setAdvancedFilters(template.config.filters ?? []);
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
    const { data, error } = await supabase
      .from("view_templates")
      .insert({
        screen: "deadlines",
        name: templateName.trim(),
        config: { filters: advancedFilters },
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

  const caseFilterOption = caseOptions.find((c) => c.id === caseFilter);
  const caseFilterText = caseFilterOption
    ? `${caseFilterOption.case_number} - ${caseFilterOption.case_name}`
    : "";

  const markedDates = useMemo(() => new Set(rows.map((d) => d.due_date)), [rows]);

  const filtered = useMemo(() => {
    const today = startOfToday();
    // a specific day picked on the calendar takes over from the range
    // buttons entirely - show exactly that day, no overdue carryover
    const { start, end } = calendarDate
      ? {
          start: new Date(calendarDate + "T00:00:00"),
          end: new Date(calendarDate + "T00:00:00"),
        }
      : rangeBounds(range, today);

    return rows.filter((d) => {
      if (caseFilter && d.case?.id !== caseFilter) return false;
      if (handlerFilter && d.case?.handler?.id !== handlerFilter) return false;
      if (labelFilter && d.label !== labelFilter) return false;
      if (advancedFilters.length > 0 && !matchesConditions(d, advancedFilters, getDeadlineValue)) {
        return false;
      }
      if (!showDone && d.status === "done") return false;
      if (start === null && end === null) return true;
      const due = new Date(d.due_date + "T00:00:00");
      // always surface overdue/open items regardless of range, so nothing
      // gets buried once it's already late (unless a specific day is picked)
      if (!calendarDate && due < today && d.status !== "done") return true;
      if (start && due < start) return false;
      if (end && due > end) return false;
      return true;
    });
  }, [rows, range, calendarDate, showDone, caseFilter, handlerFilter, labelFilter, advancedFilters]);

  async function handleCreate(formData: FormData) {
    setFormError(null);
    const label = String(formData.get("label") ?? "").trim();
    const dueDate = String(formData.get("due_date") ?? "");
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const externalDate = String(formData.get("external_date") ?? "") || null;
    const zoomLink = String(formData.get("zoom_link") ?? "").trim() || null;
    const address = String(formData.get("address") ?? "").trim() || null;

    let caseId = createCaseId;
    const manualCaseNumber = createCaseText.trim();
    if (!caseId && manualCaseNumber) {
      const { data: foundCase } = await supabase
        .from("cases")
        .select("id")
        .eq("case_number", manualCaseNumber)
        .maybeSingle();
      if (!foundCase) {
        setFormError(`לא נמצא תיק עם מספר "${manualCaseNumber}"`);
        return;
      }
      caseId = foundCase.id;
    }
    if (!label || !dueDate || !caseId) {
      setFormError("יש למלא נושא, תיק ותאריך");
      return;
    }

    setCreating(true);
    const { data, error } = await supabase
      .from("case_deadlines")
      .insert({
        case_id: caseId,
        label,
        due_date: dueDate,
        notes,
        external_date: externalDate,
        zoom_link: zoomLink,
        address,
      })
      .select(
        "*, case:cases!case_deadlines_case_id_fkey(id, case_number, case_name, handler:profiles!cases_handler_id_fkey(id, full_name))",
      )
      .single<CaseDeadlineWithCase>();
    setCreating(false);

    if (error) {
      setFormError(error.message);
      return;
    }
    setRows((prev) =>
      [...prev, data].sort(
        (a, b) => +new Date(a.due_date) - +new Date(b.due_date),
      ),
    );
    setCreateCaseId("");
    setCreateCaseText("");
  }

  async function toggleDone(deadline: CaseDeadlineWithCase) {
    const status: TaskStatus = deadline.status === "open" ? "done" : "open";
    setRows((prev) =>
      prev.map((d) => (d.id === deadline.id ? { ...d, status } : d)),
    );
    setSavingId(deadline.id);
    const { error } = await supabase
      .from("case_deadlines")
      .update({ status })
      .eq("id", deadline.id);
    setSavingId(null);
    if (error) {
      setRows((prev) =>
        prev.map((d) => (d.id === deadline.id ? deadline : d)),
      );
    }
  }

  async function toggleFlag(
    deadline: CaseDeadlineWithCase,
    field: "client_updated" | "preparation_done",
  ) {
    const value = !deadline[field];
    setRows((prev) =>
      prev.map((d) => (d.id === deadline.id ? { ...d, [field]: value } : d)),
    );
    setSavingId(deadline.id);
    const { error } = await supabase
      .from("case_deadlines")
      .update({ [field]: value })
      .eq("id", deadline.id);
    setSavingId(null);
    if (error) {
      setRows((prev) =>
        prev.map((d) => (d.id === deadline.id ? deadline : d)),
      );
    }
  }

  return (
    <div className="space-y-6">
      {canCreate && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">מועד חדש</h2>
          <form
            action={handleCreate}
            key={rows.length}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs text-gray-500">נושא</label>
              <input
                name="label"
                placeholder="למשל: טופס 5"
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="w-56">
              <CaseCombobox
                cases={cases}
                label="תיק"
                onSelect={(c) => {
                  setCreateCaseId(c.id);
                  setCreateCaseText("");
                }}
                onTextChange={(text) => {
                  setCreateCaseId("");
                  setCreateCaseText(text);
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">
                תאריך
              </label>
              <input
                name="due_date"
                type="date"
                required
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">
                תאריך חיצוני (אופציונלי)
              </label>
              <input
                name="external_date"
                type="date"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-xs text-gray-500">
                קישור לזום (אופציונלי)
              </label>
              <input
                name="zoom_link"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-xs text-gray-500">
                כתובת (אופציונלי)
              </label>
              <input
                name="address"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-xs text-gray-500">
                תיאור (אופציונלי)
              </label>
              <input
                name="notes"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating && <Spinner className="h-4 w-4" />}
              {creating ? "מוסיף..." : "הוספה"}
            </button>
          </form>
          {formError && (
            <p className="mt-2 text-sm text-red-700">{formError}</p>
          )}
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
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
          <div className="flex flex-wrap items-center gap-3">
            <CaseCombobox
              key={caseFilter}
              cases={caseOptions}
              placeholder="תיק: הכל"
              initialText={caseFilterText}
              className="w-56"
              onSelect={(c) => setCaseFilter(c.id)}
              onTextChange={(text) => {
                if (!text) setCaseFilter("");
              }}
            />
            <select
              value={handlerFilter}
              onChange={(e) => setHandlerFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">מטפל: הכל</option>
              {handlerOptions.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </select>
            <select
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">סוג: הכל</option>
              {labelOptions.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
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
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setCaseFilter("");
                  setHandlerFilter("");
                  setLabelFilter("");
                  setCalendarDate(null);
                  setAdvancedFilters([]);
                }}
                className="text-sm text-gray-500 underline hover:text-gray-900"
              >
                נקה סינון
              </button>
            )}
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={showDone}
                onChange={(e) => setShowDone(e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
              הצג גם שבוצעו
            </label>
          </div>
        </div>

        {showAdvanced && (
          <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
            <FilterBuilder
              items={rows}
              fieldOptions={DEADLINE_FIELD_OPTIONS}
              getValue={getDeadlineValue}
              conditions={advancedFilters}
              onConditionsChange={setAdvancedFilters}
            />
            {isManager && (
              <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-indigo-100 pt-3">
                <input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="שם תבנית..."
                  className="min-w-[200px] flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
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
            {templateError && <p className="mt-2 text-xs text-red-700">{templateError}</p>}
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            אין מועדים בטווח שנבחר
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-indigo-100 bg-indigo-50/60 text-right">
                <tr>
                  <th className="w-1 p-0" aria-hidden />
                  <th className="px-4 py-3 font-semibold text-indigo-900">בוצע</th>
                  <th className="px-4 py-3 font-semibold text-indigo-900">נושא</th>
                  <th className="px-4 py-3 font-semibold text-indigo-900">תיק</th>
                  <th className="px-4 py-3 text-center font-semibold text-indigo-900">סטטוס</th>
                  <th className="px-4 py-3 font-semibold text-indigo-900">מטפל</th>
                  <th className="px-4 py-3 font-semibold text-indigo-900">תאריך יעד</th>
                  <th className="px-4 py-3 font-semibold text-indigo-900">מעקב</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const urgency = deadlineUrgency(d.due_date, d.status);
                  const showUrgency = urgency === "overdue" || urgency === "soon";
                  const primaryTone: Tone = showUrgency ? URGENCY_TONE[urgency] : STATUS_TONE[d.status];
                  const primaryLabel = showUrgency ? URGENCY_LABEL[urgency] : STATUS_LABEL[d.status];
                  const saving = savingId === d.id;
                  return (
                    <tr
                      key={d.id}
                      className="border-b border-gray-100 transition-colors hover:bg-gray-50/60"
                      style={
                        showUrgency
                          ? { boxShadow: `inset -3px 0 0 0 ${TONE_HEX[primaryTone]}` }
                          : undefined
                      }
                    >
                      <td className="w-1 p-0" aria-hidden />
                      <td className="px-4 py-3.5">
                        <span className="flex h-4 w-4 items-center justify-center">
                          {saving ? (
                            <Spinner className="h-4 w-4 text-gray-400" />
                          ) : (
                            <input
                              type="checkbox"
                              checked={d.status === "done"}
                              onChange={() => toggleDone(d)}
                              className="h-4 w-4 accent-blue-600"
                            />
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <Link
                          href={d.case ? `/cases/${d.case.id}` : "#"}
                          className="font-semibold text-gray-900 hover:text-blue-700 hover:underline"
                        >
                          {d.label}
                        </Link>
                        {(d.notes || d.address || d.external_date) && (
                          <div className="mt-0.5 text-xs text-gray-400">
                            {[
                              d.notes,
                              d.address,
                              d.external_date && `תאריך חיצוני: ${formatDate(d.external_date)}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                        {d.zoom_link && (
                          <button
                            onClick={() =>
                              window.open(d.zoom_link!, "_blank", "noopener,noreferrer")
                            }
                            className="mt-0.5 block text-xs text-blue-600 hover:underline"
                          >
                            פתיחת זום
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-gray-600">
                        {d.case ? (
                          <Link
                            href={`/cases/${d.case.id}`}
                            className="hover:text-blue-700 hover:underline"
                          >
                            {d.case.case_number} - {d.case.case_name}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <Badge tone={primaryTone} size="md">
                          {primaryLabel}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-gray-600">
                        {d.case?.handler?.full_name ? (
                          <NamedAvatar name={d.case.handler.full_name} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-gray-600">
                        {formatDate(d.due_date)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1 text-xs text-gray-500">
                          <label className="flex items-center gap-1.5">
                            {saving ? (
                              <Spinner className="h-3.5 w-3.5 text-gray-400" />
                            ) : (
                              <input
                                type="checkbox"
                                checked={d.client_updated}
                                onChange={() => toggleFlag(d, "client_updated")}
                                className="h-3.5 w-3.5 accent-blue-600"
                              />
                            )}
                            לקוח מעודכן
                          </label>
                          <label className="flex items-center gap-1.5">
                            {saving ? (
                              <Spinner className="h-3.5 w-3.5 text-gray-400" />
                            ) : (
                              <input
                                type="checkbox"
                                checked={d.preparation_done}
                                onChange={() => toggleFlag(d, "preparation_done")}
                                className="h-3.5 w-3.5 accent-blue-600"
                              />
                            )}
                            הכנה בוצעה
                          </label>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
