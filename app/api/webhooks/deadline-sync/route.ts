import { runIncomingWebhook } from "@/lib/webhook-handler";

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

interface DeadlineSyncPayload {
  case_number?: string;
  source_field_name?: string;
  label?: string | null;
  due_date?: string | null;
}

export async function POST(request: Request) {
  return runIncomingWebhook(
    "deadline_sync",
    request,
    process.env.MAKE_DEADLINE_SYNC_WEBHOOK_SECRET,
    async (rawBody, admin) => {
      const body = rawBody as DeadlineSyncPayload;

      const caseNumber = body.case_number?.trim();
      const sourceFieldName = body.source_field_name?.trim();
      if (!caseNumber || !sourceFieldName) {
        return {
          status: 400,
          json: { error: "case_number and source_field_name are required" },
        };
      }

      const dueDate = body.due_date?.trim();
      if (!dueDate) {
        // the field is empty in עדכנית for this case - nothing to sync yet,
        // not an error (most cases won't have every deadline field filled in)
        return { status: 200, json: { status: "skipped", reason: "no due_date" } };
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

      const label = body.label?.trim() || sourceFieldName;

      const { data: updated, error: updateError } = await admin
        .from("case_deadlines")
        .update({ label, due_date: dueDate })
        .eq("case_id", caseRow.id)
        .eq("source_field_name", sourceFieldName)
        .select("id");
      if (updateError) {
        return { status: 500, json: { error: updateError.message } };
      }

      if (updated && updated.length > 0) {
        return { status: 200, json: { status: "ok", deadline_id: updated[0].id } };
      }

      const { data: inserted, error: insertError } = await admin
        .from("case_deadlines")
        .insert({
          case_id: caseRow.id,
          source_field_name: sourceFieldName,
          label,
          due_date: dueDate,
        })
        .select("id")
        .single();
      if (insertError) {
        return { status: 500, json: { error: insertError.message } };
      }

      return { status: 200, json: { status: "ok", deadline_id: inserted.id } };
    },
  );
}
