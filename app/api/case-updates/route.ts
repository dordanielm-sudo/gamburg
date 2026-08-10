import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callMakeOutgoingWebhook } from "@/lib/make-webhook";
import { getWebhookValue, logWebhookCall } from "@/lib/webhook-config";

// Section 4.2: generic CRM -> Make write-back. The client has already saved
// the change to Supabase (optimistic); this endpoint logs it and forwards it
// to Make, then relays Make's synchronous success/failure/warning response
// back to the client. On failure, the client undoes its optimistic write.

interface CaseUpdatePayload {
  case_id?: string;
  case_number?: string;
  field_name?: string;
  // set only for חוצץ (case_fields) edits - "מועד קבלת צו" exists on more
  // than one PageName, so Make needs the page to write back to the right one
  page_name?: string;
  // which table the edit landed in, and the row inside it. Defaults to the
  // case itself, which is how every caller behaved before other screens
  // became editable - so existing callers keep working unchanged.
  entity_type?: EntityType;
  entity_id?: string;
  // How עדכנית identifies this record. entity_id is our own uuid, which
  // עדכנית has never seen, so Make needs this to locate what to write:
  // tasks.source_task_id for a task, case_deadlines.source_field_name for a
  // deadline. Null for a case or a חוצץ field, where case_number (plus
  // page_name/field_name) already identifies the record.
  source_ref?: string | null;
  old_value?: unknown;
  new_value?: unknown;
}

const ENTITY_TYPES = [
  "case",
  "case_field",
  "task",
  "deadline",
  "document",
] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

function toLogValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: CaseUpdatePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const {
    case_id,
    case_number,
    field_name,
    page_name,
    entity_id,
    source_ref,
    old_value,
    new_value,
  } = payload;
  if (!case_id || !field_name) {
    return NextResponse.json(
      { error: "case_id and field_name are required" },
      { status: 400 },
    );
  }

  const entity_type: EntityType = payload.entity_type ?? "case";
  if (!ENTITY_TYPES.includes(entity_type)) {
    return NextResponse.json(
      { error: `unknown entity_type: ${entity_type}` },
      { status: 400 },
    );
  }
  // the check constraint on case_sync_log rejects these too, but failing here
  // keeps the error readable instead of surfacing a Postgres violation
  if (entity_type !== "case" && !entity_id) {
    return NextResponse.json(
      { error: `entity_id is required for entity_type=${entity_type}` },
      { status: 400 },
    );
  }

  // insert as the caller's own session - case_sync_log_insert_own (RLS)
  // requires changed_by = auth.uid().
  const { data: logRow, error: logError } = await supabase
    .from("case_sync_log")
    .insert({
      case_id,
      field_name,
      page_name: page_name ?? null,
      entity_type,
      entity_id: entity_id ?? null,
      old_value: toLogValue(old_value),
      new_value: toLogValue(new_value),
      changed_by: user.id,
    })
    .select("id")
    .single();

  if (logError || !logRow) {
    return NextResponse.json(
      { error: logError?.message ?? "failed to log change" },
      { status: 500 },
    );
  }

  // no RLS UPDATE policy grants writing webhook_status/message to
  // 'authenticated' by design - only the server, via service_role, sets them.
  const admin = createAdminClient();
  const webhookUrl = await getWebhookValue(
    admin,
    "outgoing_case_update",
    process.env.MAKE_OUTGOING_WEBHOOK_URL,
  );

  if (!webhookUrl) {
    const message = "Make webhook לא מוגדר - השינוי נשמר רק ב-CRM";
    await admin
      .from("case_sync_log")
      .update({
        webhook_status: "warning",
        webhook_message: message,
        responded_at: new Date().toISOString(),
      })
      .eq("id", logRow.id);
    await logWebhookCall(
      admin,
      "outgoing_case_update",
      "skipped",
      200,
      payload,
      { status: "warning", message },
    );
    return NextResponse.json({ status: "warning", message });
  }

  const result = await callMakeOutgoingWebhook(webhookUrl, {
    case_id,
    case_number,
    field_name,
    page_name: page_name ?? null,
    entity_type,
    entity_id: entity_id ?? null,
    source_ref: source_ref ?? null,
    old_value,
    new_value,
    changed_by: user.id,
    changed_at: new Date().toISOString(),
  });

  await admin
    .from("case_sync_log")
    .update({
      webhook_status: result.status,
      webhook_message: result.message ?? null,
      responded_at: new Date().toISOString(),
    })
    .eq("id", logRow.id);

  const logStatus =
    result.status === "failure"
      ? "error"
      : result.status === "warning"
        ? "skipped"
        : "ok";
  await logWebhookCall(
    admin,
    "outgoing_case_update",
    logStatus,
    200,
    payload,
    result,
  );

  return NextResponse.json(result);
}
