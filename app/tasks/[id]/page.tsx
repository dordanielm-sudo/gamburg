import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { TaskDetail } from "./task-detail";
import type { TaskWithNames } from "@/types/database";

const TASK_SELECT =
  "*, assigned_to_profile:profiles!tasks_assigned_to_fkey(id, full_name), created_by_profile:profiles!tasks_created_by_fkey(id, full_name), case:cases!tasks_case_id_fkey(id, case_number, case_name)";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  const { data: task } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", id)
    .maybeSingle<TaskWithNames>();

  if (!task) notFound();

  const canEdit = profile.role === "manager" || task.assigned_to === profile.id;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        title="משימה"
        userId={profile.id}
      />
      <main className="flex-1 space-y-6 p-6">
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          ← חזרה למשימות
        </Link>

        <TaskDetail task={task} canEdit={canEdit} />
      </main>
    </div>
  );
}
