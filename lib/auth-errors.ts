import type { AuthError } from "@supabase/supabase-js";

// Supabase Auth reports its failures in English, and the two a manager
// actually hits - an address already belonging to someone else, and an
// address that is not one - deserve to say so plainly rather than arrive as
// "שגיאה בשמירה".
//
// Matched on `code` first, which is stable, and on the message only as a
// fallback for older replies that carry no code. Anything unrecognised
// returns the original text rather than a generic sentence: an English
// message a manager can read out to whoever maintains this is worth more
// than a Hebrew one that says nothing.
export function authErrorMessage(error: AuthError): string {
  const code = error.code ?? "";
  const message = error.message ?? "";

  if (
    code === "email_exists" ||
    code === "user_already_exists" ||
    /already.*(registered|exists)/i.test(message)
  ) {
    return "האימייל הזה כבר משויך למשתמש אחר במערכת";
  }

  if (
    code === "email_address_invalid" ||
    code === "validation_failed" ||
    /invalid format|unable to validate email/i.test(message)
  ) {
    return "כתובת האימייל אינה תקינה";
  }

  if (code === "weak_password" || /password/i.test(message)) {
    return "הסיסמה אינה עומדת בדרישות";
  }

  return message || "שגיאה בשמירה";
}

// Deliberately permissive - something@something.tld and no spaces. The point
// is to catch a typo before a round-trip to the server, not to decide what a
// valid address is; Supabase does that, and anything stricter here would
// reject addresses that genuinely work.
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
