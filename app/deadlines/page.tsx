import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { DeadlinesBoard } from "./deadlines-board";
import type { CaseDeadlineWithCase, Case } from "@/types/database";

const DEADLINE_SELECT =
  "*, case:cases!case_deadlines_case_id_fkey(id, case_number, case_name, handler:profiles!cases_handler_id_fkey(id, full_name))";

export default async function DeadlinesPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  const { data: deadlines, error } = await supabase
    .from("case_deadlines")
    .select(DEADLINE_SELECT)
    .order("due_date", { ascending: true })
    .returns<CaseDeadlineWithCase[]>();

  // handlers can only add deadlines to cases they handle; manager to any case
  let cases: Pick<Case, "id" | "case_number" | "case_name">[] = [];
  if (profile.role !== "secretary") {
    const query = supabase
      .from("cases")
      .select("id, case_number, case_name")
      .order("case_number");
    const { data: casesData } =
      profile.role === "handler"
        ? await query.eq("handler_id", profile.id)
        : await query;
    cases = casesData ?? [];
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
          />
        )}
      </main>
    </div>
  );
}
