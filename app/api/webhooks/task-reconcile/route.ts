import { runIncomingWebhook } from "@/lib/webhook-handler";

// Reconciliation for synced tasks. The Make task-sync scenario only sweeps
// tasks that are currently OPEN in עדכנית (per explicit request - done tasks
// are noise there), which means a task completed in עדכנית simply vanishes
// from the sweep and the CRM copy would stay open forever. The tasks view
// has no modify/complete date to catch the transition, so instead Make
// sends the full list of currently-open source task ids in one call, and
// every synced task that's open here but absent there gets closed.
//
// Only rows with a source_task_id are ever touched - CRM-native tasks
// (created in the app, no source id) are never auto-closed. An empty list
// is rejected rather than treated as "close everything": a broken SQL
// aggregation upstream would otherwise mass-close the board.
//
// Shares the task_sync secret env fallback so no new Make config is needed;
// a dedicated task_reconcile row in webhook_configs can override it.

interface TaskReconcilePayload {
  open_source_task_ids?: (string | number)[];
}

export async function POST(request: Request) {
  return runIncomingWebhook(
    "task_reconcile",
    request,
    process.env.MAKE_TASK_SYNC_WEBHOOK_SECRET,
    async (rawBody, admin) => {
      const body = rawBody as TaskReconcilePayload;

      if (!Array.isArray(body.open_source_task_ids)) {
        return {
          status: 400,
          json: { error: "open_source_task_ids must be an array" },
        };
      }
      const openIds = new Set(
        body.open_source_task_ids
          .map((v) => String(v).trim())
          .filter((v) => v.length > 0),
      );
      if (openIds.size === 0) {
        return {
          status: 400,
          json: {
            error:
              "open_source_task_ids is empty - refusing to close every synced task; if עדכנית really has zero open tasks, close them manually",
          },
        };
      }

      // PostgREST caps a single select at 1000 rows, so page through all
      // open synced tasks the same way the cases screen does
      const staleIds: string[] = [];
      const BATCH = 1000;
      for (let from = 0; ; from += BATCH) {
        const { data, error } = await admin
          .from("tasks")
          .select("id, source_task_id")
          .eq("status", "open")
          .not("source_task_id", "is", null)
          .order("id", { ascending: true })
          .range(from, from + BATCH - 1);
        if (error) {
          return { status: 500, json: { error: error.message } };
        }
        if (!data || data.length === 0) break;
        for (const row of data) {
          if (row.source_task_id && !openIds.has(row.source_task_id.trim())) {
            staleIds.push(row.id);
          }
        }
        if (data.length < BATCH) break;
      }

      const completedAt = new Date().toISOString();
      for (let i = 0; i < staleIds.length; i += 200) {
        const chunk = staleIds.slice(i, i + 200);
        const { error } = await admin
          .from("tasks")
          .update({ status: "done", completed_at: completedAt })
          .in("id", chunk);
        if (error) {
          return { status: 500, json: { error: error.message } };
        }
      }

      return {
        status: 200,
        json: {
          status: "ok",
          open_in_source: openIds.size,
          closed_here: staleIds.length,
        },
      };
    },
  );
}
