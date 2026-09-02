import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callMakeOutgoingWebhook } from "@/lib/make-webhook";
import { buildTaskDelete } from "@/lib/udkanit-sql";
import { getWebhookValue, logWebhookCall } from "@/lib/webhook-config";

// Deleting a task from עדכנית. Separate from /api/case-updates for the same
// reason creation is: that route is built around one changed field on a
// record that goes on existing.
//
// This route only removes the task THERE. The caller deletes the CRM row
// afterwards, and only if this succeeded - the opposite order would let a
// task disappear here while still sitting in עדכנית, with nothing left to
// point at it and no way to notice.
//
// The open-task rule the board enforces is repeated here rather than trusted:
// the board is where it is convenient, this is where it is binding.

interface TaskDeletePayload {
  task_id?: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: TaskDeletePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!payload.task_id) {
    return NextResponse.json({ error: "task_id is required" }, { status: 400 });
  }

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, status, source_task_id, case:cases!tasks_case_id_fkey(case_number)")
    .eq("id", payload.task_id)
    .maybeSingle<{
      id: string;
      status: string;
      source_task_id: string | null;
      case: { case_number: string } | null;
    }>();

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 });
  }
  if (!task) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }
  if (task.status === "open") {
    return NextResponse.json({
      status: "failure",
      message: "משימה פתוחה אינה ניתנת למחיקה - יש לסמן אותה כבוצעה או בוטלה קודם",
    });
  }
  // Created in the CRM and never sent over, so there is nothing there to
  // remove and the caller is free to delete its own row.
  if (!task.source_task_id) {
    return NextResponse.json({ status: "success", message: "משימה מקומית" });
  }

  const statement = buildTaskDelete(task.source_task_id);
  const admin = createAdminClient();

  if (statement.sql === null) {
    await logWebhookCall(admin, "outgoing_case_update", "skipped", 200, payload, {
      status: "warning",
      message: statement.reason,
    });
    return NextResponse.json({ status: "warning", message: statement.reason });
  }

  const webhookUrl = await getWebhookValue(
    admin,
    "outgoing_case_update",
    process.env.MAKE_OUTGOING_WEBHOOK_URL,
  );
  if (!webhookUrl) {
    return NextResponse.json({
      status: "failure",
      message: "Make webhook לא מוגדר - המשימה לא נמחקה מעדכנית",
    });
  }

  const result = await callMakeOutgoingWebhook(webhookUrl, {
    case_number: task.case?.case_number ?? null,
    entity_type: "task",
    entity_id: task.id,
    action: "delete",
    source_ref: task.source_task_id,
    changed_by: user.id,
    changed_at: new Date().toISOString(),
    sql: statement.sql,
    params: statement.params,
  });

  await logWebhookCall(
    admin,
    "outgoing_case_update",
    result.status === "failure" ? "error" : "ok",
    200,
    payload,
    result,
  );

  return NextResponse.json(result);
}
