"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DonutChart } from "@/components/ui/donut-chart";
import { hashTone } from "@/components/ui/badge";
import { FilterBuilder, matchesConditions } from "@/components/filter-builder";
import { TemplateBar } from "@/components/template-bar";
import type {
  ChartViewConfig,
  DashboardChartConfig,
  DashboardLayoutConfig,
  ViewFilterCondition,
  ViewTemplate,
} from "@/types/database";
import {
  caseFilterFieldOptions,
  caseFilterValue,
  FIXED_KEY_PREFIX,
  type FilterableCase,
} from "@/lib/case-filter-fields";

// The charts group by the same keys they filter by - the shared picker keys
// from case-filter-fields - so a חוצץ field can be grouped on, not only
// filtered by. Before this the panel had its own four-field list and the
// dashboard could not see שלבים or חוצצים at all.
export type ChartCaseRow = FilterableCase;

const NO_VALUE_LABEL = "ללא ערך";

// The slot is controlled by the panel: its group-by and filters live in the
// layout the panel persists, so a change here survives a reload instead of
// resetting to a default the next time the page loads.
function ChartSlot({
  chart,
  onChange,
  onRemove,
  fieldOptions,
  cases,
  templates,
  isManager,
  onSaveTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
}: {
  chart: DashboardChartConfig;
  onChange: (next: DashboardChartConfig) => void;
  onRemove: () => void;
  fieldOptions: { key: string; label: string }[];
  cases: ChartCaseRow[];
  templates: ViewTemplate[];
  isManager: boolean;
  onSaveTemplate: (name: string, config: ChartViewConfig) => Promise<string | null>;
  onUpdateTemplate: (id: string, config: ChartViewConfig) => Promise<string | null>;
  onDeleteTemplate: (id: string) => Promise<string | null>;
}) {
  const field = chart.groupBy;
  const filters = chart.filters;
  const setField = (groupBy: string) => {
    // the title tracks the grouping unless it was renamed by hand, so a chart
    // does not keep saying "לפי סטטוס" after being switched to something else
    const auto = fieldOptions.find((o) => o.key === groupBy);
    const wasAuto = fieldOptions.some((o) => `תיקים לפי ${o.label}` === chart.title);
    onChange({
      ...chart,
      groupBy,
      title: wasAuto && auto ? `תיקים לפי ${auto.label}` : chart.title,
    });
  };
  const setFilters = (next: ViewFilterCondition[]) =>
    onChange({ ...chart, filters: next });
  const [showFilters, setShowFilters] = useState(false);
  // which saved template the chart is currently showing, so its name can sit
  // at the top and so "עדכון" knows what to overwrite
  const [appliedTemplateId, setAppliedTemplateId] = useState<string>("");
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const appliedTemplate = templates.find((t) => t.id === appliedTemplateId) ?? null;
  const filteredCases = useMemo(
    () =>
      filters.length > 0
        ? cases.filter((c) => matchesConditions(c, filters, caseFilterValue))
        : cases,
    [cases, filters],
  );

  const segments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of filteredCases) {
      const value = caseFilterValue(c, field) ?? NO_VALUE_LABEL;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, tone: hashTone(label) }));
  }, [filteredCases, field]);

  // Every segment links through, whatever it is grouped by: the cases screen
  // reads the same condition shape the filter builder produces, so a חוצץ or
  // a שלב segment lands on a filtered list just like a status one. Only "no
  // value" has nothing to point at - there is no condition for "field empty".
  function hrefForSegment(label: string) {
    if (label === NO_VALUE_LABEL) return null;
    const condition = JSON.stringify([{ key: field, values: [label] }]);
    return `/cases?filter=${encodeURIComponent(condition)}`;
  }

  // Applying opens the filter panel, so the conditions the template carries
  // are visible and editable instead of only a count on a button.
  function applyTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    const config = template.config as ChartViewConfig;
    setAppliedTemplateId(id);
    setShowFilters(true);
    onChange({
      ...chart,
      filters: config.filters ?? [],
      groupBy: config.groupBy || chart.groupBy,
      // the chart takes the template's name, which is what makes the heading
      // say what is on screen rather than a title left over from before
      title: template.name,
    });
  }

  async function saveTemplate(name: string) {
    const error = await onSaveTemplate(name, { filters, groupBy: field });
    if (error) return error;
    return null;
  }

  // Overwrites the applied template with what is on screen now. Separate from
  // saving: without it the only way to correct a template was to save a second
  // one under a new name and delete the old, which left the list cluttered
  // with near-duplicates.
  async function updateTemplate() {
    if (!appliedTemplate) return null;
    return onUpdateTemplate(appliedTemplate.id, { filters, groupBy: field });
  }

  async function deleteTemplate(id: string) {
    const error = await onDeleteTemplate(id);
    if (!error && appliedTemplateId === id) setAppliedTemplateId("");
    return error;
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <input
            value={chart.title}
            onChange={(e) => onChange({ ...chart, title: e.target.value })}
            aria-label="שם התרשים"
            className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 font-semibold text-gray-900 hover:border-gray-200 focus:border-blue-400 focus:bg-white focus:outline-none"
          />
          {appliedTemplate && (
            <div className="mt-0.5 flex items-center gap-1 px-1 text-xs text-indigo-600">
              <span>תבנית: {appliedTemplate.name}</span>
              <button
                onClick={() => setAppliedTemplateId("")}
                title="ניתוק מהתבנית"
                className="text-indigo-300 hover:text-indigo-700"
              >
                ✕
              </button>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`rounded-md border px-2 py-1 text-xs font-medium ${
              filters.length > 0
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            סינון{filters.length > 0 ? ` (${filters.length})` : ""}
          </button>
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="max-w-[190px] rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 focus:border-blue-500 focus:outline-none"
          >
            {fieldOptions.map((o) => (
              <option key={o.key} value={o.key}>
                לפי {o.label}
              </option>
            ))}
          </select>
          {confirmingRemove ? (
            // Two-step rather than a browser confirm(): the question appears
            // where the click happened, and a mis-click on ✕ costs nothing.
            <span className="flex items-center gap-1">
              <button
                onClick={onRemove}
                className="rounded-md bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-700"
              >
                למחוק?
              </button>
              <button
                onClick={() => setConfirmingRemove(false)}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
              >
                ביטול
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmingRemove(true)}
              title="הסרת התרשים"
              aria-label="הסרת התרשים"
              className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-400 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
          <FilterBuilder
            items={cases}
            fieldOptions={fieldOptions}
            getValue={caseFilterValue}
            conditions={filters}
            onConditionsChange={setFilters}
          />
          {isManager && (
            <div className="mt-3 border-t border-indigo-100 pt-3">
              <TemplateBar
                templates={templates}
                appliedId={appliedTemplateId}
                onApply={applyTemplate}
                onDetach={() => setAppliedTemplateId("")}
                onSave={saveTemplate}
                onUpdate={updateTemplate}
                onDelete={deleteTemplate}
              />
            </div>
          )}
        </div>
      )}

      {segments.length === 0 ? (
        <p className="text-sm text-gray-400">אין נתונים להצגה</p>
      ) : (
        <DonutChart segments={segments} hrefForSegment={hrefForSegment} />
      )}
    </section>
  );
}

const DEFAULT_CHARTS: DashboardChartConfig[] = [
  { title: "תיקים לפי סטטוס", groupBy: `${FIXED_KEY_PREFIX}status`, filters: [] },
  { title: "תיקים לפי סוג", groupBy: `${FIXED_KEY_PREFIX}case_type`, filters: [] },
  { title: "תיקים לפי מטפל", groupBy: `${FIXED_KEY_PREFIX}handler`, filters: [] },
];

// The layout is one view_templates row, so add/remove/rename is a single
// atomic write. `screen` is free text on that table, so no migration was
// needed to carve out a namespace for it.
export const DASHBOARD_LAYOUT_SCREEN = "dashboard_layout";

export function CaseChartsPanel({
  cases,
  viewTemplates,
  layout,
  isManager,
  currentUserId,
  caseFieldKeys,
}: {
  cases: ChartCaseRow[];
  viewTemplates: ViewTemplate[];
  layout: ViewTemplate | null;
  isManager: boolean;
  currentUserId: string;
  // every חוצץ field that exists, from case_field_catalog() - the cases here
  // carry only the fields holding a value, so deriving the picker from them
  // would drop every field nobody has filled in yet
  caseFieldKeys: string[];
}) {
  const [templates, setTemplates] = useState(viewTemplates);
  const supabase = useMemo(() => createClient(), []);

  const [charts, setCharts] = useState<DashboardChartConfig[]>(() => {
    const saved = (layout?.config as DashboardLayoutConfig | undefined)?.charts;
    return saved && saved.length > 0 ? saved : DEFAULT_CHARTS;
  });
  const [layoutId, setLayoutId] = useState<string | null>(layout?.id ?? null);
  const [layoutError, setLayoutError] = useState<string | null>(null);

  const fieldOptions = useMemo(
    () => caseFilterFieldOptions(caseFieldKeys),
    [caseFieldKeys],
  );

  // Persisting is fire-and-forget on top of local state: the charts are a
  // view preference, so a failed write should not throw away what the manager
  // just arranged on screen - it says so and leaves the layout alone.
  async function persist(next: DashboardChartConfig[]) {
    setCharts(next);
    setLayoutError(null);
    if (!isManager) return;

    const config: DashboardLayoutConfig = { charts: next };
    if (layoutId) {
      const { error } = await supabase
        .from("view_templates")
        .update({ config })
        .eq("id", layoutId);
      if (error) setLayoutError("סידור התרשימים לא נשמר");
      return;
    }
    const { data, error } = await supabase
      .from("view_templates")
      .insert({
        screen: DASHBOARD_LAYOUT_SCREEN,
        name: "סידור תרשימים",
        config,
        display_order: 0,
        created_by: currentUserId,
      })
      .select()
      .single<ViewTemplate>();
    if (error || !data) {
      setLayoutError("סידור התרשימים לא נשמר");
      return;
    }
    setLayoutId(data.id);
  }

  function addChart() {
    const used = new Set(charts.map((c) => c.groupBy));
    const next = fieldOptions.find((o) => !used.has(o.key)) ?? fieldOptions[0];
    if (!next) return;
    persist([
      ...charts,
      { title: `תיקים לפי ${next.label}`, groupBy: next.key, filters: [] },
    ]);
  }

  async function handleSaveTemplate(name: string, config: ChartViewConfig): Promise<string | null> {
    const nextOrder =
      templates.length > 0 ? Math.max(...templates.map((t) => t.display_order)) + 1 : 0;
    const { data, error } = await supabase
      .from("view_templates")
      .insert({
        screen: "dashboard",
        name,
        config,
        display_order: nextOrder,
        created_by: currentUserId,
      })
      .select()
      .single<ViewTemplate>();
    if (error || !data) return "שגיאה בשמירת התבנית";
    setTemplates((prev) => [...prev, data]);
    return null;
  }

  async function handleUpdateTemplate(
    id: string,
    config: ChartViewConfig,
  ): Promise<string | null> {
    const { error } = await supabase
      .from("view_templates")
      .update({ config })
      .eq("id", id);
    if (error) return "שגיאה בעדכון התבנית";
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, config } : t)),
    );
    return null;
  }

  async function handleDeleteTemplate(id: string): Promise<string | null> {
    const { error } = await supabase.from("view_templates").delete().eq("id", id);
    if (error) return "שגיאה במחיקת התבנית";
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-gray-900">תרשימים</h2>
        <div className="flex items-center gap-3">
          {layoutError && (
            <span className="text-xs text-rose-600">{layoutError}</span>
          )}
          {isManager && (
            <button
              onClick={addChart}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              + הוספת תרשים
            </button>
          )}
        </div>
      </div>

      {charts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
          אין תרשימים. לחצו על &quot;הוספת תרשים&quot; כדי להתחיל.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {charts.map((chart, i) => (
            <ChartSlot
              key={i}
              chart={chart}
              onChange={(next) =>
                persist(charts.map((c, j) => (j === i ? next : c)))
              }
              onRemove={() => persist(charts.filter((_, j) => j !== i))}
              fieldOptions={fieldOptions}
              cases={cases}
              templates={templates}
              isManager={isManager}
              onSaveTemplate={handleSaveTemplate}
              onUpdateTemplate={handleUpdateTemplate}
              onDeleteTemplate={handleDeleteTemplate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
