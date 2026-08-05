import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { CasesTable } from "./cases-table";
import type {
  CaseTypeColumnPreset,
  CaseWithRelations,
  ProfileColumnOrder,
  ViewTemplate,
} from "@/types/database";

const CASES_SELECT =
  "*, handler:profiles!cases_handler_id_fkey(id, full_name), case_deadlines(id, due_date, status), tasks(id, due_date, status), case_fields(page_name, field_name, value_text, value_date, value_number)";

// PostgREST caps any single select() at db.max_rows (1000 here) regardless
// of how large a .range() is requested - past that count the list was
// silently truncated. Loop in batches (ordered by last_touched_at with id
// as a tiebreaker, so ties don't reshuffle between batches and cause
// skipped/duplicated rows) until a batch comes back short of a full page.
async function fetchAllCases(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const BATCH_SIZE = 1000;
  const all: CaseWithRelations[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("cases")
      .select(CASES_SELECT)
      .order("last_touched_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + BATCH_SIZE - 1)
      .returns<CaseWithRelations[]>();
    if (error) return { data: null, error };
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }
  return { data: all, error: null };
}

export default async function CasesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const [
    { data: cases, error },
    { data: columnPresets },
    { data: columnOrder },
    { data: viewTemplates },
  ] = await Promise.all([
      fetchAllCases(supabase),
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
      supabase
        .from("view_templates")
        .select("*")
        .eq("screen", "cases")
        .order("display_order")
        .returns<ViewTemplate[]>(),
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
            viewTemplates={viewTemplates ?? []}
          />
        )}
      </main>
    </div>
  );
}
