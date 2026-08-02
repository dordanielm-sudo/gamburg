"use client";

import { useMemo, useState } from "react";
import { DonutChart } from "@/components/ui/donut-chart";
import { hashTone } from "@/components/ui/badge";

export interface ChartCaseRow {
  status: string | null;
  case_type: string | null;
  case_nature: string | null;
  handler_name: string | null;
}

type FieldKey = "status" | "case_type" | "case_nature" | "handler_name";

const FIELD_DEFS: Record<
  FieldKey,
  { label: string; noValueLabel: string; queryParam: string }
> = {
  status: { label: "סטטוס", noValueLabel: "ללא סטטוס", queryParam: "status" },
  case_type: { label: "סוג תיק", noValueLabel: "ללא סוג", queryParam: "case_type" },
  case_nature: { label: "מהות תיק", noValueLabel: "ללא מהות תיק", queryParam: "case_nature" },
  handler_name: { label: "מטפל", noValueLabel: "לא משויך", queryParam: "handler" },
};

const FIELD_ORDER: FieldKey[] = ["status", "case_type", "case_nature", "handler_name"];

function ChartSlot({
  title,
  defaultField,
  cases,
}: {
  title: string;
  defaultField: FieldKey;
  cases: ChartCaseRow[];
}) {
  const [field, setField] = useState<FieldKey>(defaultField);
  const def = FIELD_DEFS[field];

  const segments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cases) {
      const value = c[field] ?? def.noValueLabel;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, tone: hashTone(label) }));
  }, [cases, field, def.noValueLabel]);

  function hrefForSegment(label: string) {
    if (label === def.noValueLabel) return null;
    return `/cases?${def.queryParam}=${encodeURIComponent(label)}`;
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        <select
          value={field}
          onChange={(e) => setField(e.target.value as FieldKey)}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 focus:border-blue-500 focus:outline-none"
        >
          {FIELD_ORDER.map((key) => (
            <option key={key} value={key}>
              לפי {FIELD_DEFS[key].label}
            </option>
          ))}
        </select>
      </div>
      {segments.length === 0 ? (
        <p className="text-sm text-gray-400">אין נתונים להצגה</p>
      ) : (
        <DonutChart segments={segments} hrefForSegment={hrefForSegment} />
      )}
    </section>
  );
}

export function CaseChartsPanel({ cases }: { cases: ChartCaseRow[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <ChartSlot title="תיקים לפי סטטוס" defaultField="status" cases={cases} />
      <ChartSlot title="תיקים לפי סוג" defaultField="case_type" cases={cases} />
      <ChartSlot title="תיקים לפי מטפל" defaultField="handler_name" cases={cases} />
    </div>
  );
}
