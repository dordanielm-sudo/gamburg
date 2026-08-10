import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { UserEditForm } from "./user-edit-form";
import { ResetPasswordPanel } from "./reset-password-panel";
import { TabPermissionsPanel } from "./tab-permissions-panel";
import { NamedAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { Profile, ProfileTabPermission, UserRole } from "@/types/database";

const ROLE_LABELS: Record<UserRole, string> = {
  manager: "מנהל/ת",
  handler: "מטפל/ת",
  secretary: "מזכירה",
};

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager") redirect("/cases");

  const supabase = await createClient();
  const [
    { data: targetUser, error: userError },
    { data: permissions },
    { data: fieldRows },
  ] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, role, is_active, created_at")
        .eq("id", id)
        .maybeSingle<Profile>(),
      supabase
        .from("profile_tab_permissions")
        .select("*")
        .eq("profile_id", id)
        .order("page_name")
        .returns<ProfileTabPermission[]>(),
      supabase.from("case_fields").select("page_name"),
    ]);

  // see the note in app/tasks/[id]/page.tsx - an error and a missing row both
  // land here as null, and collapsing them hides real faults behind a 404
  if (userError) {
    throw new Error(`טעינת המשתמש נכשלה: ${userError.message}`);
  }

  if (!targetUser) notFound();

  // email lives only in auth.users, not in profiles - Admin API lookup
  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(id);
  const email = authUser?.user?.email ?? "";

  const pageNameOptions = Array.from(
    new Set((fieldRows ?? []).map((r) => r.page_name)),
  ).sort((a, b) => a.localeCompare(b, "he"));

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        userId={profile.id}
        title={`כרטיס משתמש - ${targetUser.full_name}`}
      />
      <main className="flex-1 space-y-6 p-6">
        <Link
          href="/dashboard/users"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          ← חזרה לניהול משתמשים
        </Link>

        <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <NamedAvatar name={targetUser.full_name} size="h-12 w-12 text-base" />
          <div>
            <div className="text-lg font-semibold text-gray-900">
              {targetUser.full_name}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <Badge tone="indigo">{ROLE_LABELS[targetUser.role]}</Badge>
              <Badge tone={targetUser.is_active ? "green" : "gray"}>
                {targetUser.is_active ? "פעיל" : "מושבת"}
              </Badge>
            </div>
          </div>
        </div>

        <UserEditForm user={targetUser} email={email} />
        <ResetPasswordPanel userId={targetUser.id} userFullName={targetUser.full_name} />
        {targetUser.role !== "manager" && (
          <TabPermissionsPanel
            profileId={targetUser.id}
            permissions={permissions ?? []}
            pageNameOptions={pageNameOptions}
          />
        )}
      </main>
    </div>
  );
}
