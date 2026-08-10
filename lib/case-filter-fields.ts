import { formatCaseFieldValue, type CaseField } from "@/types/database";

// The "סינון מתקדם" field list, shared by every screen that filters on cases:
// the cases table, the dashboard charts, and the deadlines board.
//
// It used to live only in the cases table, so the other two screens offered a
// handful of hardcoded fields and could not filter on חוצצים at all. Keeping
// one definition means a screen cannot quietly fall behind the others again.
//
// Two kinds of field:
//   * fixed   - a column on the case, listed here
//   * חוצץ    - discovered from the data at runtime, since PageName/FieldName
//               are whatever עדכנית happens to send; a new tab appears in the
//               filter as soon as the sync produces rows for it
export const FIXED_KEY_PREFIX = "fixed:";
export const CASE_FIELD_KEY_PREFIX = "case_field:";

// the shape every screen's case row must satisfy to be filterable. Each screen
// passes its own richer row type; this is only what the getters touch.
export interface FilterableCase {
  status: string | null;
  case_type: string | null;
  case_nature: string | null;
  case_stage: string | null;
  team: string | null;
  handler: { full_name: string } | null;
  case_fields: Pick<
    CaseField,
    "page_name" | "field_name" | "value_text" | "value_date" | "value_number"
  >[];
}

export const FIXED_CASE_FIELD_DEFS: {
  key: string;
  label: string;
  getValue: (c: FilterableCase) => string | null;
}[] = [
  { key: "status", label: "סטטוס", getValue: (c) => c.status },
  { key: "case_type", label: "סוג תיק", getValue: (c) => c.case_type },
  { key: "case_nature", label: "מהות תיק", getValue: (c) => c.case_nature },
  { key: "case_stage", label: "שלב בתיק", getValue: (c) => c.case_stage },
  { key: "team", label: "צוות", getValue: (c) => c.team },
  {
    key: "handler",
    label: "מטפל",
    getValue: (c) => c.handler?.full_name ?? null,
  },
];

// "PageName::FieldName" for every חוצץ field present in the given cases,
// sorted so the picker order is stable between renders and between screens.
export function collectCaseFieldKeys(cases: FilterableCase[]): string[] {
  const keys = new Set<string>();
  for (const c of cases) {
    for (const f of c.case_fields ?? []) {
      keys.add(`${f.page_name}::${f.field_name}`);
    }
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b, "he"));
}

export function caseFilterFieldOptions(
  caseFieldKeys: string[],
): { key: string; label: string }[] {
  return [
    ...FIXED_CASE_FIELD_DEFS.map((d) => ({
      key: `${FIXED_KEY_PREFIX}${d.key}`,
      label: d.label,
    })),
    ...caseFieldKeys.map((k) => {
      const [pageName, fieldName] = k.split("::");
      return {
        key: `${CASE_FIELD_KEY_PREFIX}${k}`,
        label: `${pageName} / ${fieldName}`,
      };
    }),
  ];
}

// Reads whichever field the picker key names off a case. Returns null for an
// unknown key rather than throwing: saved view templates can outlive the field
// they referenced (a חוצץ that stopped syncing), and a stale template should
// quietly match nothing instead of breaking the screen it loads on.
export function caseFilterValue(
  c: FilterableCase,
  pickerKey: string,
): string | null {
  if (pickerKey.startsWith(FIXED_KEY_PREFIX)) {
    const key = pickerKey.slice(FIXED_KEY_PREFIX.length);
    const def = FIXED_CASE_FIELD_DEFS.find((d) => d.key === key);
    return def ? def.getValue(c) : null;
  }
  if (pickerKey.startsWith(CASE_FIELD_KEY_PREFIX)) {
    const [pageName, fieldName] = pickerKey
      .slice(CASE_FIELD_KEY_PREFIX.length)
      .split("::");
    const match = (c.case_fields ?? []).find(
      (f) => f.page_name === pageName && f.field_name === fieldName,
    );
    return match ? formatCaseFieldValue(match) : null;
  }
  return null;
}
