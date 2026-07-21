import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Pilot import of cases from עדכנית via the handler's existing Make scenario.
// Two independent gates before anything is written, per explicit request
// ("שלא נמשוך את כולם ואז יהיה משהו ששכחנו"):
//   1. shared-secret auth, same style as incoming-document (0004b).
//   2. case_number must already be listed in case_sync_allowlist (0009) -
//      grown one case at a time as the field mapping is verified, so a
//      mistake in the Make scenario's own filter can't sync everyone.
//
// Only ever writes the "source" columns on cases (see 0001_schema.sql) -
// CRM-only fields (flags, manager_note, manager_follow_up, team) are never
// part of the upsert payload, so a resync never clobbers manual work.

interface CaseSyncPayload {
  case_number?: string;
  case_name?: string;
  opened_date?: string | null;
  case_type?: string | null;
  case_nature?: string | null;
  handler_name?: string | null;
  external_ref?: string | null;
  status?: string | null;
  client_id_number?: string | null;
  client_phone?: string | null;
  spouse_details?: Record<string, unknown> | null;
  source_updated_at?: string | null;
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");
  const expected = process.env.MAKE_CASE_SYNC_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: CaseSyncPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const caseNumber = body.case_number?.trim();
  if (!caseNumber) {
    return NextResponse.json(
      { error: "case_number is required" },
      { status: 400 },
    );
  }
  if (!body.case_name?.trim()) {
    return NextResponse.json(
      { error: "case_name is required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: allowed, error: allowlistError } = await admin
    .from("case_sync_allowlist")
    .select("case_number")
    .eq("case_number", caseNumber)
    .maybeSingle();

  if (allowlistError) {
    return NextResponse.json(
      { error: allowlistError.message },
      { status: 500 },
    );
  }
  if (!allowed) {
    return NextResponse.json(
      {
        error: `case_number ${caseNumber} is not in case_sync_allowlist - add it there first to include it in the pilot`,
      },
      { status: 403 },
    );
  }

  const warnings: string[] = [];
  let handlerId: string | null = null;
  const handlerName = body.handler_name?.trim();
  if (handlerName) {
    const { data: handler } = await admin
      .from("profiles")
      .select("id")
      .eq("full_name", handlerName)
      .maybeSingle();
    if (handler) {
      handlerId = handler.id;
    } else {
      warnings.push(
        `no profile matches handler_name "${handlerName}" - handler_id left unset`,
      );
    }
  }

  const { data: caseRow, error: upsertError } = await admin
    .from("cases")
    .upsert(
      {
        case_number: caseNumber,
        case_name: body.case_name.trim(),
        opened_date: body.opened_date ?? null,
        case_type: body.case_type ?? null,
        case_nature: body.case_nature ?? null,
        handler_id: handlerId,
        external_ref: body.external_ref ?? null,
        status: body.status ?? null,
        client_id_number: body.client_id_number ?? null,
        client_phone: body.client_phone ?? null,
        spouse_details: body.spouse_details ?? null,
        source_updated_at: body.source_updated_at ?? new Date().toISOString(),
      },
      { onConflict: "case_number" },
    )
    .select("id")
    .single();

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", case_id: caseRow.id, warnings });
}
