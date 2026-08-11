import type { SupabaseClient } from "@supabase/supabase-js";

// The filter that keeps a case_fields embed to rows that actually carry a
// value. Written once here because four screens embed the same thing and a
// screen that forgot it would silently go back to loading 67,000 rows.
//
// Passed to .or(..., { referencedTable }) - PostgREST applies it to the
// embedded resource, not to the parent, so cases with no valued fields at
// all still come back (with an empty array) rather than being dropped.
export const NON_EMPTY_CASE_FIELD =
  "value_text.not.is.null,value_date.not.is.null,value_number.not.is.null";

// "PageName::FieldName" for every חוצץ field that exists, whether or not any
// case has a value in it - the field picker has to offer all of them.
//
// Deliberately separate from the rows: the picker needs the field *names*,
// the table and the filters need the *values*, and only the second set has
// to be per-case. Reading the names from the rows is what made the rows have
// to be complete.
export async function fetchCaseFieldKeys(
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("case_field_catalog");
  if (error || !data) return [];
  return (data as { page_name: string; field_name: string }[]).map(
    (r) => `${r.page_name}::${r.field_name}`,
  );
}
