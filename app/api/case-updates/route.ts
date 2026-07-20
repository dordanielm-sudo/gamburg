import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callMakeOutgoingWebhook } from "@/lib/make-webhook";

// Section 4.2: generic CRM -> Make write-back. The client has already saved
// the change to Supabase (optimistic); this endpoint logs it and forwards it
// to Make, then relays Make's synchronous success/failure/warning response
// back to the client. On failure, the client undoes its optimistic write.

interface CaseUpdatePayload {
  case_id?: string;
  case_number?: string;
  field_name?: string;
  old_value?: unknown;
  new_value?: unknown;
}

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

  const { case_id, case_number, field_name, old_value, new_value } = payload;
  if (!case_id || !field_name) {
    return NextResponse.json(
      { error: "case_id and field_name are required" },
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
  const webhookUrl = process.env.MAKE_OUTGOING_WEBHOOK_URL;

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
    return NextResponse.json({ status: "warning", message });
  }

  const result = await callMakeOutgoingWebhook(webhookUrl, {
    case_id,
    case_number,
    field_name,
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

  return NextResponse.json(result);
}
