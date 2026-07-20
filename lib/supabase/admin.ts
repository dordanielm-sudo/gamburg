import "server-only";
import { createClient } from "@supabase/supabase-js";

// service_role key - bypasses RLS entirely. Only ever call this from Server
// Actions/Route Handlers that have already verified the caller is a manager.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
