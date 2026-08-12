import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callMakeOutgoingWebhook } from "@/lib/make-webhook";
import { buildTaskInsert } from "@/lib/udkanit-sql";
import { getWebhookValue, logWebhookCall } from "@/lib/webhook-config";

// Creating a task in עדכנית, as opposed to updating one. Separate from
// /api/case-updates because that route is built around a single changed field
// on an existing record: it logs one old/new pair to case_sync_log and writes
// an UPDATE. A creation has no changed field and no record to point at yet.
//
// The task already exists in the CRM by the time this runs - the board saves
// it first, same optimistic order as every other write - so a failure here
// leaves a CRM-only task rather than losing what someone typed. That is the
// same state a task created while Make was down would be in, and the reason
// the response carries a readable message instead of just a status.
//
// Make replies with the new dbo.Tasks.Counter as record_id, which is stored as
// source_task_id. Without it the task exists in both systems with nothing
// tying them together, and every later edit would have no record to update.

interface TaskCreatePayload {
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

  let payload: TaskCreatePayload;
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
    .select(
      "id, subject, text, start_date, due_date, source_task_id, case:cases!tasks_case_id_fkey(case_number), assignee:profiles!tasks_assigned_to_fkey(udkanit_user_id)",
    )
    .eq("id", payload.task_id)
    .maybeSingle<{
      id: string;
      subject: string | null;
      text: string | null;
      start_date: string | null;
      due_date: string | null;
      source_task_id: string | null;
      case: { case_number: string } | null;
      assignee: { udkanit_user_id: number | null } | null;
    }>();

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 });
  }
  if (!task) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }
  // Re-running this for a task that already synced would create a second copy
  // in עדכנית, and the CRM would keep pointing at the first.
  if (task.source_task_id) {
    return NextResponse.json({
      status: "warning",
      message: "המשימה כבר קיימת בעדכנית",
    });
  }
  if (!task.case) {
    return NextResponse.json({
      status: "warning",
      message: "משימה ללא תיק נשמרת ב-CRM בלבד - בעדכנית משימה תלויה בתיק",
    });
  }

  // חנה is the account every task the CRM opens is filed under in עדכנית.
  // Read from the manager profile rather than hard-coded so the id lives in
  // data next to every other user's, and a wrong one is fixed on the users
  // screen instead of in a deploy.
  const { data: manager } = await supabase
    .from("profiles")
    .select("udkanit_user_id")
    .eq("role", "manager")
    .maybeSingle<{ udkanit_user_id: number | null }>();

  if (!manager?.udkanit_user_id) {
    return NextResponse.json({
      status: "warning",
      message:
        "למנהל לא הוגדר מזהה בעדכנית - יש להשלים אותו בכרטיס המשתמש כדי ליצור משימות שם",
    });
  }

  const statement = buildTaskInsert({
    caseNumber: task.case.case_number,
    subject: task.subject ?? "",
    text: task.text,
    assigneeUdkanitUserId: task.assignee?.udkanit_user_id ?? null,
    createdByUdkanitUserId: manager.udkanit_user_id,
    startDate: task.start_date,
    dueDate: task.due_date,
  });

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
      status: "warning",
      message: "Make webhook לא מוגדר - המשימה נשמרה רק ב-CRM",
    });
  }

  const result = await callMakeOutgoingWebhook(webhookUrl, {
    case_number: task.case.case_number,
    entity_type: "task",
    entity_id: task.id,
    action: "create",
    changed_by: user.id,
    changed_at: new Date().toISOString(),
    sql: statement.sql,
    params: statement.params,
  });

  // record_id is the Counter the INSERT produced. A success without one means
  // the statement ran but the scenario did not map the result back, so the
  // link is missing - say so rather than reporting a clean success the next
  // edit would contradict.
  if (result.status === "success") {
    if (!result.record_id) {
      await logWebhookCall(admin, "outgoing_case_update", "ok", 200, payload, result);
      return NextResponse.json({
        status: "warning",
        message:
          "המשימה נוצרה בעדכנית אך לא הוחזר מזהה - עדכונים עתידיים לא יסונכרנו",
      });
    }
    const { error: linkError } = await admin
      .from("tasks")
      .update({ source_task_id: result.record_id })
      .eq("id", task.id);
    if (linkError) {
      return NextResponse.json({ status: "warning", message: linkError.message });
    }
  }

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
