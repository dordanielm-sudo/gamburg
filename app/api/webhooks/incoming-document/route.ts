import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Section 4.3(ב): Make calls this directly (not via the hourly pull) whenever
// a new relevant document arrives, so the handler (or, if the case has none,
// every active manager) gets an immediate in-app notification. Also used by
// the client-upload landing page flow: a file lands in the client's Drive
// folder -> Make calls this with the folder link and file name -> the case
// gets a clickable Drive link and a documents row, and the handler is
// notified.
//
// Auth: a shared secret header, not a user session - Make is not a logged-in
// CRM user. Configure the same value in Make's HTTP module and in
// MAKE_INCOMING_WEBHOOK_SECRET.

interface IncomingDocumentPayload {
  case_number?: string;
  document_name?: string;
  drive_url?: string;
  message?: string;
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");
  const expected = process.env.MAKE_INCOMING_WEBHOOK_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: IncomingDocumentPayload;
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

  const admin = createAdminClient();

  const { data: caseRow, error: caseError } = await admin
    .from("cases")
    .select("id, case_name, handler_id")
    .eq("case_number", caseNumber)
    .maybeSingle();

  if (caseError) {
    return NextResponse.json({ error: caseError.message }, { status: 500 });
  }
  if (!caseRow) {
    return NextResponse.json(
      { error: `case_number ${caseNumber} not found` },
      { status: 404 },
    );
  }

  const driveUrl = body.drive_url?.trim();
  if (driveUrl) {
    const { error: driveError } = await admin
      .from("cases")
      .update({ drive_url: driveUrl })
      .eq("id", caseRow.id);
    if (driveError) {
      return NextResponse.json({ error: driveError.message }, { status: 500 });
    }
  }

  const documentName = body.document_name?.trim();
  if (documentName) {
    const { error: docError } = await admin.from("documents").insert({
      case_id: caseRow.id,
      title: documentName,
      status: "received",
      doc_date: new Date().toISOString().slice(0, 10),
    });
    if (docError) {
      return NextResponse.json({ error: docError.message }, { status: 500 });
    }
  }

  const message =
    body.message?.trim() ||
    (documentName ? `מסמך חדש: ${documentName}` : "מסמך חדש התקבל בתיק");

  let recipientIds: string[] = [];
  if (caseRow.handler_id) {
    recipientIds = [caseRow.handler_id];
  } else {
    const { data: managers } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "manager")
      .eq("is_active", true);
    recipientIds = (managers ?? []).map((m) => m.id);
  }

  if (recipientIds.length > 0) {
    const { error: insertError } = await admin.from("notifications").insert(
      recipientIds.map((userId) => ({
        type: "new_document" as const,
        user_id: userId,
        case_id: caseRow.id,
        title: "מסמך חדש",
        body: `${caseRow.case_name}: ${message}`,
      })),
    );
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ status: "ok", notified: recipientIds.length });
}
