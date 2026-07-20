import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { CasesTable } from "./cases-table";
import type { CaseWithHandler } from "@/types/database";

export default async function CasesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: cases, error } = await supabase
    .from("cases")
    .select("*, handler:profiles!cases_handler_id_fkey(id, full_name)")
    .order("last_touched_at", { ascending: false })
    .returns<CaseWithHandler[]>();

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        title="ניהול תיקים פתוחים"
        userId={profile.id}
      />
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
