import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { CaseColumnsPanel } from "./case-columns-panel";
import type { CaseTypeColumnPreset } from "@/types/database";

export default async function CaseColumnsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager") redirect("/cases");

  const supabase = await createClient();
  const [
    { data: presets, error },
    { data: caseTypeRows },
    { data: fieldRows },
  ] = await Promise.all([
    supabase
      .from("case_type_column_presets")
      .select("*")
      .order("case_type")
      .order("display_order")
      .returns<CaseTypeColumnPreset[]>(),
    supabase.from("cases").select("case_type"),
    supabase.from("case_fields").select("page_name, field_name"),
  ]);

  const caseTypeOptions = Array.from(
    new Set(
      (caseTypeRows ?? [])
        .map((r) => r.case_type)
        .filter((v): v is string => !!v),
    ),
  ).sort((a, b) => a.localeCompare(b, "he"));

  const fieldOptions = Array.from(
    new Map(
      (fieldRows ?? []).map((r) => [
        `${r.page_name}::${r.field_name}`,
        { page_name: r.page_name, field_name: r.field_name },
      ]),
    ).values(),
  );

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        userId={profile.id}
        title="ניהול עמודות לפי סוג תיק"
      />
      <main className="flex-1 p-6">
        {error ? (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            שגיאה בטעינה: {error.message}
          </p>
        ) : (
          <CaseColumnsPanel
            presets={presets ?? []}
            caseTypeOptions={caseTypeOptions}
            fieldOptions={fieldOptions}
          />
        )}
      </main>
    </div>
  );
}
