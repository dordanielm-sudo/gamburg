"use client";

import { useState } from "react";
import { formatCaseFieldValue, type CaseField } from "@/types/database";
import { Badge, hashTone, TONE_HEX } from "@/components/ui/badge";
import { InlineEdit } from "@/components/ui/inline-edit";
import { EditToggle, SYNC_HINT } from "@/components/ui/edit-toggle";

// One tab per PageName. Values are synced from עדכנית and, since migration
// 0034, editable back into it - so the tab carries its own edit toggle
// rather than a global one: a חוצץ holds dozens of fields and opening them
// all across every tab at once invites stray edits.

// case_fields splits a value across three typed columns. Which one a field
// uses is decided by עדכנית, so we keep writing to the column the sync
// populated - switching columns would change how the value reads back and
// break the sync's own update on the next run.
function columnFor(f: CaseField): { column: string; kind: "date" | "number" | "text" } {
  if (f.value_date !== null) return { column: "value_date", kind: "date" };
  if (f.value_number !== null) return { column: "value_number", kind: "number" };
  return { column: "value_text", kind: "text" };
}

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
          {!editing && (
            <p className="text-xs text-gray-400">נמשך אוטומטית מעדכנית</p>
          )}
          {canEdit && (
            <EditToggle
              editing={editing}
              onToggle={() => setEditing((v) => !v)}
              hint={SYNC_HINT}
            />
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {fields.map((f) => (
          <div key={f.id}>
            <div className="text-xs text-gray-400">{f.field_name}</div>
            <div className="mt-0.5 text-sm font-medium text-gray-900">
              <InlineEdit
                table="case_fields"
                rowId={f.id}
                column={columnFor(f).column}
                kind={columnFor(f).kind}
                value={
                  columnFor(f).column === "value_date"
                    ? f.value_date
                    : columnFor(f).column === "value_number"
                      ? f.value_number
                      : f.value_text
                }
                editing={editing}
                render={(v) =>
                  formatCaseFieldValue({
                    value_text: columnFor(f).kind === "text" ? v || null : null,
                    value_date: columnFor(f).kind === "date" ? v || null : null,
                    value_number:
                      columnFor(f).kind === "number" && v ? Number(v) : null,
                  })
                }
                sync={{
                  entityType: "case_field",
                  caseId: f.case_id,
                  caseNumber,
                  entityId: f.id,
                  fieldName: f.field_name,
                  pageName: f.page_name,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
