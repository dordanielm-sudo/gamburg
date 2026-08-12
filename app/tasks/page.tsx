import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { TaskBoard } from "./task-board";
import type { TaskWithNames, Profile, Case } from "@/types/database";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ overdue?: string; status?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  // The board opens on "פתוחות", but the server used to send every task ever
  // closed for the browser to filter out - and the עדכנית sync fills this
  // table by the thousands. Completed tasks now come only when the status
  // control asks for them, which is why that control writes to the URL.
  const { status } = await searchParams;
  const includeDone = !!status && status !== "open";

  // PostgREST caps a single select at 1000 rows - with the עדכנית task sync
  // filling the table by the thousands, everything past the newest 1000
  // silently vanished from the board. Page through in batches (id as a
  // tiebreaker so equal created_at values don't reshuffle between batches).
  const BATCH = 1000;
  let tasks: TaskWithNames[] = [];
  let error: { message: string } | null = null;
  for (let from = 0; ; from += BATCH) {
    const base = supabase
      .from("tasks")
      .select(
        "*, assigned_to_profile:profiles!tasks_assigned_to_fkey(id, full_name), created_by_profile:profiles!tasks_created_by_fkey(id, full_name), case:cases!tasks_case_id_fkey(id, case_number, case_name)",
      );
    const { data, error: batchError } = await (includeDone
      ? base
      : base.eq("status", "open")
    )
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + BATCH - 1)
      .returns<TaskWithNames[]>();
    if (batchError) {
      error = batchError;
      break;
    }
    if (!data || data.length === 0) break;
    tasks = tasks.concat(data);
    if (data.length < BATCH) break;
  }

  // only the manager creates tasks, so only the manager needs these lists
  let assignees: Pick<Profile, "id" | "full_name">[] = [];
  let cases: Pick<Case, "id" | "case_number" | "case_name">[] = [];
  if (profile.role === "manager") {
    const { data: profilesData } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_active", true)
      .order("full_name");
    assignees = profilesData ?? [];
    // same 1000-row cap here: the case picker was missing every case past
    // the first 1000 by case_number
    for (let from = 0; ; from += BATCH) {
      const { data } = await supabase
        .from("cases")
        .select("id, case_number, case_name")
        .order("case_number")
        .order("id", { ascending: true })
        .range(from, from + BATCH - 1);
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
        title="משימות"
      />
      <main className="flex-1 p-6">
        {error ? (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            שגיאה בטעינת המשימות: {error.message}
          </p>
        ) : (
          <TaskBoard
            tasks={tasks ?? []}
            canCreate={profile.role === "manager"}
            assignees={assignees}
            cases={cases}
            currentUserId={profile.id}
          />
        )}
      </main>
    </div>
  );
}
