import { runIncomingWebhook } from "@/lib/webhook-handler";

// Tasks deleted in עדכנית, removed here too (client request).
//
// Distinct from task-reconcile, which sweeps only the tasks currently OPEN
// there and closes whatever is missing. That sweep cannot tell a completed
// task from a deleted one - both simply stop appearing - which is why it
// closes rather than deletes. Telling them apart needs the one thing that
// sweep does not carry: whether the row still exists at all.
//
// dbo.Tasks has no Deleted column (unlike UserData_Defs/Pages), so deletion
// there is a real DELETE and absence from the full id list is the only
// evidence of it. Make therefore sends every Counter in dbo.Tasks, and any
// synced task here whose source id is not among them is gone at the source.
//
// Never touches a task without a source_task_id: that one was created in the
// CRM and עדכנית has never heard of it, so its absence proves nothing.

interface TaskDeletionsPayload {
  // every Counter in dbo.Tasks - as an array, or as the comma-separated
  // string a single STRING_AGG row produces (which is one Make operation
  // instead of one per task)
  source_task_ids?: (string | number)[] | string;
  // report what would go without touching anything. The first real run is
  // the dangerous one - it clears out everything deleted in עדכנית since
  // before this endpoint existed, which is correct but is also exactly what
  // a broken query looks like, and there is no undo. Worth being able to
  // read the number first.
  dry_run?: boolean;
}

export async function POST(request: Request) {
  return runIncomingWebhook(
    "task_deletions",
    request,
    process.env.MAKE_TASK_SYNC_WEBHOOK_SECRET,
    async (rawBody, admin) => {
      const body = rawBody as TaskDeletionsPayload;

      const raw = body.source_task_ids;
      const list = typeof raw === "string" ? raw.split(",") : raw;
      if (!Array.isArray(list)) {
        return {
          status: 400,
          json: {
            error:
              "source_task_ids must be an array, or a comma-separated string",
          },
        };
      }

      const liveIds = new Set(
        list.map((v) => String(v).trim()).filter((v) => v.length > 0),
      );
      // Same guard as task-reconcile, and it matters more here: a broken
      // aggregation upstream would otherwise delete every synced task rather
      // than merely closing them.
      if (liveIds.size === 0) {
        return {
          status: 400,
          json: {
            error:
              "source_task_ids is empty - refusing to delete every synced task",
          },
        };
      }

      // Counter is an IDENTITY column, so it only ever grows. A task created
      // in the CRM after this snapshot was taken carries an id above every id
      // in it, and its absence says nothing about whether it was deleted -
      // without this it would be deleted moments after being created.
      let highestSeen = 0;
      for (const id of liveIds) {
        const n = Number(id);
        if (Number.isFinite(n) && n > highestSeen) highestSeen = n;
      }

      // PostgREST caps a single select at 1000 rows - page through, same as
      // task-reconcile
      const goneIds: string[] = [];
      const BATCH = 1000;
      for (let from = 0; ; from += BATCH) {
        const { data, error } = await admin
          .from("tasks")
          .select("id, source_task_id")
          .not("source_task_id", "is", null)
          .order("id", { ascending: true })
          .range(from, from + BATCH - 1);
        if (error) {
          return { status: 500, json: { error: error.message } };
        }
        if (!data || data.length === 0) break;
        for (const row of data) {
          const sourceId = row.source_task_id?.trim();
          if (!sourceId || liveIds.has(sourceId)) continue;
          const n = Number(sourceId);
          if (Number.isFinite(n) && n > highestSeen) continue;
          goneIds.push(row.id);
        }
        if (data.length < BATCH) break;
      }

      if (body.dry_run) {
        return {
          status: 200,
          json: {
            status: "ok",
            dry_run: true,
            live_in_source: liveIds.size,
            would_delete_here: goneIds.length,
          },
        };
      }

      for (let i = 0; i < goneIds.length; i += 200) {
        const chunk = goneIds.slice(i, i + 200);
        const { error } = await admin.from("tasks").delete().in("id", chunk);
        if (error) {
          return { status: 500, json: { error: error.message } };
        }
      }

      return {
        status: 200,
        json: {
          status: "ok",
          live_in_source: liveIds.size,
          deleted_here: goneIds.length,
        },
      };
    },
  );
}
