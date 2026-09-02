import type { TaskStatus, TaskWithNames } from "@/types/database";

// The reverse of task-sync's STATUS_MAP. These strings are matched against
// odpl_TableTypes.TypeName by the write-back (see TASK_CODE_COLUMNS in
// lib/udkanit-sql.ts), so they have to be exactly what עדכנית calls each
// status - the same values the incoming sync already reads back.
//
// A name עדכנית does not recognise joins to nothing and updates zero rows
// rather than writing something wrong, which the caller sees as a failure
// instead of a silent bad write.
export const UDKANIT_STATUS_NAME: Record<TaskStatus, string> = {
  open: "בביצוע",
  done: "בוצעה",
  cancelled: "בוטל",
};

export interface StatusPushResult {
  ok: boolean;
  message?: string;
}

// Sends one task's new status to עדכנית through the same /api/case-updates
// path every other task field uses.
//
// Status used to be the one task field that changed only in the CRM, which
// made the change look like it stuck and then quietly vanish: the incoming
// sync includes `status` in the columns it overwrites on every run, so
// עדכנית would set it back on the next sweep.
//
// A task with no source_task_id was created in the CRM and has no record
// there to update; that is not a failure, so it reports ok.
export async function pushTaskStatus(
  task: Pick<TaskWithNames, "id" | "status" | "source_task_id" | "case">,
  status: TaskStatus,
): Promise<StatusPushResult> {
  if (!task.source_task_id || !task.case) return { ok: true };

  try {
    const res = await fetch("/api/case-updates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        case_id: task.case.id,
        case_number: task.case.case_number,
        entity_type: "task",
        entity_id: task.id,
        source_ref: task.source_task_id,
        field_name: "status_name",
        old_value: UDKANIT_STATUS_NAME[task.status],
        new_value: UDKANIT_STATUS_NAME[status],
      }),
    });
    const result = await res.json();
    if (!res.ok || result.status === "failure") {
      return {
        ok: false,
        message: result.message ?? result.error ?? `שגיאה ${res.status}`,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "לא ניתן להתחבר לשרת הסנכרון" };
  }
}
