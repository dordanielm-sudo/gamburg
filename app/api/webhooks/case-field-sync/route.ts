import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Generic import of חוצצים (tabs) fields from עדכנית's custom-fields view
// (vwExportToOuterSystems_UserData) - one call per field, same pattern as
// deadline-sync, but writing to the generic case_fields table instead of a
// fixed column, so any PageName/FieldName combination works without a new
// endpoint or migration. Keyed on (case_id, page_name, field_name) - a
// resync updates the same row via UPDATE-then-INSERT (never a plain
// upsert, which resets unlisted columns to their default on conflict).

interface CaseFieldSyncPayload {
  case_number?: string;
  page_name?: string;
  field_name?: string;
  value_text?: string | null;
  value_date?: string | null;
  value_number?: number | null;
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");
  const expected = process.env.MAKE_CASE_FIELD_SYNC_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: CaseFieldSyncPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const caseNumber = body.case_number?.trim();
  const pageName = body.page_name?.trim();
  const fieldName = body.field_name?.trim();
  if (!caseNumber || !pageName || !fieldName) {
    return NextResponse.json(
      { error: "case_number, page_name and field_name are required" },
      { status: 400 },
    );
  }

  const valueText = body.value_text?.trim() || null;
  const valueDate = body.value_date?.trim() || null;
  const valueNumber =
    typeof body.value_number === "number" ? body.value_number : null;
  if (!valueText && !valueDate && valueNumber === null) {
    // the field is empty in עדכנית for this case - nothing to sync yet,
    // not an error (most cases won't have every field filled in)
    return NextResponse.json({ status: "skipped", reason: "no value" });
  }

  const admin = createAdminClient();

  const { data: caseRow, error: caseError } = await admin
    .from("cases")
    .select("id")
    .eq("case_number", caseNumber)
    .maybeSingle();
  if (caseError) {
    return NextResponse.json({ error: caseError.message }, { status: 500 });
  }
  if (!caseRow) {
    return NextResponse.json(
      { error: `no case found for case_number ${caseNumber}` },
      { status: 404 },
    );
  }

  const fieldValues = {
    value_text: valueText,
    value_date: valueDate,
    value_number: valueNumber,
    source_updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateError } = await admin
    .from("case_fields")
    .update(fieldValues)
    .eq("case_id", caseRow.id)
    .eq("page_name", pageName)
    .eq("field_name", fieldName)
    .select("id");
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (updated && updated.length > 0) {
    return NextResponse.json({ status: "ok", field_id: updated[0].id });
  }

  const { data: inserted, error: insertError } = await admin
    .from("case_fields")
    .insert({
      case_id: caseRow.id,
      page_name: pageName,
      field_name: fieldName,
      ...fieldValues,
    })
    .select("id")
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", field_id: inserted.id });
}
