"use client";

import { useState } from "react";
import { type CaseField } from "@/types/database";
import { Badge, hashTone, TONE_HEX } from "@/components/ui/badge";
import { EditableTabField } from "./editable-tab-field";

// One tab per PageName. Values are synced from עדכנית and, since migration
// 0034, editable back into it - so the tab carries its own edit toggle
// rather than a global one: a חוצץ holds dozens of fields and opening them
// all across every tab at once invites stray edits.
export function CaseFieldsTab({
  pageName,
  fields,
  caseNumber,
  canEdit,
}: {
  pageName: string;
  fields: CaseField[];
  caseNumber: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const tone = hashTone(pageName);

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      style={{ boxShadow: `inset -3px 0 0 0 ${TONE_HEX[tone]}` }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <Badge tone={tone} dot>
          {pageName}
        </Badge>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400">
            {editing
              ? "שינויים נשמרים ביציאה מהשדה ונשלחים לעדכנית"
              : "נמשך אוטומטית מעדכנית"}
          </p>
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
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {fields.map((f) => (
          <div key={f.id}>
            <div className="text-xs text-gray-400">{f.field_name}</div>
            <div className="mt-0.5 text-sm font-medium text-gray-900">
              <EditableTabField
                field={f}
                caseNumber={caseNumber}
                editing={editing}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
