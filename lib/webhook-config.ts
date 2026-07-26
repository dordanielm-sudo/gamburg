import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookLogStatus } from "@/types/database";

// DB value (set via the /dashboard/webhooks panel) wins if present; falls
// back to the env var so nothing breaks for a webhook that hasn't been
// configured in the DB yet.
export async function getWebhookValue(
  admin: SupabaseClient,
  key: string,
  envFallback: string | undefined,
): Promise<string | null> {
  const { data } = await admin
    .from("webhook_configs")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  const dbValue = (data?.value as string | null)?.trim();
  return dbValue || envFallback || null;
}

export async function logWebhookCall(
  admin: SupabaseClient,
  key: string,
  status: WebhookLogStatus,
  statusCode: number,
  requestBody: unknown,
  responseBody: unknown,
) {
  await admin.from("webhook_logs").insert({
    webhook_key: key,
    status,
    status_code: statusCode,
    request_body: requestBody ?? null,
    response_body: responseBody ?? null,
  });
}
