import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { CaseStagesPanel } from "./case-stages-panel";
import type { CaseTypeStage, CaseTypeStageItem } from "@/types/database";

export default async function CaseStagesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager") redirect("/cases");

  const supabase = await createClient();
  const [{ data: stages, error }, { data: caseTypeRows }, { data: items }] =
    await Promise.all([
      supabase
        .from("case_type_stages")
        .select("*")
        .order("case_type")
        .order("display_order")
        .returns<CaseTypeStage[]>(),
      supabase.from("cases").select("case_type"),
      supabase
        .from("case_type_stage_items")
        .select("*")
        .order("display_order")
        .returns<CaseTypeStageItem[]>(),
    ]);

  const caseTypeOptions = Array.from(
    new Set(
      (caseTypeRows ?? [])
        .map((r) => r.case_type)
        .filter((v): v is string => !!v),
    ),
  ).sort((a, b) => a.localeCompare(b, "he"));

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        userId={profile.id}
        title="ניהול שלבים לפי סוג תיק"
      />
      <main className="flex-1 p-6">
        {error ? (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            שגיאה בטעינה: {error.message}
          </p>
        ) : (
          <CaseStagesPanel
            stages={stages ?? []}
            items={items ?? []}
            caseTypeOptions={caseTypeOptions}
          />
        )}
      </main>
    </div>
  );
}
