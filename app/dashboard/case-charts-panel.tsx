"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DonutChart } from "@/components/ui/donut-chart";
import { hashTone } from "@/components/ui/badge";
import { FilterBuilder, matchesConditions } from "@/components/filter-builder";
import type { ChartViewConfig, ViewFilterCondition, ViewTemplate } from "@/types/database";
import {
  collectCaseFieldKeys,
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

// Only fixed fields have a matching filter on /cases, so only they get a
// clickable segment. A חוצץ segment still renders and counts - it just does
// not link anywhere, rather than linking to a query the cases screen ignores.
const SEGMENT_LINK_PARAM: Record<string, string> = {
  [`${FIXED_KEY_PREFIX}status`]: "status",
  [`${FIXED_KEY_PREFIX}case_type`]: "case_type",
  [`${FIXED_KEY_PREFIX}case_nature`]: "case_nature",
  [`${FIXED_KEY_PREFIX}handler`]: "handler",
};

const NO_VALUE_LABEL = "ללא ערך";

function ChartSlot({
  title,
  defaultField,
  fieldOptions,
  cases,
  templates,
  isManager,
  onSaveTemplate,
  onDeleteTemplate,
}: {
  title: string;
  defaultField: string;
  fieldOptions: { key: string; label: string }[];
  cases: ChartCaseRow[];
  templates: ViewTemplate[];
  isManager: boolean;
  onSaveTemplate: (name: string, config: ChartViewConfig) => Promise<string | null>;
  onDeleteTemplate: (id: string) => void;
}) {
  const [field, setField] = useState<string>(defaultField);
  const [filters, setFilters] = useState<ViewFilterCondition[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateError, setTemplateError] = useState<string | null>(null);
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

  function hrefForSegment(label: string) {
    if (label === NO_VALUE_LABEL) return null;
    const param = SEGMENT_LINK_PARAM[field];
    if (!param) return null;
    return `/cases?${param}=${encodeURIComponent(label)}`;
  }

  function applyTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    const config = template.config as ChartViewConfig;
    setFilters(config.filters ?? []);
    if (config.groupBy) setField(config.groupBy);
  }

  async function saveTemplate() {
    setTemplateError(null);
    if (!templateName.trim()) {
      setTemplateError("יש לתת שם לתבנית");
      return;
    }
    const error = await onSaveTemplate(templateName.trim(), { filters, groupBy: field });
    if (error) {
      setTemplateError(error);
      return;
    }
    setTemplateName("");
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {templates.length > 0 && (
        <select
          value=""
          onChange={(e) => e.target.value && applyTemplate(e.target.value)}
          className="mb-3 w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-600 focus:border-blue-500 focus:outline-none"
        >
          <option value="">תבנית שמורה...</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

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
            <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-indigo-100 pt-3">
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="שם תבנית..."
                className="min-w-[160px] flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
              />
              <button
                onClick={saveTemplate}
                className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900"
              >
                שמירה כתבנית
              </button>
              {templates.length > 0 && (
                <select
                  value=""
                  onChange={(e) => e.target.value && onDeleteTemplate(e.target.value)}
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

      {segments.length === 0 ? (
        <p className="text-sm text-gray-400">אין נתונים להצגה</p>
      ) : (
        <DonutChart segments={segments} hrefForSegment={hrefForSegment} />
      )}
    </section>
  );
}

export function CaseChartsPanel({
  cases,
  viewTemplates,
  isManager,
  currentUserId,
}: {
  cases: ChartCaseRow[];
  viewTemplates: ViewTemplate[];
  isManager: boolean;
  currentUserId: string;
}) {
  const [templates, setTemplates] = useState(viewTemplates);
  const supabase = useMemo(() => createClient(), []);

  // חוצצים are discovered from the cases actually loaded, so the picker only
  // ever offers tabs this dataset has values for
  const fieldOptions = useMemo(
    () => caseFilterFieldOptions(collectCaseFieldKeys(cases)),
    [cases],
  );

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

  async function handleDeleteTemplate(id: string) {
    const { error } = await supabase.from("view_templates").delete().eq("id", id);
    if (!error) setTemplates((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <ChartSlot
        title="תיקים לפי סטטוס"
        defaultField={`${FIXED_KEY_PREFIX}status`}
        fieldOptions={fieldOptions}
        cases={cases}
        templates={templates}
        isManager={isManager}
        onSaveTemplate={handleSaveTemplate}
        onDeleteTemplate={handleDeleteTemplate}
      />
      <ChartSlot
        title="תיקים לפי סוג"
        defaultField={`${FIXED_KEY_PREFIX}case_type`}
        fieldOptions={fieldOptions}
        cases={cases}
        templates={templates}
        isManager={isManager}
        onSaveTemplate={handleSaveTemplate}
        onDeleteTemplate={handleDeleteTemplate}
      />
      <ChartSlot
        title="תיקים לפי מטפל"
        defaultField={`${FIXED_KEY_PREFIX}handler`}
        fieldOptions={fieldOptions}
        cases={cases}
        templates={templates}
        isManager={isManager}
        onSaveTemplate={handleSaveTemplate}
        onDeleteTemplate={handleDeleteTemplate}
      />
    </div>
  );
}
