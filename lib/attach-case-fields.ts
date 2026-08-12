import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaseField } from "@/types/database";
import { fetchAllRows } from "@/lib/fetch-all-rows";

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
// deadlines then carried its whole field set eight times, and the deadlines
// screen was measured at 408 kB and eleven seconds of server time. The
// duplication is in the database's work too, not only the payload - the
// embed is re-planned and re-read per parent row.
export async function fetchCaseFieldsByCase(
  supabase: SupabaseClient,
): Promise<Map<string, FieldRow[]>> {
  const { data: rows } = await fetchAllRows<FieldRow & { case_id: string }>((from, to) =>
    supabase
      .from("case_fields")
      .select("case_id, page_name, field_name, value_text, value_date, value_number")
      // an empty field shows nothing in a column and offers nothing to filter
      // on, and four fifths of them are empty
      .or("value_text.not.is.null,value_date.not.is.null,value_number.not.is.null")
      .order("case_id", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );

  const byCase = new Map<string, FieldRow[]>();
  for (const row of rows) {
    const list = byCase.get(row.case_id);
    const field: FieldRow = {
      page_name: row.page_name,
      field_name: row.field_name,
      value_text: row.value_text,
      value_date: row.value_date,
      value_number: row.value_number,
    };
    if (list) list.push(field);
    else byCase.set(row.case_id, [field]);
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
