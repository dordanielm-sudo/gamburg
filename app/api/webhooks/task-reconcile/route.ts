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
// (created in the app, no source id) are never auto-closed.
//
// Two guards, and the second exists because the first was not enough. An
// empty list was rejected rather than treated as "close everything" - but
// the first real run arrived as a list of ONE element holding every id
// comma-joined, which is not empty, matched nothing, and closed all 1462
// open tasks. Length is the wrong measure: what matters is how much of the
// board a single call is about to close. Hence the ratio guard below.
//
// Shares the task_sync secret env fallback so no new Make config is needed;
// a dedicated task_reconcile row in webhook_configs can override it.

interface TaskReconcilePayload {
  open_source_task_ids?: unknown;
  // Deliberate override for the ratio guard, for the genuine case where
  // most of the board really did close in עדכנית - a first reconcile after
  // a long gap. Has to be asked for; never defaulted on.
  //
  // The intended way to use it is two calls: run without it first and read
  // open_in_source off the refusal, which says whether the list parsed into
  // the hundreds of ids it should be or into one malformed blob. Only then
  // send it again with the flag.
  allow_mass_close?: boolean;
}

// Refuse when a call would close more than this share of the open synced
// tasks. A reconcile normally trims a tail; closing nearly everything means
// the list arrived broken, not that the firm finished its work.
const MASS_CLOSE_RATIO = 0.5;

// Make sends this field in whatever shape the aggregator happened to
// produce, and three scenarios so far have each found a different wrong
// one. Same tolerance as readBatch in lib/webhook-batch.ts: the data is
// there and usable, so read it and warn, rather than reject a correct
// list for its punctuation.
//
// Splitting elements on commas is safe here because a source task id is
// עדכנית's numeric Counter - it never contains one.
function readIds(input: unknown): { ids: string[]; warnings: string[] } {
  const warnings: string[] = [];
  let value = input;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[")) {
      try {
        value = JSON.parse(trimmed);
        warnings.push(
          "open_source_task_ids arrived as a JSON string rather than an array - the mapped field is wrapped in quotes in the request body",
        );
      } catch {
        return { ids: [], warnings };
      }
    } else {
      value = trimmed.split(",");
      warnings.push(
        "open_source_task_ids arrived as a comma-joined string rather than an array - wrap the mapped array in square brackets in the HTTP body",
      );
    }
  }

  if (!Array.isArray(value)) return { ids: [], warnings };

  const ids: string[] = [];
  let splitAny = false;
  for (const entry of value) {
    const parts = String(entry).split(",");
    if (parts.length > 1) splitAny = true;
    for (const part of parts) {
      const id = part.trim();
      if (id.length > 0) ids.push(id);
    }
  }
  if (splitAny) {
    warnings.push(
      "open_source_task_ids held comma-joined values inside the array - the aggregator output was sent as one element instead of many",
    );
  }

  return { ids: [...new Set(ids)], warnings };
}

export async function POST(request: Request) {
  return runIncomingWebhook(
    "task_reconcile",
    request,
    process.env.MAKE_TASK_SYNC_WEBHOOK_SECRET,
    async (rawBody, admin) => {
      const body = rawBody as TaskReconcilePayload;

      const { ids, warnings } = readIds(body.open_source_task_ids);
      const openIds = new Set(ids);
      if (openIds.size === 0) {
        return {
          status: 400,
          json: {
            error:
              "open_source_task_ids is empty or unreadable - refusing to close every synced task; expected an array of source task ids",
            warnings,
          },
        };
      }

      // PostgREST caps a single select at 1000 rows, so page through all
      // open synced tasks the same way the cases screen does
      const staleIds: string[] = [];
      let openHere = 0;
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
          if (!row.source_task_id) continue;
          openHere++;
          if (!openIds.has(row.source_task_id.trim())) {
            staleIds.push(row.id);
          }
        }
        if (data.length < BATCH) break;
      }

      // The guard that was missing. Nothing has been written yet at this
      // point - the whole stale list is collected first - so refusing here
      // leaves the board exactly as it was.
      if (
        !body.allow_mass_close &&
        openHere > 0 &&
        staleIds.length > openHere * MASS_CLOSE_RATIO
      ) {
        return {
          status: 400,
          json: {
            error: `refusing to close ${staleIds.length} of ${openHere} open synced tasks - that is more than ${Math.round(
              MASS_CLOSE_RATIO * 100,
            )}% of the board, which usually means open_source_task_ids arrived malformed rather than that the work is done. Check the shape of the list; pass allow_mass_close: true if this really is intended.`,
            open_in_source: openIds.size,
            open_here: openHere,
            would_close: staleIds.length,
            warnings,
          },
        };
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
          open_here: openHere,
          closed_here: staleIds.length,
          warnings,
        },
      };
    },
  );
}
