import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { DeadlinesBoard } from "./deadlines-board";
import {
  NON_EMPTY_CASE_FIELD,
  fetchCaseFieldKeys,
} from "@/lib/case-field-catalog";
import type { CaseDeadlineWithCase, Case, ViewTemplate } from "@/types/database";

// the case is joined with everything the shared filter field set reads, so
// the board can filter on case status/stage/חוצצים and not just its own columns
const DEADLINE_SELECT =
  "*, case:cases!case_deadlines_case_id_fkey(" +
  "id, case_number, case_name, status, case_type, case_nature, case_stage, team, " +
  "handler:profiles!cases_handler_id_fkey(id, full_name), " +
  "case_fields(page_name, field_name, value_text, value_date, value_number))";

export default async function DeadlinesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  // PostgREST caps a single select at 1000 rows - page through in batches
  // (id as tiebreaker for stable order between batches), same as the
  // cases/tasks screens
  const BATCH = 1000;
  let deadlines: CaseDeadlineWithCase[] = [];
  let error: { message: string } | null = null;
  for (let from = 0; ; from += BATCH) {
    const { data, error: batchError } = await supabase
      .from("case_deadlines")
      .select(DEADLINE_SELECT)
      // Only חוצץ fields holding a value. It matters most here: the case is
      // embedded per deadline, so a case with ten deadlines used to carry its
      // whole field set ten times over.
      .or(NON_EMPTY_CASE_FIELD, { referencedTable: "case.case_fields" })
      .order("due_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + BATCH - 1)
      .returns<CaseDeadlineWithCase[]>();
    if (batchError) {
      error = batchError;
      break;
    }
    if (!data || data.length === 0) break;
    deadlines = deadlines.concat(data);
    if (data.length < BATCH) break;
  }

  const [{ data: viewTemplates }, caseFieldKeys] = await Promise.all([
    supabase
      .from("view_templates")
      .select("*")
      .eq("screen", "deadlines")
      .order("display_order")
      .returns<ViewTemplate[]>(),
    fetchCaseFieldKeys(supabase),
  ]);

  // handlers can only add deadlines to cases they handle; manager to any case
  let cases: Pick<Case, "id" | "case_number" | "case_name">[] = [];
  if (profile.role !== "secretary") {
    for (let from = 0; ; from += BATCH) {
      const query = supabase
        .from("cases")
        .select("id, case_number, case_name")
        .order("case_number")
        .order("id", { ascending: true })
        .range(from, from + BATCH - 1);
      const { data } =
        profile.role === "handler"
          ? await query.eq("handler_id", profile.id)
          : await query;
      if (!data || data.length === 0) break;
      cases = cases.concat(data);
      if (data.length < BATCH) break;
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        userId={profile.id}
        title="מועדים"
      />
      <main className="flex-1 p-6">
        {error ? (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            שגיאה בטעינת המועדים: {error.message}
          </p>
        ) : (
          <DeadlinesBoard
            deadlines={deadlines ?? []}
            canCreate={profile.role !== "secretary"}
            cases={cases}
            viewTemplates={viewTemplates ?? []}
            isManager={profile.role === "manager"}
            currentUserId={profile.id}
            caseFieldKeys={caseFieldKeys}
          />
        )}
      </main>
    </div>
  );
}
