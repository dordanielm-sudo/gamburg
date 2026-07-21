import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

// Pilot import of tasks (משימות) from עדכנית, mirroring case-sync (0009).
// Gated by the same case_sync_allowlist rather than a separate table - a
// task can only be synced for a case already vetted into the case pilot.
// UPDATE-then-INSERT keyed on source_task_id, same reasoning as case-sync:
// PostgREST's upsert resets unlisted columns to their default on conflict.

interface TaskSyncPayload {
  source_task_id?: string;
  case_number?: string;
  subject?: string | null;
  text?: string | null;
  status_name?: string | null;
  handler_name?: string | null;
}

const STATUS_MAP: Record<string, "open" | "done" | "cancelled"> = {
  בוצעה: "done",
  בוטל: "cancelled",
  בביצוע: "open",
};

async function resolveProfileId(
  admin: SupabaseClient,
  name: string,
): Promise<string | null> {
  const query =
    name === "מנהל"
      ? admin.from("profiles").select("id").eq("role", "manager")
      : admin.from("profiles").select("id").eq("full_name", name);
  const { data } = await query.maybeSingle();
  return data?.id ?? null;
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");
  const expected = process.env.MAKE_TASK_SYNC_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: TaskSyncPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const sourceTaskId = body.source_task_id?.trim();
  const caseNumber = body.case_number?.trim();
  if (!sourceTaskId || !caseNumber) {
    return NextResponse.json(
      { error: "source_task_id and case_number are required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: allowed } = await admin
    .from("case_sync_allowlist")
    .select("case_number")
    .eq("case_number", caseNumber)
    .maybeSingle();
  if (!allowed) {
    return NextResponse.json(
      {
        error: `case_number ${caseNumber} is not in case_sync_allowlist - sync the case itself first`,
      },
      { status: 403 },
    );
  }

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

  const warnings: string[] = [];

  const handlerName = body.handler_name?.trim().split(",")[0]?.trim();
  let assignedTo: string | null = handlerName
    ? await resolveProfileId(admin, handlerName)
    : null;
  if (handlerName && !assignedTo) {
    warnings.push(
      `no profile matches handler_name "${handlerName}" - falling back to manager`,
    );
  }
  if (!assignedTo) {
    assignedTo = await resolveProfileId(admin, "מנהל");
  }
  if (!assignedTo) {
    return NextResponse.json(
      { error: "no manager profile exists to assign this task to" },
      { status: 500 },
    );
  }

  const { data: manager } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "manager")
    .maybeSingle();
  const createdBy = manager?.id ?? assignedTo;

  const statusName = body.status_name?.trim();
  const status = (statusName && STATUS_MAP[statusName]) || "open";

  const subject = body.subject?.trim();
  const text = body.text?.trim();
  const combinedText =
    subject && text && subject !== text ? `${subject}: ${text}` : text || subject || sourceTaskId;

  const taskFields = {
    text: combinedText,
    case_id: caseRow.id,
    assigned_to: assignedTo,
    created_by: createdBy,
    status,
  };

  const { data: updated, error: updateError } = await admin
    .from("tasks")
    .update(taskFields)
    .eq("source_task_id", sourceTaskId)
    .select("id");
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (updated && updated.length > 0) {
    return NextResponse.json({
      status: "ok",
      task_id: updated[0].id,
      warnings,
    });
  }

  const { data: inserted, error: insertError } = await admin
    .from("tasks")
    .insert({ source_task_id: sourceTaskId, ...taskFields })
    .select("id")
    .single();
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", task_id: inserted.id, warnings });
}
