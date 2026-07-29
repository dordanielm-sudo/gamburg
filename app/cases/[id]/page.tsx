import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { Tabs } from "@/components/tabs";
import { DocumentsPanel } from "./documents-panel";
import { DeadlinesPanel } from "./deadlines-panel";
import { CaseTasksPanel } from "./case-tasks-panel";
import {
  formatCaseFieldValue,
  type CaseWithHandler,
  type CaseDocumentWithResponsible,
  type CaseDeadline,
  type TaskWithNames,
  type SpouseDetails,
  type CaseField,
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

  const [{ data: documents }, { data: deadlines }, { data: caseTasks }, { data: caseFields }] =
    await Promise.all([
      supabase
        .from("documents")
        .select(
          "*, responsible:profiles!documents_responsible_id_fkey(id, full_name)",
        )
        .eq("case_id", id)
        .order("doc_date", { ascending: false, nullsFirst: false })
        .returns<CaseDocumentWithResponsible[]>(),
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
      supabase
        .from("case_fields")
        .select("*")
        .eq("case_id", id)
        .order("field_name")
        .returns<CaseField[]>(),
    ]);

  const canEdit =
    profile.role === "manager" ||
    (profile.role === "handler" && caseRow.handler_id === profile.id);

  const spouse = caseRow.spouse_details;
  const hasSpouse = !!(spouse?.name || spouse?.id_number || spouse?.phone);

  const tabs = [
    {
      id: "main",
      label: "פרטי תיק",
      content: (
        <div className="space-y-6">
          <CaseSummary caseRow={caseRow} caseFields={caseFields ?? []} />
          <div className="grid gap-6 lg:grid-cols-2">
            <DeadlinesPanel deadlines={deadlines ?? []} canEdit={canEdit} />
            <DocumentsPanel documents={documents ?? []} canEdit={canEdit} />
            <CaseTasksPanel tasks={caseTasks ?? []} />
          </div>
        </div>
      ),
    },
  ];
  if (hasSpouse) {
    tabs.push({
      id: "spouse",
      label: "בן/בת זוג",
      content: <SpouseSummary spouse={spouse!} />,
    });
  }

  // חוצצים: one tab per PageName that has synced fields for this case - a
  // case with no חדל"פ data, say, simply gets no חדל"פ tab
  const fieldsByPage = new Map<string, CaseField[]>();
  for (const f of caseFields ?? []) {
    const group = fieldsByPage.get(f.page_name) ?? [];
    group.push(f);
    fieldsByPage.set(f.page_name, group);
  }
  for (const [pageName, fields] of fieldsByPage) {
    tabs.push({
      id: `fields-${pageName}`,
      label: pageName,
      content: <CaseFieldsTab pageName={pageName} fields={fields} />,
    });
  }

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

        <Tabs tabs={tabs} />
      </main>
    </div>
  );
}

// looks up a חוצץ field by name regardless of which page it's on - best
// guess at the field names these highlights map to in עדכנית; shows "—"
// harmlessly if the guess is wrong or the field hasn't synced yet
function lookupCaseField(fields: CaseField[], fieldName: string): string {
  const match = fields.find((f) => f.field_name === fieldName);
  return match ? formatCaseFieldValue(match) : "—";
}

function CaseSummary({
  caseRow,
  caseFields,
}: {
  caseRow: CaseWithHandler;
  caseFields: CaseField[];
}) {
  const clientFields: { label: string; value: string }[] = [
    { label: "ת.ז", value: caseRow.client_id_number ?? "—" },
    { label: "טלפון", value: caseRow.client_phone ?? "—" },
    { label: "מייל", value: caseRow.client_email ?? "—" },
    { label: "כתובת", value: caseRow.client_address ?? "—" },
  ];

  const financialFields: { label: string; value: string }[] = [
    { label: "חובות", value: lookupCaseField(caseFields, "חובות") },
    {
      label: "מספר נושים",
      value: lookupCaseField(caseFields, "מספר נושים"),
    },
    {
      label: "תשלום חודשי",
      value: lookupCaseField(caseFields, "תשלום חודשי לממונה"),
    },
  ];

  const caseInfoFields: { label: string; value: string }[] = [
    { label: "שלב בתיק", value: caseRow.case_nature ?? "—" },
    { label: "סטטוס", value: caseRow.status ?? "—" },
    { label: "מטפל", value: caseRow.handler?.full_name ?? "—" },
    { label: "צוות", value: caseRow.team ?? "—" },
    {
      label: "עו״ד אחראי",
      value: lookupCaseField(caseFields, "עורך דין אחראי"),
    },
    {
      label: "מועד פתיחת תיק",
      value: caseRow.opened_date
        ? new Date(caseRow.opened_date).toLocaleDateString("he-IL")
        : "—",
    },
  ];

  const dateFields: { label: string; value: string }[] = [
    { label: "תאריך צו", value: lookupCaseField(caseFields, "מועד קבלת צו") },
    { label: "מועד דיון", value: lookupCaseField(caseFields, "תאריך דיון.") },
    { label: "ממונה", value: lookupCaseField(caseFields, "תיק ממונה") },
    { label: "נאמן", value: lookupCaseField(caseFields, "שם הנאמן") },
  ];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {caseRow.drive_url && (
        <div className="mb-4 flex justify-end">
          <a
            href={caseRow.drive_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            פתיחת תיקיית הדרייב
          </a>
        </div>
      )}
      <FieldGroup title="לקוח" fields={clientFields} first />
      <FieldGroup title="נתונים כלכליים" fields={financialFields} />
      <FieldGroup title="פרטי תיק" fields={caseInfoFields} />
      <FieldGroup title="תאריכים" fields={dateFields} />
      {caseRow.external_ref && (
        <div className="mt-4 border-t border-gray-100 pt-4 text-xs text-gray-400">
          זיהוי נוסף: {caseRow.external_ref}
        </div>
      )}
    </section>
  );
}

function FieldGroup({
  title,
  fields,
  first,
}: {
  title: string;
  fields: { label: string; value: string }[];
  first?: boolean;
}) {
  return (
    <div className={first ? "" : "mt-4 border-t border-gray-100 pt-4"}>
      <h3 className="mb-2 text-xs font-semibold text-gray-500">{title}</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {fields.map((f) => (
          <div key={f.label}>
            <div className="text-xs text-gray-400">{f.label}</div>
            <div className="mt-0.5 text-sm font-medium text-gray-900">
              {f.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CaseFieldsTab({
  pageName,
  fields,
}: {
  pageName: string;
  fields: CaseField[];
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 font-semibold text-gray-900">{pageName}</h2>
      <p className="mb-4 text-xs text-gray-400">
        נמשך אוטומטית מעדכנית - לתצוגה בלבד
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {fields.map((f) => (
          <div key={f.id}>
            <div className="text-xs text-gray-400">{f.field_name}</div>
            <div className="mt-0.5 text-sm font-medium text-gray-900">
              {formatCaseFieldValue(f)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SpouseSummary({ spouse }: { spouse: SpouseDetails }) {
  const fields: { label: string; value: string }[] = [
    { label: "שם", value: spouse.name ?? "—" },
    { label: "ת.ז", value: spouse.id_number ?? "—" },
    { label: "טלפון", value: spouse.phone ?? "—" },
  ];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-semibold text-gray-900">פרטי בן/בת הזוג</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {fields.map((f) => (
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
