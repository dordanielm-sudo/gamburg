import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { CasesTable } from "./cases-table";
import type {
  CaseTypeColumnPreset,
  CaseWithRelations,
  ProfileColumnOrder,
} from "@/types/database";

export default async function CasesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const [{ data: cases, error }, { data: columnPresets }, { data: columnOrder }] =
    await Promise.all([
      supabase
        .from("cases")
        .select(
          "*, handler:profiles!cases_handler_id_fkey(id, full_name), case_deadlines(id, due_date, status), tasks(id, due_date, status), case_fields(page_name, field_name, value_text, value_date, value_number)",
        )
        .order("last_touched_at", { ascending: false })
        .returns<CaseWithRelations[]>(),
      supabase
        .from("case_type_column_presets")
        .select("*")
        .order("case_type")
        .order("display_order")
        .returns<CaseTypeColumnPreset[]>(),
      supabase
        .from("profile_column_orders")
        .select("*")
        .eq("profile_id", profile.id)
        .eq("table_key", "cases")
        .maybeSingle<ProfileColumnOrder>(),
    ]);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
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
            columnPresets={columnPresets ?? []}
            isManager={profile.role === "manager"}
            currentUserId={profile.id}
            initialColumnOrder={columnOrder?.column_order ?? null}
          />
        )}
      </main>
    </div>
  );
}
