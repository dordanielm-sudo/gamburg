import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// A handler_name from עדכנית frequently names someone with no profile yet -
// confirmed against live sync warnings (11+ distinct names in one pass).
// Used by both case-sync and task-sync so a case or task is never left
// pointing at nobody just because the office hasn't gotten around to
// opening that person's account.
//
// A handful of short names collide with a profile that already exists under
// its full name - חנה גמבורג is sometimes just "חנה" in עדכנית - and those
// are listed explicitly rather than guessed by matching a name prefix, which
// would risk routing a case to the wrong person the day two staff share a
// first name.
const HANDLER_NAME_ALIASES: Record<string, string> = {
  חנה: "חנה גמבורג",
};

export interface HandlerResolution {
  id: string | null;
  // true only when this call is the one that created the profile - lets a
  // caller log it distinctly from an ordinary match, without treating it as
  // a problem the way "no profile matches" warnings are.
  created: boolean;
  error?: string;
}

async function findProfileIdByFullName(
  admin: SupabaseClient,
  fullName: string,
): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("full_name", fullName)
    .maybeSingle();
  return data?.id ?? null;
}

// Resolves a handler_name to a profile, creating one if none exists yet.
//
// The new profile has no working login - see migration 0047 for why that is
// unavoidable (profiles.id is a hard FK into auth.users, and the Admin API
// requires an email the sync does not have). It is otherwise a completely
// normal profile from the moment it is created: handler_id already points
// at it, so nothing needs re-running once a manager gives it a real email on
// the users screen.
export async function resolveOrCreateHandler(
  admin: SupabaseClient,
  rawName: string,
): Promise<HandlerResolution> {
  const handlerName = rawName.trim();
  if (!handlerName) return { id: null, created: false };

  // "מנהל" in עדכנית is a generic placeholder for cases/tasks חנה handles
  // directly rather than a specific handler name - routed to whoever holds
  // the manager role today, not a name match.
  if (handlerName === "מנהל") {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "manager")
      .maybeSingle();
    return { id: data?.id ?? null, created: false };
  }

  const canonicalName = HANDLER_NAME_ALIASES[handlerName] ?? handlerName;
  const existing = await findProfileIdByFullName(admin, canonicalName);
  if (existing) return { id: existing, created: false };

  const { data, error } = await admin.auth.admin.createUser({
    email: `auto-${crypto.randomUUID()}@no-login.invalid`,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: {
      full_name: canonicalName,
      role: "handler",
      auto_created: true,
    },
  });
  if (error || !data.user) {
    return {
      id: null,
      created: false,
      error: error?.message ?? "יצירת המשתמש נכשלה",
    };
  }
  return { id: data.user.id, created: true };
}
