import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { StatTile } from "@/components/ui/stat-tile";
import {
  CaseChartsPanel,
  DASHBOARD_LAYOUT_SCREEN,
  type ChartCaseRow,
} from "./case-charts-panel";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { isCaseStuck, type CaseField, type ViewTemplate } from "@/types/database";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import {
  NON_EMPTY_CASE_FIELD,
  fetchCaseFieldKeys,
} from "@/lib/case-field-catalog";

interface DashboardCaseRow {
  id: string;
  status: string | null;
  case_type: string | null;
  case_nature: string | null;
  case_stage: string | null;
  team: string | null;
  handler_id: string | null;
  last_touched_at: string;
  flag_problematic_client: boolean;
  flag_non_paying: boolean;
  flag_transferring_documents: boolean;
  handler: { full_name: string } | null;
  case_fields: Pick<
    CaseField,
    "page_name" | "field_name" | "value_text" | "value_date" | "value_number"
  >[];
}

const DASHBOARD_CASE_SELECT =
  "id, status, case_type, case_nature, case_stage, team, handler_id, last_touched_at, " +
  "flag_problematic_client, flag_non_paying, flag_transferring_documents, " +
  "handler:profiles!cases_handler_id_fkey(full_name), " +
  "case_fields(page_name, field_name, value_text, value_date, value_number)";

interface UpcomingItem {
  id: string;
  kind: "task" | "deadline";
  label: string;
  due_date: string;
  case: { id: string; case_number: string; case_name: string } | null;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager") redirect("/cases");

  const supabase = await createClient();
  const today = todayIso();

  const [
    { data: cases, error },
    { count: overdueTaskCount },
    { count: deadlinesTodayCount },
    { count: pendingDocumentCount },
    { count: pendingApprovalCount },
    { data: upcomingTasks },
    { data: upcomingDeadlines },
    { data: chartTemplates },
    { data: chartLayout },
    caseFieldKeys,
  ] = await Promise.all([
    // batched: an unpaged select stops at 1000 rows without erroring, which
    // had every tile and chart on this page reporting on a slice of the data
    fetchAllRows<DashboardCaseRow>((from, to) =>
      supabase
        .from("cases")
        .select(DASHBOARD_CASE_SELECT)
        // only חוצץ fields holding a value - see lib/case-field-catalog.ts
        .or(NON_EMPTY_CASE_FIELD, { referencedTable: "case_fields" })
        .order("last_touched_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
        .returns<DashboardCaseRow[]>(),
    ),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .lt("due_date", today),
    supabase
      .from("case_deadlines")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .eq("due_date", today),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .in("status", ["in_correction", "correction_needed"]),
    supabase
      .from("approval_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending_review", "pending_approval"]),
    supabase
      .from("tasks")
      .select("id, text, due_date, case:cases!tasks_case_id_fkey(id, case_number, case_name)")
      .eq("status", "open")
      .not("due_date", "is", null)
      .order("due_date", { ascending: true })
      .limit(6),
    supabase
      .from("case_deadlines")
      .select("id, label, due_date, case:cases!case_deadlines_case_id_fkey(id, case_number, case_name)")
      .eq("status", "open")
      .order("due_date", { ascending: true })
      .limit(6),
    supabase
      .from("view_templates")
      .select("*")
      .eq("screen", "dashboard")
      .order("display_order")
      .returns<ViewTemplate[]>(),
    // which charts the dashboard shows, as arranged by the manager. Absent
    // until someone changes the layout, in which case the panel falls back
    // to its defaults.
    supabase
      .from("view_templates")
      .select("*")
      .eq("screen", DASHBOARD_LAYOUT_SCREEN)
      .maybeSingle<ViewTemplate>(),
    fetchCaseFieldKeys(supabase),
  ]);

  const rows = cases ?? [];
  const stuckCount = rows.filter((c) => isCaseStuck(c.last_touched_at)).length;
  const flaggedCount = rows.filter(
    (c) =>
      c.flag_problematic_client ||
      c.flag_non_paying ||
      c.flag_transferring_documents,
  ).length;

  // ChartCaseRow is the shared FilterableCase shape, so the rows go straight
  // through - including case_fields and case_stage, which is what lets the
  // dashboard filter and group by חוצצים ושלבים like the cases screen does
  const chartRows: ChartCaseRow[] = rows;

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

  const upcoming: UpcomingItem[] = [
    ...(upcomingTasks ?? []).map((t) => ({
      id: t.id,
      kind: "task" as const,
      label: t.text,
      due_date: t.due_date as string,
      case: t.case as unknown as UpcomingItem["case"],
    })),
    ...(upcomingDeadlines ?? []).map((d) => ({
      id: d.id,
      kind: "deadline" as const,
      label: d.label,
      due_date: d.due_date,
      case: d.case as unknown as UpcomingItem["case"],
    })),
  ]
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 6);

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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <Link href="/cases">
                <StatTile label="תיקים פעילים" value={rows.length} tone="indigo" />
              </Link>
              <Link href="/tasks?overdue=1">
                <StatTile
                  label="משימות באיחור"
                  value={overdueTaskCount ?? 0}
                  tone="rose"
                />
              </Link>
              <Link href={`/deadlines?date=${today}`}>
                <StatTile
                  label="מועדים היום"
                  value={deadlinesTodayCount ?? 0}
                  tone="amber"
                />
              </Link>
              <StatTile
                label="מסמכים ממתינים"
                value={pendingDocumentCount ?? 0}
                tone="blue"
              />
              <Link href="/approvals?status=pending">
                <StatTile
                  label="ממתין לאישור"
                  value={pendingApprovalCount ?? 0}
                  tone="purple"
                />
              </Link>
            </div>

            <CaseChartsPanel
              cases={chartRows}
              layout={chartLayout ?? null}
              viewTemplates={chartTemplates ?? []}
              isManager={profile.role === "manager"}
              currentUserId={profile.id}
              caseFieldKeys={caseFieldKeys}
            />

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">משימות קרובות</h2>
                  <div className="flex items-center gap-2">
                    {stuckCount > 0 && (
                      <Badge tone="amber">{stuckCount} תיקים תקועים</Badge>
                    )}
                    {flaggedCount > 0 && (
                      <Badge tone="rose">{flaggedCount} עם דגל</Badge>
                    )}
                  </div>
                </div>
                {upcoming.length === 0 ? (
                  <p className="text-sm text-gray-400">אין משימות או מועדים פתוחים</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {upcoming.map((item) => (
                      <li key={`${item.kind}-${item.id}`} className="py-2.5">
                        <Link
                          href={item.kind === "task" ? `/tasks/${item.id}` : item.case ? `/cases/${item.case.id}` : "#"}
                          className="flex items-center justify-between gap-3 hover:text-blue-700"
                        >
                          <span className="text-sm font-medium text-gray-900">
                            {item.label}
                            {item.case && (
                              <span className="mr-1.5 text-xs text-gray-400">
                                · {item.case.case_number} {item.case.case_name}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-xs whitespace-nowrap text-gray-500">
                            {new Date(item.due_date + "T00:00:00").toLocaleDateString("he-IL")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  href="/tasks"
                  className="mt-3 inline-block text-sm text-blue-600 hover:underline"
                >
                  כל המשימות
                </Link>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 font-semibold text-gray-900">
                פירוט לפי מטפל
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[...byHandler.entries()].map(([name, s]) => (
                  <div
                    key={name}
                    className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3"
                  >
                    <Avatar name={name} size="h-10 w-10 text-sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-gray-900">{name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone="indigo">{s.total} תיקים</Badge>
                        {s.stuck > 0 && <Badge tone="amber">{s.stuck} תקועים</Badge>}
                        {s.flagged > 0 && <Badge tone="rose">{s.flagged} דגלים</Badge>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
