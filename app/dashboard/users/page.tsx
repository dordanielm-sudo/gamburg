import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { AddUserForm } from "./add-user-form";
import { UsersTable } from "./users-table";
import type { Profile } from "@/types/database";

export default async function UsersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager") redirect("/cases");

  const supabase = await createClient();
  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, created_at")
    .order("full_name")
    .returns<Profile[]>();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        userId={profile.id}
        title="ניהול משתמשים"
      />
      <main className="flex-1 space-y-6 p-6">
        {error ? (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            שגיאה בטעינת המשתמשים: {error.message}
          </p>
        ) : (
          <>
            <AddUserForm />
            <UsersTable users={users ?? []} />
          </>
        )}
      </main>
    </div>
  );
}
