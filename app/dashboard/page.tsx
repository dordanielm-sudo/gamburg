import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { isCaseStuck } from "@/types/database";

interface DashboardCaseRow {
  id: string;
  status: string | null;
  handler_id: string | null;
  last_touched_at: string;
  flag_problematic_client: boolean;
  flag_non_paying: boolean;
  flag_transferring_documents: boolean;
  handler: { full_name: string } | null;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager") redirect("/cases");

  const supabase = await createClient();
  const { data: cases, error } = await supabase
    .from("cases")
    .select(
      "id, status, handler_id, last_touched_at, flag_problematic_client, flag_non_paying, flag_transferring_documents, handler:profiles!cases_handler_id_fkey(full_name)",
    )
    .returns<DashboardCaseRow[]>();

  const rows = cases ?? [];
  const stuckCount = rows.filter((c) => isCaseStuck(c.last_touched_at)).length;
  const flaggedCount = rows.filter(
    (c) =>
      c.flag_problematic_client ||
      c.flag_non_paying ||
      c.flag_transferring_documents,
  ).length;

  const byStatus = new Map<string, number>();
  for (const c of rows) {
    const key = c.status ?? "ללא סטטוס";
    byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
  }

  const byHandler = new Map<
    string,
    { total: number; stuck: number; flagged: number }
  >();
  for (const c of rows) {
    const key = c.handler?.full_name ?? "לא משויך";
    const entry = byHandler.get(key) ?? { total: 0, stuck: 0, flagged: 0 };
    entry.total += 1;
    if (isCaseStuck(c.last_touched_at)) entry.stuck += 1;
    if (
      c.flag_problematic_client ||
      c.flag_non_paying ||
      c.flag_transferring_documents
    )
      entry.flagged += 1;
    byHandler.set(key, entry);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        userId={profile.id}
        title="דשבורד מנהלים"
      />
      <main className="flex-1 space-y-6 p-6">
        {error ? (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            שגיאה בטעינת הנתונים: {error.message}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="תיקים" value={rows.length} />
              <StatCard label="תיקים תקועים" value={stuckCount} />
              <StatCard label="תיקים עם דגל" value={flaggedCount} />
              <StatCard label="מטפלים" value={byHandler.size} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <h2 className="mb-3 font-semibold">פירוט לפי מטפל</h2>
                <table className="w-full text-sm">
                  <thead className="text-right text-gray-500">
                    <tr>
                      <th className="py-1">מטפל</th>
                      <th className="py-1">תיקים</th>
                      <th className="py-1">תקועים</th>
                      <th className="py-1">דגלים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...byHandler.entries()].map(([name, s]) => (
                      <tr key={name} className="border-t border-gray-100">
                        <td className="py-1.5">{name}</td>
                        <td className="py-1.5">{s.total}</td>
                        <td className="py-1.5">
                          {s.stuck > 0 ? (
                            <span className="text-amber-700">{s.stuck}</span>
                          ) : (
                            s.stuck
                          )}
                        </td>
                        <td className="py-1.5">{s.flagged}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <h2 className="mb-3 font-semibold">פירוט לפי סטטוס</h2>
                <table className="w-full text-sm">
                  <thead className="text-right text-gray-500">
                    <tr>
                      <th className="py-1">סטטוס</th>
                      <th className="py-1">תיקים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...byStatus.entries()].map(([status, count]) => (
                      <tr key={status} className="border-t border-gray-100">
                        <td className="py-1.5">{status}</td>
                        <td className="py-1.5">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
