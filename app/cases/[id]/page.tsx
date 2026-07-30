import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { Tabs } from "@/components/tabs";
import { DocumentsPanel } from "./documents-panel";
import { DeadlinesPanel } from "./deadlines-panel";
import { CaseTasksPanel } from "./case-tasks-panel";
import { CaseApprovalsPanel } from "./case-approvals-panel";
import {
  formatCaseFieldValue,
  type CaseWithHandler,
  type CaseDocumentWithResponsible,
  type CaseDeadline,
  type TaskWithNames,
  type SpouseDetails,
  type CaseField,
  type ApprovalRequestWithNames,
  type CaseTypeStage,
  type CaseTypeStageItem,
  type CaseStageChecklistEntry,
} from "@/types/database";
import { Badge, hashTone, TONE_HEX } from "@/components/ui/badge";
import { NamedAvatar } from "@/components/ui/avatar";
import { FieldGroup, type FieldValue } from "@/components/ui/field-group";
import { StatusStageEditor } from "./status-stage-editor";
import { StageStepperPanel } from "./stage-stepper-panel";

function uniqueSorted(values: (string | null)[]) {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort(
    (a, b) => a.localeCompare(b, "he"),
  );
}

const APPROVAL_SELECT =
  "*, submitted_by_profile:profiles!approval_requests_submitted_by_fkey(id, full_name), reviewed_by_profile:profiles!approval_requests_reviewed_by_fkey(id, full_name), approved_by_profile:profiles!approval_requests_approved_by_fkey(id, full_name), case:cases!approval_requests_case_id_fkey(id, case_number, case_name)";

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

  const [
    { data: documents },
    { data: deadlines },
    { data: caseTasks },
    { data: caseFields },
    { data: approvalRequests },
    { data: peerCases },
    { data: stageRows },
  ] = await Promise.all([
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
      supabase
        .from("approval_requests")
        .select(APPROVAL_SELECT)
        .eq("case_id", id)
        .order("created_at", { ascending: false })
        .returns<ApprovalRequestWithNames[]>(),
      // options for the status/שלב בתיק dropdowns - values already seen
      // among cases of the same type, so the list stays relevant instead of
      // mixing חדל"פ stages with הסדרי נושים stages
      supabase
        .from("cases")
        .select("status, case_nature")
        .eq("case_type", caseRow.case_type ?? ""),
      // שלבים בתיק - manager-defined ordered stage list for this case's
      // case_type (migration 0028); no rows means this type has none
      // configured yet, and the card falls back to the plain dropdown
      supabase
        .from("case_type_stages")
        .select("*")
        .eq("case_type", caseRow.case_type ?? "")
        .order("display_order")
        .returns<CaseTypeStage[]>(),
    ]);

  const canEdit =
    profile.role === "manager" ||
    (profile.role === "handler" && caseRow.handler_id === profile.id);

  const statusOptions = uniqueSorted((peerCases ?? []).map((c) => c.status));
  const stageOptions = uniqueSorted((peerCases ?? []).map((c) => c.case_nature));

  // תתי-שלבים (checklist per שלב) - needs the stage ids from the query
  // above first, so this is a second round trip rather than part of the
  // same Promise.all
  const stageIds = (stageRows ?? []).map((s) => s.id);
  const [{ data: stageItems }, { data: checklistEntries }] =
    await Promise.all([
      stageIds.length > 0
        ? supabase
            .from("case_type_stage_items")
            .select("*")
            .in("stage_id", stageIds)
            .order("display_order")
            .returns<CaseTypeStageItem[]>()
        : Promise.resolve({ data: [] as CaseTypeStageItem[], error: null }),
      supabase
        .from("case_stage_checklist")
        .select("*")
        .eq("case_id", id)
        .returns<CaseStageChecklistEntry[]>(),
    ]);

  const spouse = caseRow.spouse_details;
  const hasSpouse = !!(spouse?.name || spouse?.id_number || spouse?.phone);

  const tabs = [
    {
      id: "main",
      label: "פרטי תיק",
      content: (
        <div className="space-y-6">
          <CaseSummary
            caseRow={caseRow}
            caseFields={caseFields ?? []}
            canEdit={canEdit}
            statusOptions={statusOptions}
            stageOptions={stageOptions}
          />
          {stageRows && stageRows.length > 0 && (
            <StageStepperPanel
              caseId={caseRow.id}
              caseNumber={caseRow.case_number}
              stages={stageRows}
              items={stageItems ?? []}
              checklistEntries={checklistEntries ?? []}
              currentStage={caseRow.case_stage}
              canEdit={canEdit}
            />
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <DeadlinesPanel deadlines={deadlines ?? []} canEdit={canEdit} />
            <DocumentsPanel documents={documents ?? []} canEdit={canEdit} />
            <CaseTasksPanel tasks={caseTasks ?? []} />
            <CaseApprovalsPanel requests={approvalRequests ?? []} />
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

function statusOrDash(value: string | null | undefined) {
  return value ? <Badge tone={hashTone(value)}>{value}</Badge> : "—";
}

function CaseSummary({
  caseRow,
  caseFields,
  canEdit,
  statusOptions,
  stageOptions,
}: {
  caseRow: CaseWithHandler;
  caseFields: CaseField[];
  canEdit: boolean;
  statusOptions: string[];
  stageOptions: string[];
}) {
  const clientFields: FieldValue[] = [
    { label: "ת.ז", value: caseRow.client_id_number ?? "—" },
    { label: "טלפון", value: caseRow.client_phone ?? "—" },
    { label: "מייל", value: caseRow.client_email ?? "—" },
    { label: "כתובת", value: caseRow.client_address ?? "—" },
  ];

  const financialFields: FieldValue[] = [
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

  const caseInfoFields: FieldValue[] = [
    {
      label: "מהות תיק",
      value: canEdit ? (
        <StatusStageEditor
          caseId={caseRow.id}
          caseNumber={caseRow.case_number}
          fieldName="case_nature"
          value={caseRow.case_nature}
          options={stageOptions}
        />
      ) : (
        statusOrDash(caseRow.case_nature)
      ),
    },
    {
      label: "סטטוס",
      value: canEdit ? (
        <StatusStageEditor
          caseId={caseRow.id}
          caseNumber={caseRow.case_number}
          fieldName="status"
          value={caseRow.status}
          options={statusOptions}
        />
      ) : (
        statusOrDash(caseRow.status)
      ),
    },
    {
      label: "מטפל",
      value: caseRow.handler?.full_name ? (
        <NamedAvatar name={caseRow.handler.full_name} />
      ) : (
        "—"
      ),
    },
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

  const dateFields: FieldValue[] = [
    { label: "תאריך צו", value: lookupCaseField(caseFields, "מועד קבלת צו") },
    { label: "מועד דיון", value: lookupCaseField(caseFields, "תאריך דיון.") },
    { label: "ממונה", value: lookupCaseField(caseFields, "תיק ממונה") },
    { label: "נאמן", value: lookupCaseField(caseFields, "שם הנאמן") },
  ];

  return (
    <div className="space-y-3">
      {caseRow.drive_url && (
        <div className="flex justify-end">
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
      <div className="grid gap-4 lg:grid-cols-2">
        <FieldGroup title="לקוח" tone="blue" fields={clientFields} />
        <FieldGroup title="נתונים כלכליים" tone="green" fields={financialFields} />
        <FieldGroup title="פרטי תיק" tone="indigo" fields={caseInfoFields} />
        <FieldGroup title="תאריכים" tone="purple" fields={dateFields} />
      </div>
      {caseRow.external_ref && (
        <div className="text-xs text-gray-400">
          זיהוי נוסף: {caseRow.external_ref}
        </div>
      )}
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
  const tone = hashTone(pageName);
  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      style={{ boxShadow: `inset -3px 0 0 0 ${TONE_HEX[tone]}` }}
    >
      <div className="mb-4 flex items-center justify-between">
        <Badge tone={tone} dot>
          {pageName}
        </Badge>
        <p className="text-xs text-gray-400">נמשך אוטומטית מעדכנית - לתצוגה בלבד</p>
      </div>
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
  const fields: FieldValue[] = [
    { label: "שם", value: spouse.name ? <NamedAvatar name={spouse.name} /> : "—" },
    { label: "ת.ז", value: spouse.id_number ?? "—" },
    { label: "טלפון", value: spouse.phone ?? "—" },
  ];

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      style={{ boxShadow: `inset -3px 0 0 0 ${TONE_HEX.purple}` }}
    >
      <div className="mb-4">
        <Badge tone="purple" dot>
          בן/בת זוג
        </Badge>
      </div>
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
