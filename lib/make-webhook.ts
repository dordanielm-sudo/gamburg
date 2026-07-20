import "server-only";
import type { WebhookStatus } from "@/types/database";

export interface MakeWebhookResponse {
  status: WebhookStatus;
  message?: string;
  record_id?: string;
}

function isSyncStatus(
  value: unknown,
): value is "success" | "failure" | "warning" {
  return value === "success" || value === "failure" || value === "warning";
}

// Section 4.2.1: Make must reply synchronously with
// { status: "success"|"failure"|"warning", message?, record_id? }. Any
// network failure, timeout, non-2xx, or malformed body is treated as
// "failure" so the caller always gets a definite answer to show the user.
export async function callMakeOutgoingWebhook(
  url: string,
  payload: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<MakeWebhookResponse> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const body = await response.json().catch(() => null);
    if (response.ok && body && isSyncStatus(body.status)) {
      return {
        status: body.status,
        message: typeof body.message === "string" ? body.message : undefined,
        record_id:
          typeof body.record_id === "string" ? body.record_id : undefined,
      };
    }
    return { status: "failure", message: "תשובה לא תקינה מ-Make" };
  } catch {
    return { status: "failure", message: "לא ניתן להתחבר ל-Make" };
  }
}
