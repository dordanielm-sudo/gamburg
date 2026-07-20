import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, created_at")
    .eq("id", user.id)
    .single<Profile>();

  return profile ?? null;
}
