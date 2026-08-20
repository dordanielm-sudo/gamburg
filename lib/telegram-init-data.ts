import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Telegram Mini App auth. The lead form (app/lead) runs inside Telegram, so
// its POST arrives with no CRM session - the only thing proving who sent it
// is the initData string Telegram hands the page. Telegram signs that string
// with our bot token, which means the server can check it without trusting
// the browser: without this check /api/telegram-lead would be an open form
// anyone could point a script at, and every "lead" reaching Make would be
// worth exactly nothing.
//
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}

export type InitDataResult =
  | { ok: true; user: TelegramUser | null; authDate: Date }
  | { ok: false; reason: string };

// Telegram keeps initData valid indefinitely, so freshness is on us: a
// string captured once could otherwise be replayed forever.
const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = DEFAULT_MAX_AGE_SECONDS,
): InitDataResult {
  if (!initData) return { ok: false, reason: "missing init data" };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "init data has no hash" };

  // hash is what we are checking, and signature (Telegram's Ed25519 field
  // for third-party validation) is added after the hash is computed - both
  // stay out of the check string.
  params.delete("hash");
  params.delete("signature");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const received = Buffer.from(hash, "hex");
  const computed = Buffer.from(expected, "hex");
  if (
    received.length !== computed.length ||
    !timingSafeEqual(received, computed)
  ) {
    return { ok: false, reason: "init data signature does not match" };
  }

  const authDateSeconds = Number(params.get("auth_date"));
  if (!Number.isFinite(authDateSeconds) || authDateSeconds <= 0) {
    return { ok: false, reason: "init data has no auth_date" };
  }
  const ageSeconds = Date.now() / 1000 - authDateSeconds;
  if (ageSeconds > maxAgeSeconds) {
    return { ok: false, reason: "init data expired" };
  }

  // The user field is optional (a Mini App opened from an inline button in a
  // channel has none). The signature has already been checked at this point,
  // so a body that is not parseable JSON means Telegram sent something we do
  // not understand - carry on without a user rather than reject a real lead.
  let user: TelegramUser | null = null;
  const rawUser = params.get("user");
  if (rawUser) {
    try {
      const parsed = JSON.parse(rawUser) as TelegramUser;
      if (typeof parsed?.id === "number") user = parsed;
    } catch {
      // left null
    }
  }

  return { ok: true, user, authDate: new Date(authDateSeconds * 1000) };
}
