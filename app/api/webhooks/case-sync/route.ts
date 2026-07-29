import { runIncomingWebhook } from "@/lib/webhook-handler";
import type { SpouseDetails } from "@/types/database";

// Import of cases from עדכנית via the handler's Make scenario. Auth: a
// shared secret header (webhook_configs.case_sync, falling back to
// MAKE_CASE_SYNC_WEBHOOK_SECRET - see lib/webhook-handler.ts), same style as
// the other sync/incoming routes.
//
// The case_sync_allowlist gate (used during the initial pilot to grow the
// synced case set one at a time) has been lifted by explicit request now
// that the pilot proved out the field mapping - every case_number is
// accepted. The table itself is left in place, just unused.
//
// Only ever writes the "source" columns on cases (see 0001_schema.sql) -
// team turns out to also come from עדכנית (TeamName), so it's synced here
// too; CRM-only fields (flags, manager_note, manager_follow_up) are never
// part of the write payload. Deliberately UPDATE-then-INSERT rather than
// .upsert(): PostgREST's upsert fills every column absent from the payload
// with its table default on conflict (false/null for the CRM-only fields),
// which silently wipes manual work on resync - confirmed by hand during the
// pilot. A plain UPDATE only ever touches the columns actually given.

interface CaseSyncPayload {
  case_number?: string;
  case_name?: string;
  opened_date?: string | null;
  case_type?: string | null;
  case_nature?: string | null;
  handler_name?: string | null;
  external_ref?: string | null;
  status?: string | null;
  team?: string | null;
  client_id_number?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  client_address?: string | null;
  // { name, id_number, phone } - some cases have a spouse as a co-party
  spouse_details?: SpouseDetails | null;
  source_updated_at?: string | null;
}

export async function POST(request: Request) {
  return runIncomingWebhook(
    "case_sync",
    request,
    process.env.MAKE_CASE_SYNC_WEBHOOK_SECRET,
    async (rawBody, admin) => {
      const body = rawBody as CaseSyncPayload;

      const caseNumber = body.case_number?.trim();
      if (!caseNumber) {
        return { status: 400, json: { error: "case_number is required" } };
      }
      if (!body.case_name?.trim()) {
        return { status: 400, json: { error: "case_name is required" } };
      }

      const warnings: string[] = [];
      let handlerId: string | null = null;
      const handlerName = body.handler_name?.trim();
      if (handlerName) {
        // "מנהל" in עדכנית is a generic placeholder for cases חנה handles
        // directly rather than a specific handler name - route it to the
        // manager for now (per handler request), not a name match.
        const query =
          handlerName === "מנהל"
            ? admin.from("profiles").select("id").eq("role", "manager")
            : admin.from("profiles").select("id").eq("full_name", handlerName);
        const { data: handler } = await query.maybeSingle();
        if (handler) {
          handlerId = handler.id;
        } else {
          warnings.push(
            `no profile matches handler_name "${handlerName}" - handler_id left unset`,
          );
        }
      }

      const sourceFields = {
        case_name: body.case_name.trim(),
        opened_date: body.opened_date ?? null,
        case_type: body.case_type ?? null,
        case_nature: body.case_nature ?? null,
        handler_id: handlerId,
        external_ref: body.external_ref ?? null,
        status: body.status ?? null,
        team: body.team ?? null,
        client_id_number: body.client_id_number ?? null,
        client_phone: body.client_phone ?? null,
        client_email: body.client_email ?? null,
        client_address: body.client_address ?? null,
        spouse_details: body.spouse_details ?? null,
        source_updated_at: body.source_updated_at ?? new Date().toISOString(),
      };

      const { data: updated, error: updateError } = await admin
        .from("cases")
        .update(sourceFields)
        .eq("case_number", caseNumber)
        .select("id");

      if (updateError) {
        return { status: 500, json: { error: updateError.message } };
      }

      if (updated && updated.length > 0) {
        return {
          status: 200,
          json: { status: "ok", case_id: updated[0].id, warnings },
        };
      }

      const { data: inserted, error: insertError } = await admin
        .from("cases")
        .insert({ case_number: caseNumber, ...sourceFields })
        .select("id")
        .single();

      if (insertError) {
        return { status: 500, json: { error: insertError.message } };
      }

      return {
        status: 200,
        json: { status: "ok", case_id: inserted.id, warnings },
      };
    },
  );
}
