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
import { pageTimer, timed } from "@/lib/server-timing";
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

// PostgREST caps a single select at 1000 rows - page through in batches
// (id as tiebreaker for stable order between batches), same as the
// cases/tasks screens
const BATCH = 1000;

async function fetchDeadlines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  includeDone: boolean,
) {
  const rows: CaseDeadlineWithCase[] = [];
  for (let from = 0; ; from += BATCH) {
    const base = supabase.from("case_deadlines").select(DEADLINE_SELECT);
    const { data, error } = await timed(
      `deadlines rows[${from}]`,
      (includeDone ? base : base.eq("status", "open"))
        .order("due_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + BATCH - 1)
        .returns<CaseDeadlineWithCase[]>(),
    );
    if (error) return { rows, error };
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < BATCH) break;
  }
  return { rows, error: null as { message: string } | null };
}

// handlers can only add deadlines to cases they handle; manager to any case
async function fetchCaseList(
  supabase: Awaited<ReturnType<typeof createClient>>,
  role: string,
  profileId: string,
) {
  if (role === "secretary") return [];
  const cases: Pick<Case, "id" | "case_number" | "case_name">[] = [];
  for (let from = 0; ; from += BATCH) {
    const query = supabase
      .from("cases")
      .select("id, case_number, case_name")
      .order("case_number")
      .order("id", { ascending: true })
      .range(from, from + BATCH - 1);
    const { data } = await timed(
      `deadlines case list[${from}]`,
      role === "handler" ? query.eq("handler_id", profileId) : query,
    );
    if (!data || data.length === 0) break;
    cases.push(...data);
    if (data.length < BATCH) break;
  }
  return cases;
}

export default async function DeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; done?: string }>;
}) {
  const donePage = pageTimer("deadlines");
  const supabase = await createClient();
  // The board hides completed deadlines unless asked, but the server used to
  // send every one ever closed - years of them - for the browser to throw
  // away. They now come only when the checkbox asks for them, which is what
  // this parameter is: the toggle has to reach the server, so it lives in the
  // URL rather than in component state.
  const { done } = await searchParams;
  const includeDone = done === "1";

  // Everything that does not need to know who the user is starts now, rather
  // than after the profile lookup resolves. Measured on this screen, the four
  // stages ran strictly one after another - profile 1417ms, then the deadline
  // rows 2517ms, then the parallel group 2300ms, then the case list 1234ms -
  // and 1417+2517+2300+1234 is exactly the 7485ms the page took. Overlapping
  // them leaves the slowest one as the cost instead of their sum.
  //
  // Starting before the profile resolves is not a security shortcut: every one
  // of these queries is filtered by RLS against the caller's own session, so a
  // signed-out request gets nothing back and is redirected below regardless.
  const deadlinesPromise = fetchDeadlines(supabase, includeDone);
  const templatesPromise = timed(
    "deadlines templates",
    supabase
      .from("view_templates")
      .select("*")
      .eq("screen", "deadlines")
      .order("display_order")
      .returns<ViewTemplate[]>(),
  );
  const catalogPromise = timed("deadlines field catalog", fetchCaseFieldKeys(supabase));
  const fieldsPromise = timed("deadlines case fields", fetchCaseFieldsByCase(supabase));

  const profile = await timed("deadlines profile", getCurrentProfile());
  if (!profile) redirect("/login");

  // the only query that needs the profile first, because what it returns
  // depends on the role
  const casesPromise = fetchCaseList(supabase, profile.role, profile.id);

  const [{ rows: deadlines, error }, { data: viewTemplates }, caseFieldKeys, caseFieldsByCase, cases] =
    await Promise.all([
      deadlinesPromise,
      templatesPromise,
      catalogPromise,
      fieldsPromise,
      casesPromise,
    ]);

  attachCaseFields(deadlines, caseFieldsByCase);

  donePage();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        userId={profile.id}
        title="מועדים"
      />
      <main className="flex-1 p-4 sm:p-6">
        {error ? (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            שגיאה בטעינת המועדים: {error.message}
          </p>
        ) : (
          <DeadlinesBoard
            deadlines={deadlines}
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
