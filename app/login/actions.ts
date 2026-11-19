"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Every failed sign-in used to read "אימייל או סיסמה שגויים", whatever the
// cause, and nothing was logged. A deactivated account, a rate limit and
// Supabase not answering all looked exactly like a mistyped password - to
// the person at the door and to whoever was reading the server logs trying
// to work out why they could not get in.
//
// Wrong email and wrong password still share one message on purpose: telling
// them apart would let anyone probe which addresses have accounts.
function signInErrorMessage(error: { code?: string; status?: number; message: string }) {
  switch (error.code) {
    case "invalid_credentials":
      return "אימייל או סיסמה שגויים";
    case "user_banned":
      return "המשתמש הושבת. יש לפנות למנהל המערכת";
    case "email_not_confirmed":
      return "כתובת האימייל של המשתמש לא אומתה. יש לפנות למנהל המערכת";
    case "over_request_rate_limit":
      return "יותר מדי נסיונות כניסה. יש לנסות שוב בעוד כמה דקות";
  }
  if (error.status === 429) {
    return "יותר מדי נסיונות כניסה. יש לנסות שוב בעוד כמה דקות";
  }
  return "שגיאה בהתחברות לשרת ההזדהות. יש לנסות שוב, ואם זה חוזר לפנות למנהל המערכת";
}

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // The code and status only - never the password, and the address only
    // so a failed sign-in can be matched to the person who reported it.
    console.error("[login] sign-in failed", {
      email,
      code: error.code,
      status: error.status,
      message: error.message,
    });
    redirect(`/login?error=${encodeURIComponent(signInErrorMessage(error))}`);
  }

  redirect("/cases");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
