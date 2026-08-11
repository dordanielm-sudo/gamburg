import { runIncomingWebhook } from "@/lib/webhook-handler";

// Generic import of חוצצים (tabs) fields from עדכנית's custom-fields view
// (vwExportToOuterSystems_UserData), writing to the generic case_fields
// table instead of a fixed column, so any PageName/FieldName combination
// works without a new endpoint or migration.
//
// Two body shapes, both accepted:
//
//   { case_number, page_name, fields: [...] }        one case+tab
//   { batches: [ {case_number, page_name, fields}, ... ] }   many at once
//
// The batch shape exists for operations cost, not convenience. Make charges
// per bundle through every module - an Iterator does not merge anything, it
// bills - so the only way to cut the count is to have fewer HTTP calls. A
// full recurring pull of every tab is ~3,200 case+tab pairs; at one call
// each that is ~96,000 operations a month on a nightly schedule, which no
// Make plan the firm would buy can absorb. At 100 pairs per call it is
// ~2,000. See docs/make-write-back.md.
//
// The single shape is kept because the existing חדל"פ scenario sends it -
// it keeps working untouched while the others move over.
//
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

interface CaseFieldGroup {
  case_number?: string;
  page_name?: string;
  fields?: CaseFieldEntry[];
}

interface CaseFieldSyncPayload extends CaseFieldGroup {
  batches?: CaseFieldGroup[];
}

interface FieldRow {
  case_id: string;
  page_name: string;
  field_name: string;
  value_text: string | null;
  value_date: string | null;
  value_number: number | null;
  source_updated_at: string;
}

// case_numbers are looked up in one query per chunk rather than one per
// group. PostgREST puts an `in` list in the query string, so it is chunked
// to keep the URL from growing without bound.
const CASE_LOOKUP_CHUNK = 200;

// Enough to cover a 100-case batch of a wide tab; past this the request
// body starts running into the reverse proxy's own limit, which surfaces as
// a 413 with no explanation from us.
const MAX_ROWS_PER_REQUEST = 20000;

export async function POST(request: Request) {
  return runIncomingWebhook(
    "case_field_sync",
    request,
    process.env.MAKE_CASE_FIELD_SYNC_WEBHOOK_SECRET,
    async (rawBody, admin) => {
      const body = rawBody as CaseFieldSyncPayload;
      const batched = Array.isArray(body.batches);
      const groups: CaseFieldGroup[] = batched ? body.batches! : [body];

      if (groups.length === 0) {
        return { status: 400, json: { error: "batches array is empty" } };
      }

      // { case_number, page_name, reason } for anything not written, so a
      // batch reports what it dropped instead of failing whole or lying.
      const skipped: { case_number: string | null; page_name: string | null; reason: string }[] =
        [];
      const valid: { caseNumber: string; pageName: string; fields: CaseFieldEntry[] }[] = [];

      for (const group of groups) {
        const caseNumber = group.case_number?.trim();
        const pageName = group.page_name?.trim();
        const fields = Array.isArray(group.fields) ? group.fields : [];
        if (!caseNumber || !pageName || fields.length === 0) {
          skipped.push({
            case_number: caseNumber ?? null,
            page_name: pageName ?? null,
            reason: "case_number, page_name and a non-empty fields array are required",
          });
          continue;
        }
        valid.push({ caseNumber, pageName, fields });
      }

      if (valid.length === 0) {
        return {
          status: 400,
          json: { error: "no valid entries in request", skipped },
        };
      }

      // One lookup for every case number in the request, not one per group.
      const caseNumbers = [...new Set(valid.map((v) => v.caseNumber))];
      const caseIdByNumber = new Map<string, string>();
      for (let i = 0; i < caseNumbers.length; i += CASE_LOOKUP_CHUNK) {
        const chunk = caseNumbers.slice(i, i + CASE_LOOKUP_CHUNK);
        const { data, error } = await admin
          .from("cases")
          .select("id, case_number")
          .in("case_number", chunk);
        if (error) {
          return { status: 500, json: { error: error.message } };
        }
        for (const row of data ?? []) {
          caseIdByNumber.set(row.case_number as string, row.id as string);
        }
      }

      // Keyed by case_id|page_name|field_name so a field repeated inside one
      // request collapses to its last value. The source view has a RowNum
      // column - repeating groups exist there - and Postgres refuses an
      // ON CONFLICT that would touch the same row twice in one statement,
      // which would otherwise fail the entire batch over one duplicate.
      const rowsByKey = new Map<string, FieldRow>();
      const sourceUpdatedAt = new Date().toISOString();
      let matchedCases = 0;

      for (const { caseNumber, pageName, fields } of valid) {
        const caseId = caseIdByNumber.get(caseNumber);
        if (!caseId) {
          skipped.push({
            case_number: caseNumber,
            page_name: pageName,
            reason: "no case found for this case_number",
          });
          continue;
        }
        matchedCases += 1;

        for (const entry of fields) {
          const fieldName = entry.field_name?.trim();
          if (!fieldName) continue;
          rowsByKey.set(`${caseId}|${pageName}|${fieldName}`, {
            case_id: caseId,
            page_name: pageName,
            field_name: fieldName,
            value_text: entry.value_text?.trim() || null,
            value_date: entry.value_date?.trim() || null,
            value_number:
              typeof entry.value_number === "number" ? entry.value_number : null,
            source_updated_at: sourceUpdatedAt,
          });
        }
      }

      const rows = [...rowsByKey.values()];
      if (rows.length === 0) {
        return {
          status: 400,
          json: { error: "no valid field entries in request", skipped },
        };
      }
      if (rows.length > MAX_ROWS_PER_REQUEST) {
        return {
          status: 413,
          json: {
            error: `request holds ${rows.length} field rows, over the ${MAX_ROWS_PER_REQUEST} limit - send fewer cases per batch`,
          },
        };
      }

      const { error: upsertError } = await admin
        .from("case_fields")
        .upsert(rows, { onConflict: "case_id,page_name,field_name" });
      if (upsertError) {
        return { status: 500, json: { error: upsertError.message } };
      }

      return {
        status: 200,
        json: {
          status: "ok",
          cases: matchedCases,
          synced: rows.length,
          skipped,
        },
        // The batch body is the whole payload - up to megabytes of field
        // values - and webhook_logs keeps every call. Logging it verbatim on
        // a recurring sync would grow the table faster than the data it
        // syncs, so a batch logs its shape instead of its contents. A single
        // call still logs in full: that is the one people read when chasing
        // a bad value.
        logBody: batched
          ? { batches: groups.length, cases: caseNumbers.length, fields: rows.length }
          : undefined,
      };
    },
  );
}
