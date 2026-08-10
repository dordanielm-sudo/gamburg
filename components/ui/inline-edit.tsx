"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/ui/spinner";
import { hashTone, TONE_BADGE } from "@/components/ui/badge";

export type EntityType = "case" | "case_field" | "task" | "deadline" | "document";

// Identifies the row being edited for the write-back. Omitted entirely for
// CRM-only tables (approvals, profiles), which have nothing to sync back:
// those saves stay local and skip the webhook.
export type SyncTarget = {
  entityType: EntityType;
  caseId: string;
  caseNumber?: string;
  entityId?: string;
  // the name עדכנית knows the field by, when it differs from the DB column
  fieldName?: string;
  pageName?: string;
  // How עדכנית identifies this record, when case_number alone is not enough.
  // entityId is our own uuid and means nothing on the other side, so a row
  // that needs one and has none cannot be written back - see the callers.
  sourceRef?: string | null;
  // For חוצץ fields: which typed column עדכנית keeps this value in
  // (strData / dateData / numData). The CRM already knows - it writes the
  // matching column locally - so it says so rather than leaving Make to
  // guess from the shape of the value, which misroutes a text field that
  // happens to hold something date-like.
  valueType?: "text" | "date" | "number";
};

export type InlineEditProps = {
  table: string;
  rowId: string;
  column: string;
  value: string | number | null;
  editing: boolean;
  kind?: "text" | "textarea" | "date" | "number" | "tel" | "email" | "select";
  options?: string[];
  sync?: SyncTarget;
  // how the value reads when not editing; defaults to the raw value or a dash
  render?: (value: string) => React.ReactNode;
  placeholder?: string;
};

// One inline editor for every screen. Three earlier one-off editors had
// drifted into near-identical copies of the same optimistic-save logic, so
// the shared parts live here: write to the row, then push the change back
// out through /api/case-updates, and roll the local value back if either
// step fails.
//
// The write-back is skipped when `sync` is absent - CRM-only tables have no
// counterpart in עדכנית, and posting them would log changes Make can't route.
export function InlineEdit({
  table,
  rowId,
  column,
  value,
  editing,
  kind = "text",
  options,
  sync,
  render,
  placeholder = "—",
}: InlineEditProps) {
  const supabase = useMemo(() => createClient(), []);
  const initial = value === null ? "" : String(value);
  const [current, setCurrent] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toColumnValue(v: string) {
    if (v.trim() === "") return null;
    if (kind === "number") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return v;
  }

  async function commit(next: string) {
    const newValue = next.trim();
    if (newValue === current) return;
    if (kind === "number" && newValue !== "" && !Number.isFinite(Number(newValue))) {
      setDraft(current);
      setError("ערך חייב להיות מספר");
      return;
    }

    setError(null);
    const oldValue = current;
    setCurrent(newValue);
    setDraft(newValue);
    setPending(true);

    const { error: dbError } = await supabase
      .from(table)
      .update({ [column]: toColumnValue(newValue) })
      .eq("id", rowId);

    if (dbError) {
      setCurrent(oldValue);
      setDraft(oldValue);
      setPending(false);
      setError("שגיאה בשמירה");
      return;
    }

    if (sync) {
      try {
        const res = await fetch("/api/case-updates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            case_id: sync.caseId,
            case_number: sync.caseNumber,
            field_name: sync.fieldName ?? column,
            page_name: sync.pageName ?? null,
            entity_type: sync.entityType,
            entity_id: sync.entityId ?? null,
            source_ref: sync.sourceRef ?? null,
            value_type: sync.valueType ?? null,
            old_value: oldValue,
            new_value: newValue,
          }),
        });
        const result = await res.json();
        if (result.status === "failure") {
          await supabase
            .from(table)
            .update({ [column]: toColumnValue(oldValue) })
            .eq("id", rowId);
          setCurrent(oldValue);
          setDraft(oldValue);
          setError(result.message ?? "כשל בסנכרון");
        }
      } catch {
        setError("לא ניתן להתחבר לשרת הסנכרון");
      }
    }
    setPending(false);
  }

  if (!editing) {
    return <>{render ? render(current) : current || placeholder}</>;
  }

  const inputClass =
    "w-full min-w-0 rounded-md border border-blue-300 bg-blue-50/40 px-2 py-1 text-sm focus:border-blue-500 focus:bg-white focus:outline-none disabled:opacity-50";

  // a select commits on change - there is no "finished typing" moment to
  // wait for, and blur-to-save would swallow a pick the user made by keyboard
  if (kind === "select") {
    const all =
      current && options && !options.includes(current)
        ? [current, ...options]
        : (options ?? []);
    return (
      <span className="flex items-center gap-1.5">
        {pending && <Spinner className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
        <select
          value={current}
          disabled={pending}
          onChange={(e) => commit(e.target.value)}
          className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium ${
            TONE_BADGE[current ? hashTone(current) : "gray"]
          }`}
        >
          <option value="">—</option>
          {all.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {error && (
          <span className="shrink-0 text-xs text-red-600" title={error}>
            ⚠
          </span>
        )}
      </span>
    );
  }

  const commonProps = {
    value: draft,
    disabled: pending,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setDraft(e.target.value),
    onBlur: () => commit(draft),
    className: inputClass,
  };

  return (
    <span className="flex items-center gap-1.5">
      {kind === "textarea" ? (
        <textarea {...commonProps} rows={3} />
      ) : (
        <input
          {...commonProps}
          type={kind}
          placeholder={placeholder}
          onKeyDown={(e) => {
            // Enter commits via blur; Escape restores the last saved value.
            // Textareas are left alone so Enter can still insert a newline.
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(current);
              e.currentTarget.blur();
            }
          }}
        />
      )}
      {pending && <Spinner className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
      {error && (
        <span className="shrink-0 text-xs text-red-600" title={error}>
          ⚠
        </span>
      )}
    </span>
  );
}
