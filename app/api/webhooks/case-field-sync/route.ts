import { runIncomingWebhook } from "@/lib/webhook-handler";

// Generic import of חוצצים (tabs) fields from עדכנית's custom-fields view
// (vwExportToOuterSystems_UserData) - one call per field, same pattern as
// deadline-sync, but writing to the generic case_fields table instead of a
// fixed column, so any PageName/FieldName combination works without a new
// endpoint or migration. Keyed on (case_id, page_name, field_name) - a
// resync updates the same row via UPDATE-then-INSERT (never a plain
// upsert, which resets unlisted columns to their default on conflict).
//
// Unlike deadline-sync, an empty value is NOT skipped: a tab should show
// every field it has (per explicit request - "כל שלושים השדות תמיד"),
// with a dash for whatever's blank, so the row is written with nulls
// instead of not being written at all.

interface CaseFieldSyncPayload {
  case_number?: string;
  page_name?: string;
  field_name?: string;
  value_text?: string | null;
  value_date?: string | null;
  value_number?: number | null;
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
      const fieldName = body.field_name?.trim();
      if (!caseNumber || !pageName || !fieldName) {
        return {
          status: 400,
          json: { error: "case_number, page_name and field_name are required" },
        };
      }

      const valueText = body.value_text?.trim() || null;
      const valueDate = body.value_date?.trim() || null;
      const valueNumber =
        typeof body.value_number === "number" ? body.value_number : null;

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

      const fieldValues = {
        value_text: valueText,
        value_date: valueDate,
        value_number: valueNumber,
        source_updated_at: new Date().toISOString(),
      };

      const { data: updated, error: updateError } = await admin
        .from("case_fields")
        .update(fieldValues)
        .eq("case_id", caseRow.id)
        .eq("page_name", pageName)
        .eq("field_name", fieldName)
        .select("id");
      if (updateError) {
        return { status: 500, json: { error: updateError.message } };
      }

      if (updated && updated.length > 0) {
        return { status: 200, json: { status: "ok", field_id: updated[0].id } };
      }

      const { data: inserted, error: insertError } = await admin
        .from("case_fields")
        .insert({
          case_id: caseRow.id,
          page_name: pageName,
          field_name: fieldName,
          ...fieldValues,
        })
        .select("id")
        .single();
      if (insertError) {
        return { status: 500, json: { error: insertError.message } };
      }

      return { status: 200, json: { status: "ok", field_id: inserted.id } };
    },
  );
}
