import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Called from the root proxy.ts on every request. Refreshes the Supabase
// session cookie and redirects unauthenticated users to /login (this is an
// optimistic check only - RLS is what actually protects the data).
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname.startsWith("/login");

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectKeepingCookies(url, supabaseResponse);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/cases";
    return redirectKeepingCookies(url, supabaseResponse);
  }

  return supabaseResponse;
}

// A redirect is a new response, and a new response carries none of the
// cookies getUser() just set on supabaseResponse. That matters most when the
// session has died: Supabase answers refresh_token_not_found and clears the
// auth cookies - on the response that was then thrown away. The browser kept
// the dead token, sent it on every request, and the server logs filled with
// the same refresh failure over and over.
function redirectKeepingCookies(url: URL, from: NextResponse) {
  const response = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) {
    response.cookies.set(cookie);
  }
  return response;
}
