import type { SupabaseClient } from "@supabase/supabase-js";
import { runIncomingWebhook } from "@/lib/webhook-handler";
import {
  readBatch,
  summarize,
  mapWithConcurrency,
  type BatchOutcome,
} from "@/lib/webhook-batch";
import { resolveOrCreateHandler } from "@/lib/handler-resolution";
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
  status_changed_at?: string | null;
}

// מהות תיק (synced) is coarser than שלב (CRM-native, driven by the stepper):
// several שלב values collapse into one מהות. When a case first arrives we
// seed its שלב from its מהות so the stepper isn't blank on 1,600+ cases -
// picking the EARLIEST stage the מהות could mean, since claiming a later one
// would assert progress nothing has evidenced. Applied on INSERT only: once
// a case exists, its שלב belongs to whoever moved it, and a resync must
// never walk that back (same rule as the flags/manager_note columns).
//
// חדל"פ cases can go through either of two tracks in עדכנית - via the רשם
// (registrar) or straight to בית משפט (court) - which produce differently
// worded מהות values for the same substantive stage. Confirmed against the
// live MautName list (vwTikMaut): both tracks need a needle, or a case
// opened via the רשם track lands with no שלב at all.
const NATURE_TO_STAGE: [needle: string, stage: string][] = [
  ["לא הוגש טופס 5", "קליטה"],
  ["מחכים לצו", "ממתין לצו"],
  ["מחכים להחלטת רשם", "ממתין לצו"],
  ["צו פתיחת הליכים", "לאחר צו"],
  ["התקבלה החלטת רשם", "לאחר צו"],
  ["גובש הסדר", "שיקום"],
  ["שיקום", "שיקום"],
  ["הפטר", "הסתיים"],
];

function openingStage(caseNature: string | null | undefined): string | null {
  if (!caseNature) return null;
  for (const [needle, stage] of NATURE_TO_STAGE) {
    if (caseNature.includes(needle)) return stage;
  }
  return null;
}

interface SyncResult extends BatchOutcome {
  case_id?: string;
  warnings: string[];
  httpStatus: number;
}

// Handler names resolved once per distinct name before the records run, not
// once per record. Resolution can create a profile, so two records naming
// the same missing person at the same time would each find nobody and each
// create one - doing it up front and deduplicated is what makes the records
// themselves safe to run several at a time.
interface HandlerLookup {
  ids: Map<string, string | null>;
  warnings: Map<string, string>;
}

async function resolveHandlers(
  records: CaseSyncPayload[],
  admin: SupabaseClient,
): Promise<HandlerLookup> {
  const names = [
    ...new Set(
      records
        .map((r) => r.handler_name?.trim())
        .filter((n): n is string => Boolean(n)),
    ),
  ];

  const ids = new Map<string, string | null>();
  const warnings = new Map<string, string>();
  for (const name of names) {
    const resolved = await resolveOrCreateHandler(admin, name);
    ids.set(name, resolved.id);
    if (resolved.error) {
      warnings.set(
        name,
        `handler_name "${name}": ${resolved.error} - handler_id left unset`,
      );
    } else if (resolved.created) {
      warnings.set(
        name,
        `created a new profile for handler_name "${name}" - no login until a manager sets a real email`,
      );
    }
  }
  return { ids, warnings };
}

async function syncOne(
  body: CaseSyncPayload,
  admin: SupabaseClient,
  handlers: HandlerLookup,
): Promise<SyncResult> {
  const warnings: string[] = [];
  const caseNumber = body.case_number?.trim();
  const ref = caseNumber ?? "?";

  if (!caseNumber) {
    return { ref, status: "error", httpStatus: 400, warnings, message: "case_number is required" };
  }
  if (!body.case_name?.trim()) {
    return { ref, status: "error", httpStatus: 400, warnings, message: "case_name is required" };
  }

  let handlerId: string | null = null;
  const handlerName = body.handler_name?.trim();
  if (handlerName) {
    handlerId = handlers.ids.get(handlerName) ?? null;
    const warning = handlers.warnings.get(handlerName);
    if (warning) warnings.push(warning);
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
    status_changed_at: body.status_changed_at ?? null,
  };

  const { data: updated, error: updateError } = await admin
    .from("cases")
    .update(sourceFields)
    .eq("case_number", caseNumber)
    .select("id");

  if (updateError) {
    return { ref, status: "error", httpStatus: 500, warnings, message: updateError.message };
  }

  if (updated && updated.length > 0) {
    return { ref, status: "ok", httpStatus: 200, warnings, case_id: updated[0].id };
  }

  const { data: inserted, error: insertError } = await admin
    .from("cases")
    .insert({
      case_number: caseNumber,
      ...sourceFields,
      case_stage: openingStage(sourceFields.case_nature),
    })
    .select("id")
    .single();

  if (insertError) {
    return { ref, status: "error", httpStatus: 500, warnings, message: insertError.message };
  }

  return { ref, status: "ok", httpStatus: 200, warnings, case_id: inserted.id };
}

export async function POST(request: Request) {
  return runIncomingWebhook(
    "case_sync",
    request,
    process.env.MAKE_CASE_SYNC_WEBHOOK_SECRET,
    async (rawBody, admin) => {
      const { records, batched, warnings, error } =
        readBatch<CaseSyncPayload>(rawBody);
      if (error) return { status: 400, json: { error } };

      const handlers = await resolveHandlers(records, admin);

      // The part that had to be sequential is done. An update and possibly
      // an insert per case are independent, so several run at once - a
      // hundred records in strict sequence does not fit inside the forty
      // seconds Make waits.
      const results = await mapWithConcurrency(records, 8, (record) =>
        syncOne(record, admin, handlers),
      );

      // One record answers exactly as before, so the scenario sending that
      // shape today needs no change.
      if (!batched) {
        const only = results[0];
        if (only.status === "error") {
          return { status: only.httpStatus, json: { error: only.message } };
        }
        return {
          status: 200,
          json: { status: "ok", case_id: only.case_id, warnings: only.warnings },
        };
      }

      const failures = results.filter((r) => r.status === "error");
      return {
        status: 200,
        json: {
          status: "ok",
          ...summarize(results),
          // every record's warnings, flattened - a created handler profile
          // is the thing worth noticing in a sweep, and burying it per-row
          // would mean nobody ever reads it
          warnings: [...warnings, ...results.flatMap((r) => r.warnings)],
          failures: failures.map((f) => ({ ref: f.ref, message: f.message })),
        },
        logBody: { batch: records.length },
      };
    },
  );
}
