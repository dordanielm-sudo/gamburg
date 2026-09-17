import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { AddUserForm } from "./add-user-form";
import { BulkCreateHandlersForm } from "./bulk-create-handlers-form";
import { UsersTable } from "./users-table";
import type { Profile } from "@/types/database";

export default async function UsersPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager") redirect("/cases");

  const supabase = await createClient();
  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, auto_created, created_at")
    .order("full_name")
    .returns<Profile[]>();

  // Email is not a column on profiles - it lives in auth.users and only the
  // Admin API can read it. One listUsers call rather than one lookup per
  // row; the office has tens of accounts, not thousands, and perPage is set
  // well above that so nobody falls off the end of the first page.
  //
  // Safe here and only here: this is a server component that has already
  // turned away anyone who is not a manager, and the map it builds is the
  // only thing that reaches the browser.
  const admin = createAdminClient();
  const { data: authUsers } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const emails: Record<string, string | null> = {};
  for (const u of authUsers?.users ?? []) emails[u.id] = u.email ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        userId={profile.id}
        title="ניהול משתמשים"
      />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        {error ? (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            שגיאה בטעינת המשתמשים: {error.message}
          </p>
        ) : (
          <>
            <AddUserForm />
            <BulkCreateHandlersForm />
            <h2 className="font-semibold text-gray-900">משתמשים</h2>
            <UsersTable users={users ?? []} emails={emails} />
          </>
        )}
      </main>
    </div>
  );
}
