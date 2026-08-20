import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 renamed Middleware to Proxy - same mechanism, this file must
// live at the project root and be named proxy.ts.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // /lead is excluded because it is the only public page besides /login:
  // the Telegram Mini App lead form is filled in by prospective clients who
  // have no CRM account, so redirecting them to /login would show them a
  // sign-in box instead of the form.
  //
  // /api/* is excluded on purpose: those routes are not browser pages to
  // redirect away from, they're called by client-side fetch() (case-updates,
  // expecting JSON) or by Make itself with no user session at all
  // (incoming-document, authenticated via a shared secret instead). Each
  // one enforces its own auth and returns a proper status code.
  matcher: [
    "/((?!api|lead|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
