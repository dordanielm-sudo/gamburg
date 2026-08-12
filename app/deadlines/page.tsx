import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { DeadlinesBoard } from "./deadlines-board";
import { fetchCaseFieldKeys } from "@/lib/case-field-catalog";
import {
  attachCaseFields,
  fetchCaseFieldsByCase,
} from "@/lib/attach-case-fields";
import type { CaseDeadlineWithCase, Case, ViewTemplate } from "@/types/database";

// The case is joined with everything the shared filter field set reads, so
// the board can filter on case status/stage and not just its own columns.
//
// case_fields are deliberately NOT embedded here. The case repeats once per
// deadline, so embedding them made a case with eight deadlines carry its whole
// field set eight times - measured at 408 kB and eleven seconds of server time
// for this screen. They are fetched once and attached below.
const DEADLINE_SELECT =
  "*, case:cases!case_deadlines_case_id_fkey(" +
  "id, case_number, case_name, status, case_type, case_nature, case_stage, team, " +
  "handler:profiles!cases_handler_id_fkey(id, full_name))";

export default async function DeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; done?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  // The board hides completed deadlines unless asked, but the server used to
  // send every one ever closed - years of them - for the browser to throw
  // away. They now come only when the checkbox asks for them, which is what
  // this parameter is: the toggle has to reach the server, so it lives in the
  // URL rather than in component state.
  const { done } = await searchParams;
  const includeDone = done === "1";

  // PostgREST caps a single select at 1000 rows - page through in batches
  // (id as tiebreaker for stable order between batches), same as the
  // cases/tasks screens
  const BATCH = 1000;
  let deadlines: CaseDeadlineWithCase[] = [];
  let error: { message: string } | null = null;
  for (let from = 0; ; from += BATCH) {
    const base = supabase.from("case_deadlines").select(DEADLINE_SELECT);
    const { data, error: batchError } = await (includeDone
      ? base
      : base.eq("status", "open")
    )
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

  const [{ data: viewTemplates }, caseFieldKeys, caseFieldsByCase] = await Promise.all([
    supabase
      .from("view_templates")
      .select("*")
      .eq("screen", "deadlines")
      .order("display_order")
      .returns<ViewTemplate[]>(),
    fetchCaseFieldKeys(supabase),
    fetchCaseFieldsByCase(supabase),
  ]);

  attachCaseFields(deadlines, caseFieldsByCase);

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
            includeDone={includeDone}
          />
        )}
      </main>
    </div>
  );
}
