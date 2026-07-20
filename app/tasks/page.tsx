import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { TaskBoard } from "./task-board";
import type { TaskWithNames, Profile, Case } from "@/types/database";

export default async function TasksPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select(
      "*, assigned_to_profile:profiles!tasks_assigned_to_fkey(id, full_name), created_by_profile:profiles!tasks_created_by_fkey(id, full_name), case:cases!tasks_case_id_fkey(id, case_number, case_name)",
    )
    .order("created_at", { ascending: false })
    .returns<TaskWithNames[]>();

  // only the manager creates tasks, so only the manager needs these lists
  let assignees: Pick<Profile, "id" | "full_name">[] = [];
  let cases: Pick<Case, "id" | "case_number" | "case_name">[] = [];
  if (profile.role === "manager") {
    const [{ data: profilesData }, { data: casesData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name"),
      supabase
        .from("cases")
        .select("id, case_number, case_name")
        .order("case_number"),
    ]);
    assignees = profilesData ?? [];
    cases = casesData ?? [];
  }

  return (
    <div className="flex min-h-screen flex-col">
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
