import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { ApprovalBoard } from "./approval-board";
import type { ApprovalRequestWithNames, Case } from "@/types/database";

const APPROVAL_SELECT =
  "*, submitted_by_profile:profiles!approval_requests_submitted_by_fkey(id, full_name), reviewed_by_profile:profiles!approval_requests_reviewed_by_fkey(id, full_name), approved_by_profile:profiles!approval_requests_approved_by_fkey(id, full_name), case:cases!approval_requests_case_id_fkey(id, case_number, case_name)";

export default async function ApprovalsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  const { data: requests, error } = await supabase
    .from("approval_requests")
    .select(APPROVAL_SELECT)
    .order("created_at", { ascending: false })
    .returns<ApprovalRequestWithNames[]>();

  const canCreate = profile.role !== "secretary";
  let cases: Pick<Case, "id" | "case_number" | "case_name">[] = [];
  if (canCreate) {
    const casesQuery = supabase
      .from("cases")
      .select("id, case_number, case_name")
      .order("case_number");
    const { data: casesData } =
      profile.role === "manager"
        ? await casesQuery
        : await casesQuery.eq("handler_id", profile.id);
    cases = casesData ?? [];
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        userId={profile.id}
        title="בקרה ואישורים"
      />
      <main className="flex-1 p-6">
        {error ? (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            שגיאה בטעינת הבקשות: {error.message}
          </p>
        ) : (
          <ApprovalBoard
            requests={requests ?? []}
            canCreate={canCreate}
            isManager={profile.role === "manager"}
            cases={cases}
            currentUserId={profile.id}
            currentUserFullName={profile.full_name}
          />
        )}
      </main>
    </div>
  );
}
