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

const ACCENTS = {
  blue: { bar: "bg-blue-600", text: "text-blue-700", ring: "ring-blue-100" },
  amber: { bar: "bg-amber-500", text: "text-amber-700", ring: "ring-amber-100" },
  rose: { bar: "bg-rose-500", text: "text-rose-700", ring: "ring-rose-100" },
  slate: { bar: "bg-slate-500", text: "text-slate-700", ring: "ring-slate-100" },
} as const;

function StatCard({
  label,
  value,
  percent,
  accent,
}: {
  label: string;
  value: number;
  percent?: number;
  accent: keyof typeof ACCENTS;
}) {
  const a = ACCENTS[accent];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <div className="text-3xl font-bold text-gray-900">{value}</div>
        {percent !== undefined && (
          <span className={`text-sm font-semibold ${a.text}`}>{percent}%</span>
        )}
      </div>
      <div className="mt-1 text-sm text-gray-500">{label}</div>
      {percent !== undefined && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full ${a.bar}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}
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
  const pct = (n: number) => (rows.length === 0 ? 0 : Math.round((n / rows.length) * 100));

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
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        userId={profile.id}
        title="דשבורד מנהלים"
      />
      <main className="flex-1 space-y-6 p-6">
        <div className="rounded-2xl bg-gradient-to-l from-slate-900 to-slate-800 px-6 py-8 text-white">
          <h1 className="text-2xl font-bold">
            שלום, {profile.full_name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-slate-300">
            תמונת מצב עדכנית של כל התיקים הפעילים במשרד.
          </p>
        </div>

        {error ? (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            שגיאה בטעינת הנתונים: {error.message}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="תיקים" value={rows.length} accent="blue" />
              <StatCard
                label="תיקים תקועים"
                value={stuckCount}
                percent={pct(stuckCount)}
                accent="amber"
              />
              <StatCard
                label="תיקים עם דגל"
                value={flaggedCount}
                percent={pct(flaggedCount)}
                accent="rose"
              />
              <StatCard label="מטפלים" value={byHandler.size} accent="slate" />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 font-semibold text-gray-900">
                  פירוט לפי מטפל
                </h2>
                <table className="w-full text-sm">
                  <thead className="text-right text-gray-500">
                    <tr>
                      <th className="py-1.5">מטפל</th>
                      <th className="py-1.5">תיקים</th>
                      <th className="py-1.5">תקועים</th>
                      <th className="py-1.5">דגלים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...byHandler.entries()].map(([name, s]) => (
                      <tr key={name} className="border-t border-gray-100">
                        <td className="py-2 font-medium text-gray-800">
                          {name}
                        </td>
                        <td className="py-2">{s.total}</td>
                        <td className="py-2">
                          {s.stuck > 0 ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                              {s.stuck}
                            </span>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </td>
                        <td className="py-2">
                          {s.flagged > 0 ? (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                              {s.flagged}
                            </span>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 font-semibold text-gray-900">
                  פירוט לפי סטטוס
                </h2>
                <table className="w-full text-sm">
                  <thead className="text-right text-gray-500">
                    <tr>
                      <th className="py-1.5">סטטוס</th>
                      <th className="py-1.5">תיקים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...byStatus.entries()].map(([status, count]) => (
                      <tr key={status} className="border-t border-gray-100">
                        <td className="py-2 font-medium text-gray-800">
                          {status}
                        </td>
                        <td className="py-2">{count}</td>
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
