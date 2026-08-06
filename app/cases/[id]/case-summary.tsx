"use client";

import { useState } from "react";
import {
  formatCaseFieldValue,
  type CaseWithHandler,
  type CaseField,
} from "@/types/database";
import { Badge, hashTone } from "@/components/ui/badge";
import { NamedAvatar } from "@/components/ui/avatar";
import { FieldGroup, type FieldValue } from "@/components/ui/field-group";
import { StatusStageEditor } from "./status-stage-editor";
import { EditableCaseField } from "./editable-case-field";

function lookupCaseField(fields: CaseField[], fieldName: string): string {
  const match = fields.find((f) => f.field_name === fieldName);
  return match ? formatCaseFieldValue(match) : "—";
}

function statusOrDash(value: string | null | undefined) {
  return value ? <Badge tone={hashTone(value)}>{value}</Badge> : "—";
}

// The card defaults to a reading view; one toggle opens every editable field
// at once. Only columns that exist on `cases` and are synced from עדכנית are
// editable here - each save goes out through /api/case-updates so the change
// reaches עדכנית too. חוצצים fields (case_fields) stay read-only: they have
// no write path yet, in the DB or in Make.
export function CaseSummary({
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
  const [editing, setEditing] = useState(false);

  function editable(
    fieldName: string,
    value: string | null,
    type: "text" | "tel" | "email" | "date" = "text",
  ) {
    return (
      <EditableCaseField
        caseId={caseRow.id}
        caseNumber={caseRow.case_number}
        fieldName={fieldName}
        value={value}
        editing={editing}
        type={type}
      />
    );
  }

  const clientFields: FieldValue[] = [
    { label: "ת.ז", value: editable("client_id_number", caseRow.client_id_number) },
    { label: "טלפון", value: editable("client_phone", caseRow.client_phone, "tel") },
    { label: "מייל", value: editable("client_email", caseRow.client_email, "email") },
    { label: "כתובת", value: editable("client_address", caseRow.client_address) },
  ];

  const financialFields: FieldValue[] = [
    { label: "חובות", value: lookupCaseField(caseFields, "חובות") },
    { label: "מספר נושים", value: lookupCaseField(caseFields, "מספר נושים") },
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
    { label: "צוות", value: editable("team", caseRow.team) },
    {
      label: "עו״ד אחראי",
      value: lookupCaseField(caseFields, "עורך דין אחראי"),
    },
    {
      label: "מועד פתיחת תיק",
      value: editing
        ? editable("opened_date", caseRow.opened_date, "date")
        : caseRow.opened_date
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
      <div className="flex items-center justify-end gap-2">
        {canEdit && (
          <button
            onClick={() => setEditing((v) => !v)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              editing
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {editing ? "סיום עריכה" : "עריכת שדות"}
          </button>
        )}
        {caseRow.drive_url && (
          <a
            href={caseRow.drive_url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            פתיחת תיקיית הדרייב
          </a>
        )}
      </div>
      {editing && (
        <p className="rounded-lg bg-blue-50/60 px-3 py-2 text-xs text-blue-800">
          שדות בעריכה נשמרים ביציאה מהשדה ונשלחים לעדכנית. שדות ללא מסגרת
          נמשכים אוטומטית ואינם ניתנים לעריכה כאן.
        </p>
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
