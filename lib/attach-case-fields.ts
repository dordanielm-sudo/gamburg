import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaseField } from "@/types/database";

type FieldRow = Pick<
  CaseField,
  "page_name" | "field_name" | "value_text" | "value_date" | "value_number"
>;

interface CaseLike {
  id: string;
  case_fields?: FieldRow[];
}

// Loads every valued חוצץ field once, grouped by case.
//
// The alternative is what the deadlines and approvals screens used to do:
// embed case_fields inside the case, inside each row. A case with eight
// deadlines then carried its whole field set eight times - the deadlines
// screen was measured at 408 kB - and the database re-plans and re-reads the
// embed once per parent row.
//
// It goes through case_fields_grouped() rather than a paged select because
// PostgREST caps a select at 1000 rows, and the 14,583 valued rows then took
// fifteen sequential requests. The volume is small; fifteen round trips to a
// database the app server does not sit next to is not.
export async function fetchCaseFieldsByCase(
  supabase: SupabaseClient,
): Promise<Map<string, FieldRow[]>> {
  const { data, error } = await supabase.rpc("case_fields_grouped");
  const byCase = new Map<string, FieldRow[]>();
  if (error || !data) return byCase;
  for (const [caseId, fields] of Object.entries(
    data as Record<string, FieldRow[]>,
  )) {
    byCase.set(caseId, fields);
  }
  return byCase;
}

// Hangs the fields off each row's case, reusing one array per case rather
// than a copy per row.
//
// Sharing the reference is the point: React's RSC serialization emits a
// repeated object once and points at it afterwards, so a case that appears
// on eight rows costs its fields once in the payload instead of eight times.
// Copying the array here would undo the whole exercise.
export function attachCaseFields<T extends { case: CaseLike | null }>(
  rows: T[],
  byCase: Map<string, FieldRow[]>,
): T[] {
  // Cases arrive as a separate object per row from PostgREST, so they are
  // deduplicated here too - same reasoning, one case object in the payload
  // instead of one per row that mentions it.
  const shared = new Map<string, CaseLike>();
  const empty: FieldRow[] = [];

  for (const row of rows) {
    if (!row.case) continue;
    const seen = shared.get(row.case.id);
    if (seen) {
      row.case = seen;
      continue;
    }
    row.case.case_fields = byCase.get(row.case.id) ?? empty;
    shared.set(row.case.id, row.case);
  }
  return rows;
}
