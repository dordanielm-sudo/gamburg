import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/app-header";
import { CasesTable } from "./cases-table";
import type { CaseWithHandler, Profile } from "@/types/database";

export default async function CasesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, created_at")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile) {
    // signed in but no matching profile row (e.g. deactivated) - nothing to show
    redirect("/login");
  }

  const { data: cases, error } = await supabase
    .from("cases")
    .select("*, handler:profiles!cases_handler_id_fkey(id, full_name)")
    .order("last_touched_at", { ascending: false })
    .returns<CaseWithHandler[]>();

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader fullName={profile.full_name} role={profile.role} />
      <main className="flex-1 p-6">
        {error ? (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            שגיאה בטעינת התיקים: {error.message}
          </p>
        ) : (
          <CasesTable
            cases={cases ?? []}
            canEdit={profile.role !== "secretary"}
          />
        )}
      </main>
    </div>
  );
}
