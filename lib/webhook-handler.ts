import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWebhookValue, logWebhookCall } from "@/lib/webhook-config";

type HandlerResult = {
  status: number;
  json: Record<string, unknown>;
  // Stands in for the request body in webhook_logs. A handler sets it when
  // the real body is too big to keep a copy of on every call - the log is
  // for seeing what arrived, not for storing it a second time.
  logBody?: unknown;
};

// Shared shape for every incoming Make webhook: check the shared-secret
// header against webhook_configs (DB, editable from /dashboard/webhooks)
// falling back to the given env var, parse the JSON body, run the route's
// own logic, and log the call (for the same panel's request/response log)
// regardless of outcome.
export async function runIncomingWebhook(
  key: string,
  request: Request,
  envSecretVar: string | undefined,
  handler: (
    body: unknown,
    admin: ReturnType<typeof createAdminClient>,
  ) => Promise<HandlerResult>,
) {
  const admin = createAdminClient();
  const secret = request.headers.get("x-webhook-secret");
  const expected = await getWebhookValue(admin, key, envSecretVar);

  if (!expected || secret !== expected) {
    const json = { error: "unauthorized" };
    await logWebhookCall(admin, key, "unauthorized", 401, null, json);
    return NextResponse.json(json, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const json = { error: "invalid JSON body" };
    await logWebhookCall(admin, key, "error", 400, null, json);
    return NextResponse.json(json, { status: 400 });
  }

  const result = await handler(body, admin);
  const outcome: "ok" | "error" | "skipped" =
    result.json.status === "ok"
      ? "ok"
      : result.json.status === "skipped"
        ? "skipped"
        : "error";
  await logWebhookCall(
    admin,
    key,
    outcome,
    result.status,
    result.logBody !== undefined ? result.logBody : body,
    result.json,
  );
  return NextResponse.json(result.json, { status: result.status });
}
