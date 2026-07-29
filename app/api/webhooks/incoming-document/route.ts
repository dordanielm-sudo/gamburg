import { runIncomingWebhook } from "@/lib/webhook-handler";

// Section 4.3(ב): Make calls this directly (not via the hourly pull) whenever
// a new relevant document arrives, so the handler (or, if the case has none,
// every active manager) gets an immediate in-app notification. Also used by
// the client-upload landing page flow: a file lands in the client's Drive
// folder -> Make calls this with the folder link and file name -> the case
// gets a clickable Drive link and a documents row, and the handler is
// notified.
//
// Auth: a shared secret header, not a user session - Make is not a logged-in
// CRM user (see lib/webhook-handler.ts for the webhook_configs/env lookup).

interface IncomingDocumentPayload {
  case_number?: string;
  document_name?: string;
  drive_url?: string;
  message?: string;
}

export async function POST(request: Request) {
  return runIncomingWebhook(
    "incoming_document",
    request,
    process.env.MAKE_INCOMING_WEBHOOK_SECRET,
    async (rawBody, admin) => {
      const body = rawBody as IncomingDocumentPayload;

      const caseNumber = body.case_number?.trim();
      if (!caseNumber) {
        return { status: 400, json: { error: "case_number is required" } };
      }

      const { data: caseRow, error: caseError } = await admin
        .from("cases")
        .select("id, case_name, handler_id")
        .eq("case_number", caseNumber)
        .maybeSingle();

      if (caseError) {
        return { status: 500, json: { error: caseError.message } };
      }
      if (!caseRow) {
        return {
          status: 404,
          json: { error: `case_number ${caseNumber} not found` },
        };
      }

      const driveUrl = body.drive_url?.trim();
      if (driveUrl) {
        const { error: driveError } = await admin
          .from("cases")
          .update({ drive_url: driveUrl })
          .eq("id", caseRow.id);
        if (driveError) {
          return { status: 500, json: { error: driveError.message } };
        }
      }

      const documentName = body.document_name?.trim();
      if (documentName) {
        // status tracks correctness (תקין/בתיקון/נדרש תיקון), not arrival -
        // a freshly-uploaded document starts unreviewed, so "נדרש תיקון"
        // until a handler marks it תקין
        const { error: docError } = await admin.from("documents").insert({
          case_id: caseRow.id,
          title: documentName,
          status: "correction_needed",
          doc_date: new Date().toISOString().slice(0, 10),
        });
        if (docError) {
          return { status: 500, json: { error: docError.message } };
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
          return { status: 500, json: { error: insertError.message } };
        }
      }

      return { status: 200, json: { status: "ok", notified: recipientIds.length } };
    },
  );
}
