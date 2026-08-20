import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { callMakeOutgoingWebhook } from "@/lib/make-webhook";
import { getWebhookValue, logWebhookCall } from "@/lib/webhook-config";
import { verifyTelegramInitData } from "@/lib/telegram-init-data";

// The Telegram Mini App lead form (app/lead) posts here, and this forwards
// the lead to Make - the same outgoing pattern as /api/case-updates: the URL
// comes from webhook_configs (editable at /dashboard/webhooks) with the env
// var as a fallback, and every call is written to webhook_logs so a lead
// that never arrived can be traced from the panel.
//
// Auth is Telegram's own: the browser sends the signed initData string and
// the server checks it against the bot token (lib/telegram-init-data.ts).
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

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    // Refusing beats accepting: with no token there is no way to tell a real
    // Telegram user from anyone who found the URL, and a lead nobody can
    // trace back to a person is worse than no lead.
    return NextResponse.json(
      {
        status: "failure",
        message: "TELEGRAM_BOT_TOKEN is not configured",
      },
      { status: 503 },
    );
  }

  const verified = verifyTelegramInitData(payload.init_data ?? "", botToken);
  if (!verified.ok) {
    return NextResponse.json(
      { status: "failure", message: `unauthorized: ${verified.reason}` },
      { status: 401 },
    );
  }

  const admin = createAdminClient();
  // never the raw init_data - it carries the signature and is worthless in a
  // log anyway; what matters is who and what came through.
  const logBody = {
    name,
    phone,
    telegram_id: verified.user?.id ?? null,
    username: verified.user?.username ?? null,
  };

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

  const result = await callMakeOutgoingWebhook(webhookUrl, {
    ...logBody,
    first_name: verified.user?.first_name ?? null,
    last_name: verified.user?.last_name ?? null,
    language_code: verified.user?.language_code ?? null,
    source: "telegram_lead_form",
    submitted_at: new Date().toISOString(),
  });

  const logStatus =
    result.status === "failure"
      ? "error"
      : result.status === "warning"
        ? "skipped"
        : "ok";
  await logWebhookCall(admin, WEBHOOK_KEY, logStatus, 200, logBody, result);

  return NextResponse.json(result);
}
