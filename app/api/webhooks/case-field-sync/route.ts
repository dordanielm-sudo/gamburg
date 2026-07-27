import { runIncomingWebhook } from "@/lib/webhook-handler";

// Generic import of חוצצים (tabs) fields from עדכנית's custom-fields view
// (vwExportToOuterSystems_UserData), writing to the generic case_fields
// table instead of a fixed column, so any PageName/FieldName combination
// works without a new endpoint or migration.
//
// One call per CASE (not per field, unlike deadline-sync) - the whole
// page's fields come in as an array and are written in a single upsert.
// This is safe as a true upsert (unlike cases/tasks) because case_fields
// has no CRM-only columns a resync could ever wipe - it's read-only in the
// UI, only ever written here.
//
// An empty value is NOT skipped: a tab should show every field it has (per
// explicit request - "כל שלושים השדות תמיד"), with a dash for whatever's
// blank, so a row is written with nulls instead of not being written.

interface CaseFieldEntry {
  field_name?: string;
  value_text?: string | null;
  value_date?: string | null;
  value_number?: number | null;
}

interface CaseFieldSyncPayload {
  case_number?: string;
  page_name?: string;
  fields?: CaseFieldEntry[];
}

export async function POST(request: Request) {
  return runIncomingWebhook(
    "case_field_sync",
    request,
    process.env.MAKE_CASE_FIELD_SYNC_WEBHOOK_SECRET,
    async (rawBody, admin) => {
      const body = rawBody as CaseFieldSyncPayload;

      const caseNumber = body.case_number?.trim();
      const pageName = body.page_name?.trim();
      const fields = Array.isArray(body.fields) ? body.fields : [];
      if (!caseNumber || !pageName || fields.length === 0) {
        return {
          status: 400,
          json: { error: "case_number, page_name and a non-empty fields array are required" },
        };
      }

      const warnings: string[] = [];
      const rows: {
        case_id: string;
        page_name: string;
        field_name: string;
        value_text: string | null;
        value_date: string | null;
        value_number: number | null;
        source_updated_at: string;
      }[] = [];

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

      const sourceUpdatedAt = new Date().toISOString();
      for (const entry of fields) {
        const fieldName = entry.field_name?.trim();
        if (!fieldName) {
          warnings.push("skipped a field entry with no field_name");
          continue;
        }
        rows.push({
          case_id: caseRow.id,
          page_name: pageName,
          field_name: fieldName,
          value_text: entry.value_text?.trim() || null,
          value_date: entry.value_date?.trim() || null,
          value_number:
            typeof entry.value_number === "number" ? entry.value_number : null,
          source_updated_at: sourceUpdatedAt,
        });
      }

      if (rows.length === 0) {
        return { status: 400, json: { error: "no valid field entries in fields array" } };
      }

      const { error: upsertError } = await admin
        .from("case_fields")
        .upsert(rows, { onConflict: "case_id,page_name,field_name" });
      if (upsertError) {
        return { status: 500, json: { error: upsertError.message } };
      }

      return {
        status: 200,
        json: { status: "ok", case_id: caseRow.id, synced: rows.length, warnings },
      };
    },
  );
}
