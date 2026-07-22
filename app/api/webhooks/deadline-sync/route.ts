import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Import of deadlines (מועדים) from עדכנית's custom fields
// (vwExportToOuterSystems_UserData), mirroring case-sync/task-sync. The
// case_sync_allowlist gate has been lifted (see case-sync) - a deadline
// still requires its case to already exist in our cases table. Keyed on
// (case_id, source_field_name) - each such field holds a single value per
// case, not a list, so a resync updates the same row.
//
// Only ever writes label/due_date - never `status`, so a handler checking
// a deadline off in the CRM survives a resync (same lesson as case-sync's
// upsert bug).

interface DeadlineSyncPayload {
  case_number?: string;
  source_field_name?: string;
  label?: string | null;
  due_date?: string | null;
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");
  const expected = process.env.MAKE_DEADLINE_SYNC_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: DeadlineSyncPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const caseNumber = body.case_number?.trim();
  const sourceFieldName = body.source_field_name?.trim();
  if (!caseNumber || !sourceFieldName) {
    return NextResponse.json(
      { error: "case_number and source_field_name are required" },
      { status: 400 },
    );
  }

  const dueDate = body.due_date?.trim();
  if (!dueDate) {
    // the field is empty in עדכנית for this case - nothing to sync yet,
    // not an error (most cases won't have every deadline field filled in)
    return NextResponse.json({ status: "skipped", reason: "no due_date" });
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

  const label = body.label?.trim() || sourceFieldName;

  const { data: updated, error: updateError } = await admin
    .from("case_deadlines")
    .update({ label, due_date: dueDate })
    .eq("case_id", caseRow.id)
    .eq("source_field_name", sourceFieldName)
    .select("id");
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (updated && updated.length > 0) {
    return NextResponse.json({ status: "ok", deadline_id: updated[0].id });
  }

  const { data: inserted, error: insertError } = await admin
    .from("case_deadlines")
    .insert({
      case_id: caseRow.id,
      source_field_name: sourceFieldName,
      label,
      due_date: dueDate,
    })
    .select("id")
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", deadline_id: inserted.id });
}
