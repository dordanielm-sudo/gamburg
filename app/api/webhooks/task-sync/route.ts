import type { SupabaseClient } from "@supabase/supabase-js";
import { runIncomingWebhook } from "@/lib/webhook-handler";
import {
  readBatch,
  summarize,
  mapWithConcurrency,
  type BatchOutcome,
} from "@/lib/webhook-batch";
import { resolveOrCreateHandler } from "@/lib/handler-resolution";

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

// Make's HTTP modules deliver whatever the mapping produces - numeric codes
// arrive as "2" or "" depending on how the body was built, and Postgres
// rejects "" outright for integer/date columns. Coerce instead of failing
// the whole task.
function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

function asNonEmpty(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

interface SyncResult extends BatchOutcome {
  task_id?: string;
  warnings: string[];
  httpStatus: number;
}

// Everything a record needs that is the same for every record in the batch,
// or shared between several of them. Resolved once before the loop rather
// than re-queried per record: at four or five round trips each, a hundred
// records took longer than Make waits.
interface BatchContext {
  caseIds: Map<string, string>;
  handlerIds: Map<string, string | null>;
  handlerWarnings: Map<string, string>;
  managerId: string | null;
}

async function syncOne(
  body: TaskSyncPayload,
  admin: SupabaseClient,
  ctx: BatchContext,
): Promise<SyncResult> {
  const warnings: string[] = [];
  const sourceTaskId = body.source_task_id?.trim();
  const caseNumber = body.case_number?.trim();
  const ref = sourceTaskId ?? "?";

  if (!sourceTaskId || !caseNumber) {
    return {
      ref,
      status: "error",
      httpStatus: 400,
      warnings,
      message: "source_task_id and case_number are required",
    };
  }

  const caseId = ctx.caseIds.get(caseNumber);
  if (!caseId) {
    return {
      ref,
      status: "error",
      httpStatus: 404,
      warnings,
      message: `no case found for case_number ${caseNumber}`,
    };
  }

  const handlerName = body.handler_name?.trim().split(",")[0]?.trim();
  let assignedTo: string | null = null;
  if (handlerName) {
    assignedTo = ctx.handlerIds.get(handlerName) ?? null;
    const warning = ctx.handlerWarnings.get(handlerName);
    if (warning) warnings.push(warning);
  }
  if (!assignedTo) assignedTo = ctx.managerId;
  if (!assignedTo) {
    return {
      ref,
      status: "error",
      httpStatus: 500,
      warnings,
      message: "no manager profile exists to assign this task to",
    };
  }

  const createdBy = ctx.managerId ?? assignedTo;

  const statusName = body.status_name?.trim();
  const status = (statusName && STATUS_MAP[statusName]) || "open";

  // Kept apart rather than merged into one string (0042): TaskSubject is
  // the title and TaskText an optional body, and merging them made the
  // write-back ambiguous - an edit went to TaskText while TaskSubject kept
  // its old value, so the next sync appended one to the other. Every task
  // in עדכנית has a subject; falling back to the id keeps a task with a
  // blank one from rendering as an empty row.
  const subject = asNonEmpty(body.subject);
  const text = asNonEmpty(body.text);

  const taskFields = {
    subject: subject ?? text ?? sourceTaskId,
    text: subject ? text : null,
    case_id: caseId,
    assigned_to: assignedTo,
    created_by: createdBy,
    status,
    start_date: asNonEmpty(body.start_date),
    due_date: asNonEmpty(body.due_date),
    priority_code: asNumber(body.priority_code),
    priority_name: asNonEmpty(body.priority_name),
    category_code: asNumber(body.category_code),
    category_name: asNonEmpty(body.category_name),
    informed_users_names: asNonEmpty(body.informed_users_names),
  };

  const { data: updated, error: updateError } = await admin
    .from("tasks")
    .update(taskFields)
    .eq("source_task_id", sourceTaskId)
    .select("id");
  if (updateError) {
    return { ref, status: "error", httpStatus: 500, warnings, message: updateError.message };
  }

  if (updated && updated.length > 0) {
    return { ref, status: "ok", httpStatus: 200, warnings, task_id: updated[0].id };
  }

  const { data: inserted, error: insertError } = await admin
    .from("tasks")
    .insert({ source_task_id: sourceTaskId, ...taskFields })
    .select("id")
    .single();
  if (insertError) {
    return { ref, status: "error", httpStatus: 500, warnings, message: insertError.message };
  }

  return { ref, status: "ok", httpStatus: 200, warnings, task_id: inserted.id };
}

// One query per kind of lookup instead of one per record. The handler
// resolution stays sequential and deduplicated by name: two records naming
// the same missing person in parallel would each find nobody and each create
// a profile, which is the race the per-record loop was guarding against.
async function buildContext(
  records: TaskSyncPayload[],
  admin: SupabaseClient,
): Promise<BatchContext> {
  const caseNumbers = [
    ...new Set(
      records
        .map((r) => r.case_number?.trim())
        .filter((n): n is string => Boolean(n)),
    ),
  ];

  const caseIds = new Map<string, string>();
  if (caseNumbers.length > 0) {
    const { data } = await admin
      .from("cases")
      .select("id, case_number")
      .in("case_number", caseNumbers)
      .returns<{ id: string; case_number: string }[]>();
    for (const row of data ?? []) caseIds.set(row.case_number, row.id);
  }

  const { data: manager } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "manager")
    .maybeSingle();
  const managerId = (manager?.id as string | undefined) ?? null;

  const handlerNames = [
    ...new Set(
      records
        .map((r) => r.handler_name?.trim().split(",")[0]?.trim())
        .filter((n): n is string => Boolean(n)),
    ),
  ];

  const handlerIds = new Map<string, string | null>();
  const handlerWarnings = new Map<string, string>();
  for (const name of handlerNames) {
    const resolved = await resolveOrCreateHandler(admin, name);
    handlerIds.set(name, resolved.id);
    if (resolved.error) {
      handlerWarnings.set(
        name,
        `handler_name "${name}": ${resolved.error} - falling back to manager`,
      );
    } else if (resolved.created) {
      handlerWarnings.set(
        name,
        `created a new profile for handler_name "${name}" - no login until a manager sets a real email`,
      );
    }
  }

  return { caseIds, handlerIds, handlerWarnings, managerId };
}

export async function POST(request: Request) {
  return runIncomingWebhook(
    "task_sync",
    request,
    process.env.MAKE_TASK_SYNC_WEBHOOK_SECRET,
    async (rawBody, admin) => {
      const { records, batched, warnings, error } =
        readBatch<TaskSyncPayload>(rawBody);
      if (error) return { status: 400, json: { error } };

      const ctx = await buildContext(records, admin);

      // The handler resolution that had to be sequential already happened,
      // once per distinct name, inside buildContext. What is left per record
      // is an update and possibly an insert, which are independent - so they
      // run several at a time rather than one after another. Eight is enough
      // to stay well inside Make's forty-second wait without opening a
      // connection per record against one small Postgres instance.
      const results = await mapWithConcurrency(records, 8, (record) =>
        syncOne(record, admin, ctx),
      );

      if (!batched) {
        const only = results[0];
        if (only.status === "error") {
          return { status: only.httpStatus, json: { error: only.message } };
        }
        return {
          status: 200,
          json: { status: "ok", task_id: only.task_id, warnings: only.warnings },
        };
      }

      const failures = results.filter((r) => r.status === "error");
      return {
        status: 200,
        json: {
          status: "ok",
          ...summarize(results),
          warnings: [...warnings, ...results.flatMap((r) => r.warnings)],
          failures: failures.map((f) => ({ ref: f.ref, message: f.message })),
        },
        logBody: { batch: records.length },
      };
    },
  );
}
