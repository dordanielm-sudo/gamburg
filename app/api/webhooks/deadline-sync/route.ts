import type { SupabaseClient } from "@supabase/supabase-js";
import { runIncomingWebhook } from "@/lib/webhook-handler";
import {
  readBatch,
  summarize,
  mapWithConcurrency,
  type BatchOutcome,
} from "@/lib/webhook-batch";

// Import of deadlines (מועדים) from עדכנית's custom fields
// (vwExportToOuterSystems_UserData), mirroring case-sync/task-sync. The
// case_sync_allowlist gate has been lifted (see case-sync) - a deadline
// still requires its case to already exist in our cases table. Keyed on
// (case_id, source_field_name) - each such field holds a single value per
// case, not a list, so a resync updates the same row.
//
// Only ever writes label/due_date - never `status`, so a handler checking
// a deadline off in the CRM survives a resync (same lesson as case-sync's
// upsert bug).
//
// Accepts one record or many - see lib/webhook-batch.ts. This is the
// costliest sweep in the system: it is one record per field per case, so a
// full pass over ~600 cases with a dozen dated fields each is thousands of
// Make operations at one call apiece, and a few dozen at a hundred.

interface DeadlineSyncPayload {
  case_number?: string;
  source_field_name?: string;
  // which חוצץ the field lives on. A field name is not always unique across
  // tabs ("מועד העלאת הצו" exists on more than one), so without this the
  // write-back cannot tell which tab to update and silently touches nothing.
  page_name?: string | null;
  label?: string | null;
  due_date?: string | null;
}

interface SyncResult extends BatchOutcome {
  deadline_id?: string;
}

async function syncOne(
  body: DeadlineSyncPayload,
  admin: SupabaseClient,
  caseIds: Map<string, string>,
): Promise<SyncResult> {
  const caseNumber = body.case_number?.trim();
  const sourceFieldName = body.source_field_name?.trim();
  const ref = `${caseNumber ?? "?"} / ${sourceFieldName ?? "?"}`;

  if (!caseNumber || !sourceFieldName) {
    return {
      ref,
      status: "error",
      message: "case_number and source_field_name are required",
    };
  }

  const dueDate = body.due_date?.trim();
  if (!dueDate) {
    // the field is empty in עדכנית for this case - nothing to sync yet,
    // not an error (most cases won't have every deadline field filled in)
    return { ref, status: "skipped", message: "no due_date" };
  }

  const caseId = caseIds.get(caseNumber);
  if (!caseId) {
    return {
      ref,
      status: "error",
      message: `no case found for case_number ${caseNumber}`,
    };
  }

  const label = body.label?.trim() || sourceFieldName;
  const pageName = body.page_name?.trim() || null;

  const { data: updated, error: updateError } = await admin
    .from("case_deadlines")
    .update({ label, due_date: dueDate, page_name: pageName })
    .eq("case_id", caseId)
    .eq("source_field_name", sourceFieldName)
    .select("id");
  if (updateError) {
    return { ref, status: "error", message: updateError.message };
  }
  if (updated && updated.length > 0) {
    return { ref, status: "ok", deadline_id: updated[0].id };
  }

  const { data: inserted, error: insertError } = await admin
    .from("case_deadlines")
    .insert({
      case_id: caseId,
      source_field_name: sourceFieldName,
      page_name: pageName,
      label,
      due_date: dueDate,
    })
    .select("id")
    .single();
  if (insertError) {
    return { ref, status: "error", message: insertError.message };
  }

  return { ref, status: "ok", deadline_id: inserted.id };
}

export async function POST(request: Request) {
  return runIncomingWebhook(
    "deadline_sync",
    request,
    process.env.MAKE_DEADLINE_SYNC_WEBHOOK_SECRET,
    async (rawBody, admin) => {
      const { records, batched, warnings, error } =
        readBatch<DeadlineSyncPayload>(rawBody);
      if (error) return { status: 400, json: { error } };

      // Every record's case is looked up once, here, instead of once per
      // record: a batch is usually many fields of the same few cases, so
      // this is a handful of ids rather than a hundred round trips.
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

      // What is left per record is an update and possibly an insert, which
      // are independent of one another - so several run at once rather than
      // one after another. Make gives up waiting at forty seconds, and a
      // hundred records in strict sequence does not fit inside that.
      const results = await mapWithConcurrency(records, 8, (record) =>
        syncOne(record, admin, caseIds),
      );

      // One record keeps the original reply exactly, so the scenario that
      // sends that shape today needs no change at all.
      if (!batched) {
        const only = results[0];
        if (only.status === "error") {
          return { status: 400, json: { error: only.message } };
        }
        if (only.status === "skipped") {
          return { status: 200, json: { status: "skipped", reason: only.message } };
        }
        return {
          status: 200,
          json: { status: "ok", deadline_id: only.deadline_id, warnings },
        };
      }

      // A batch answers 200 even when some rows failed: the call did its
      // job, and failing the whole request would have Make retry the
      // ninety-nine that worked. The failures are named in the reply and in
      // the webhooks panel.
      const failures = results.filter((r) => r.status === "error");
      return {
        status: 200,
        json: {
          status: "ok",
          ...summarize(results),
          warnings,
          failures: failures.map((f) => ({ ref: f.ref, message: f.message })),
        },
        // webhook_logs keeps one row per call; a hundred records of payload
        // in each would grow the table faster than the 30-day prune clears
        // it, and the log is for seeing what arrived, not for storing it a
        // second time.
        logBody: { batch: records.length },
      };
    },
  );
}
