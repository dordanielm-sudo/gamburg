import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWebhookValue, logWebhookCall } from "@/lib/webhook-config";
import { verifyTelegramInitData } from "@/lib/telegram-init-data";

// The Telegram Mini App lead form (app/lead) posts here, and this forwards
// the lead to Make. The URL comes from webhook_configs (editable at
// /dashboard/webhooks) with the env var as a fallback, same as the write-back
// in /api/case-updates, and every call is written to webhook_logs so a lead
// that never arrived can be traced from the panel.
//
// There is no CRM session here - the person filling this in is a prospective
// client, not a user of the system. proxy.ts excludes /api/* already, and
// /lead is excluded there too so the page itself is reachable logged out.

const WEBHOOK_KEY = "outgoing_telegram_lead";

interface LeadPayload {
  name?: string;
  phone?: string;
  init_data?: string;
}

// Deliberately loose: לידים arrive from mobile keyboards, with dashes,
// spaces, parentheses and an occasional country prefix. All we insist on is
// that what is left is a plausible phone number.
function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return null;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

// Not callMakeOutgoingWebhook: that one demands Make answer in our
// {status,...} shape, because a rejected write-back has to be undone in the
// CRM. A lead has nothing to undo - the scenario received it or it didn't -
// so a plain 2xx counts as delivered and the scenario needs no Webhook
// response module.
async function deliverLead(
  url: string,
  payload: Record<string, unknown>,
  timeoutMs = 10_000,
): Promise<{ status: "success" | "failure"; message?: string }> {
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

    const raw = (await response.text()).trim().slice(0, 120);
    if (!response.ok) {
      return {
        status: "failure",
        message: `Make החזיר קוד ${response.status}: ${raw || "(גוף ריק)"}`,
      };
    }
    return { status: "success", message: raw || undefined };
  } catch {
    return { status: "failure", message: "לא ניתן להתחבר ל-Make" };
  }
}

export async function POST(request: Request) {
  let payload: LeadPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { status: "failure", message: "invalid JSON body" },
      { status: 400 },
    );
  }

  const name = payload.name?.trim() ?? "";
  const rawPhone = payload.phone?.trim() ?? "";
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json(
      { status: "failure", message: "יש למלא שם מלא" },
      { status: 400 },
    );
  }
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return NextResponse.json(
      { status: "failure", message: "מספר הטלפון אינו תקין" },
      { status: 400 },
    );
  }

  // Telegram signs the initData string the Mini App receives, so with the bot
  // token set we can tell a real Telegram user from a script that found the
  // URL. Without the token there is nothing to check against; the form still
  // works (the lead is only a name and a phone - nothing is claimed about who
  // sent it), it is just open to junk. Setting TELEGRAM_BOT_TOKEN closes it.
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  let verified = false;
  if (botToken) {
    const result = verifyTelegramInitData(payload.init_data ?? "", botToken);
    if (!result.ok) {
      return NextResponse.json(
        { status: "failure", message: `unauthorized: ${result.reason}` },
        { status: 401 },
      );
    }
    verified = true;
  }

  const admin = createAdminClient();
  // Only what Make is sent, plus whether it was a verified Telegram user -
  // never the raw init_data, which carries the signature and is worthless in
  // a log anyway.
  const logBody = { name, phone, verified };

  const webhookUrl = await getWebhookValue(
    admin,
    WEBHOOK_KEY,
    process.env.MAKE_TELEGRAM_LEAD_WEBHOOK_URL,
  );

  if (!webhookUrl) {
    const message = "Make webhook לא מוגדר - הליד לא נשלח לשום מקום";
    const json = { status: "warning", message };
    await logWebhookCall(admin, WEBHOOK_KEY, "skipped", 200, logBody, json);
    return NextResponse.json(json);
  }

  // name and phone, nothing else - that is the whole contract with the
  // scenario on the other side.
  const result = await deliverLead(webhookUrl, { name, phone });

  await logWebhookCall(
    admin,
    WEBHOOK_KEY,
    result.status === "failure" ? "error" : "ok",
    200,
    logBody,
    result,
  );

  return NextResponse.json(result);
}
