import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { DocumentsPanel } from "./documents-panel";
import { DeadlinesPanel } from "./deadlines-panel";
import { CaseTasksPanel } from "./case-tasks-panel";
import type {
  CaseWithHandler,
  CaseDocument,
  CaseDeadline,
  TaskWithNames,
} from "@/types/database";

const TASK_SELECT =
  "*, assigned_to_profile:profiles!tasks_assigned_to_fkey(id, full_name), created_by_profile:profiles!tasks_created_by_fkey(id, full_name), case:cases!tasks_case_id_fkey(id, case_number, case_name)";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  const { data: caseRow } = await supabase
    .from("cases")
    .select("*, handler:profiles!cases_handler_id_fkey(id, full_name)")
    .eq("id", id)
    .maybeSingle<CaseWithHandler>();

  if (!caseRow) notFound();

  const [{ data: documents }, { data: deadlines }, { data: caseTasks }] =
    await Promise.all([
      supabase
        .from("documents")
        .select("*")
        .eq("case_id", id)
        .order("doc_date", { ascending: false, nullsFirst: false })
        .returns<CaseDocument[]>(),
      supabase
        .from("case_deadlines")
        .select("*")
        .eq("case_id", id)
        .order("due_date", { ascending: true })
        .returns<CaseDeadline[]>(),
      supabase
        .from("tasks")
        .select(TASK_SELECT)
        .eq("case_id", id)
        .order("created_at", { ascending: false })
        .returns<TaskWithNames[]>(),
    ]);

  const canEdit =
    profile.role === "manager" ||
    (profile.role === "handler" && caseRow.handler_id === profile.id);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        title={`תיק ${caseRow.case_number} - ${caseRow.case_name}`}
        userId={profile.id}
      />
      <main className="flex-1 space-y-6 p-6">
        <Link
          href="/cases"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
        >
          ← חזרה לרשימת התיקים
        </Link>

        <CaseSummary caseRow={caseRow} />

        <div className="grid gap-6 lg:grid-cols-2">
          <DeadlinesPanel deadlines={deadlines ?? []} canEdit={canEdit} />
          <DocumentsPanel documents={documents ?? []} canEdit={canEdit} />
          <CaseTasksPanel tasks={caseTasks ?? []} />
        </div>
      </main>
    </div>
  );
}

function CaseSummary({ caseRow }: { caseRow: CaseWithHandler }) {
  const fields: { label: string; value: string }[] = [
    { label: "סוג תיק", value: caseRow.case_type ?? "—" },
    { label: "מהות", value: caseRow.case_nature ?? "—" },
    { label: "מטפל", value: caseRow.handler?.full_name ?? "—" },
    { label: "צוות", value: caseRow.team ?? "—" },
    { label: "סטטוס", value: caseRow.status ?? "—" },
    {
      label: "תאריך פתיחה",
      value: caseRow.opened_date
        ? new Date(caseRow.opened_date).toLocaleDateString("he-IL")
        : "—",
    },
    { label: "זיהוי נוסף", value: caseRow.external_ref ?? "—" },
  ];

  const clientFields: { label: string; value: string }[] = [
    { label: "ת.ז לקוח", value: caseRow.client_id_number ?? "—" },
    { label: "טלפון לקוח", value: caseRow.client_phone ?? "—" },
  ];

  const spouse = caseRow.spouse_details;
  if (spouse?.name || spouse?.id_number || spouse?.phone) {
    clientFields.push(
      { label: "שם בן/בת זוג", value: spouse.name ?? "—" },
      { label: "ת.ז בן/בת זוג", value: spouse.id_number ?? "—" },
      { label: "טלפון בן/בת זוג", value: spouse.phone ?? "—" },
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {fields.map((f) => (
          <div key={f.label}>
            <div className="text-xs text-gray-400">{f.label}</div>
            <div className="mt-0.5 text-sm font-medium text-gray-900">
              {f.value}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-3 lg:grid-cols-6">
        {clientFields.map((f) => (
          <div key={f.label}>
            <div className="text-xs text-gray-400">{f.label}</div>
            <div className="mt-0.5 text-sm font-medium text-gray-900">
              {f.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
