import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { TabPermissionsPanel } from "./tab-permissions-panel";
import type { Profile, ProfileTabPermission } from "@/types/database";

export default async function UserTabPermissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager") redirect("/cases");

  const supabase = await createClient();
  const [{ data: targetUser }, { data: permissions }, { data: fieldRows }] =
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

  if (!targetUser) notFound();

  const pageNameOptions = Array.from(
    new Set((fieldRows ?? []).map((r) => r.page_name)),
  ).sort((a, b) => a.localeCompare(b, "he"));

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        userId={profile.id}
        title={`הרשאות חוצצים - ${targetUser.full_name}`}
      />
      <main className="flex-1 p-6">
        <Link
          href="/dashboard/users"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          ← חזרה לניהול משתמשים
        </Link>
        <TabPermissionsPanel
          profileId={targetUser.id}
          permissions={permissions ?? []}
          pageNameOptions={pageNameOptions}
        />
      </main>
    </div>
  );
}
