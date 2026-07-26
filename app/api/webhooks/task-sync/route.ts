import { runIncomingWebhook } from "@/lib/webhook-handler";
import type { SupabaseClient } from "@supabase/supabase-js";

// Import of tasks (משימות) from עדכנית, mirroring case-sync. The
// case_sync_allowlist gate has been lifted (see case-sync) - a task still
// requires its case to already exist in our cases table (synced first),
// but any case_number is accepted now.
// UPDATE-then-INSERT keyed on source_task_id, same reasoning as case-sync:
// PostgREST's upsert resets unlisted columns to their default on conflict.

interface TaskSyncPayload {
  source_task_id?: string;
  case_number?: string;
  subject?: string | null;
  text?: string | null;
  status_name?: string | null;
  handler_name?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  priority_code?: number | null;
  priority_name?: string | null;
  category_code?: number | null;
  category_name?: string | null;
  informed_users_names?: string | null;
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
  return runIncomingWebhook(
    "task_sync",
    request,
    process.env.MAKE_TASK_SYNC_WEBHOOK_SECRET,
    async (rawBody, admin) => {
      const body = rawBody as TaskSyncPayload;

      const sourceTaskId = body.source_task_id?.trim();
      const caseNumber = body.case_number?.trim();
      if (!sourceTaskId || !caseNumber) {
        return {
          status: 400,
          json: { error: "source_task_id and case_number are required" },
        };
      }

      const { data: caseRow, error: caseError } = await admin
        .from("cases")
        .select("id")
        .eq("case_number", caseNumber)
        .maybeSingle();
      if (caseError) {
        return { status: 500, json: { error: caseError.message } };
      }
      if (!caseRow) {
        return {
          status: 404,
          json: { error: `no case found for case_number ${caseNumber}` },
        };
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
        return {
          status: 500,
          json: { error: "no manager profile exists to assign this task to" },
        };
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
        subject && text && subject !== text
          ? `${subject}: ${text}`
          : text || subject || sourceTaskId;

      const taskFields = {
        text: combinedText,
        case_id: caseRow.id,
        assigned_to: assignedTo,
        created_by: createdBy,
        status,
        start_date: body.start_date ?? null,
        due_date: body.due_date ?? null,
        priority_code: body.priority_code ?? null,
        priority_name: body.priority_name?.trim() || null,
        category_code: body.category_code ?? null,
        category_name: body.category_name?.trim() || null,
        informed_users_names: body.informed_users_names?.trim() || null,
      };

      const { data: updated, error: updateError } = await admin
        .from("tasks")
        .update(taskFields)
        .eq("source_task_id", sourceTaskId)
        .select("id");
      if (updateError) {
        return { status: 500, json: { error: updateError.message } };
      }

      if (updated && updated.length > 0) {
        return {
          status: 200,
          json: { status: "ok", task_id: updated[0].id, warnings },
        };
      }

      const { data: inserted, error: insertError } = await admin
        .from("tasks")
        .insert({ source_task_id: sourceTaskId, ...taskFields })
        .select("id")
        .single();
      if (insertError) {
        return { status: 500, json: { error: insertError.message } };
      }

      return {
        status: 200,
        json: { status: "ok", task_id: inserted.id, warnings },
      };
    },
  );
}
