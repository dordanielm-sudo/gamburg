import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { TaskDetail } from "./task-detail";
import { collectPriorityOptions } from "@/lib/task-priority";
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

  const { data: task, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", id)
    .maybeSingle<TaskWithNames>();

  // A failed query and a missing row both arrive here as a null `task`, and
  // treating them alike turned every fault on this page - a bad join, a
  // dropped connection, an RLS change - into a bare "not found" with nothing
  // to go on. Let the error surface instead: Next renders the error page and
  // logs it, which is the difference between "this task does not exist" and
  // "something is broken".
  if (error) {
    throw new Error(`טעינת המשימה נכשלה: ${error.message}`);
  }

  // A genuinely absent row, or one this user may not see: tasks_select_own
  // (0002) scopes a task to its assignee and its creator, so a task that was
  // reassigned in עדכנית stops being visible to whoever it belonged to
  // before - including from an older notification still linking to it.
  //
  // Logged because the two are indistinguishable from the browser - both are
  // a bare 404 - and the row id alone is not enough to tell them apart after
  // the fact. Knowing which user asked, and under which role, turns a support
  // question into a one-line answer.
  if (!task) {
    // Two things can produce an empty result for a row that demonstrably
    // exists and that RLS allows: the id we filter on is not the string it
    // appears to be (an invisible character survives the URL and prints
    // identically), or one of the embedded relations in TASK_SELECT drops
    // the row. The probe below settles which, by asking for the same row
    // with no embeds at all - and the id is logged encoded, so a stray
    // character shows up instead of hiding.
    const { data: probe, error: probeError } = await supabase
      .from("tasks")
      .select("id")
      .eq("id", id)
      .maybeSingle<{ id: string }>();

    console.warn(
      `[task-detail] 404 taskId=${JSON.stringify(id)} len=${id.length} ` +
        `profileId=${profile.id} role=${profile.role} ` +
        `plainSelectFound=${probe ? "yes" : "no"} ` +
        `probeError=${probeError?.message ?? "none"}`,
    );
    notFound();
  }

  // The priority picker offers the codes עדכנית actually uses. There is no
  // enum on the source side, so the set is read from existing rows rather
  // than hardcoded - a distinct-ish sample is enough, since every code in use
  // appears on plenty of tasks.
  const { data: prioritySample } = await supabase
    .from("tasks")
    .select("priority_code, priority_name")
    .not("priority_code", "is", null)
    .limit(500);
  const priorityOptions = collectPriorityOptions(
    (prioritySample ?? []) as TaskWithNames[],
  );

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

        <TaskDetail
          task={task}
          canEdit={canEdit}
          priorityOptions={priorityOptions}
        />
      </main>
    </div>
  );
}
