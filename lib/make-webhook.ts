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

    // Read as text first so a rejection can say what actually came back. The
    // generic "invalid response" covered three very different faults - a
    // non-2xx, a body that is not JSON at all (Make answers "Accepted" until
    // the scenario has a Webhook response module), and a JSON body whose
    // status is not one of ours - and told them apart for nobody.
    const raw = await response.text();
    let body: unknown = null;
    try {
      body = JSON.parse(raw);
    } catch {
      // left null - reported below along with what was received
    }

    const parsed = body as { status?: unknown; message?: unknown; record_id?: unknown } | null;
    if (response.ok && parsed && isSyncStatus(parsed.status)) {
      return {
        status: parsed.status,
        message: typeof parsed.message === "string" ? parsed.message : undefined,
        record_id:
          typeof parsed.record_id === "string"
            ? parsed.record_id
            : typeof parsed.record_id === "number"
              ? String(parsed.record_id)
              : undefined,
      };
    }

    const excerpt = raw.trim().slice(0, 120) || "(גוף ריק)";
    if (!response.ok) {
      return {
        status: "failure",
        message: `Make החזיר קוד ${response.status}: ${excerpt}`,
      };
    }
    if (!parsed) {
      return {
        status: "failure",
        message: `תשובת Make אינה JSON: ${excerpt} - חסר מודול Webhook response בסניף שרץ`,
      };
    }
    return {
      status: "failure",
      message: `תשובת Make חסרה status תקין (success/failure/warning): ${excerpt}`,
    };
  } catch {
    return { status: "failure", message: "לא ניתן להתחבר ל-Make" };
  }
}
