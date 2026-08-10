"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  priorityLabel,
  priorityTone,
  type PriorityOption,
} from "@/lib/task-priority";

import type { TaskWithNames } from "@/types/database";

// Priority is a pair of columns - priority_code drives the colour,
// priority_name is what people read - and they have to move together, so this
// cannot be an InlineEdit (which writes one column).
export function TaskPriorityEditor({
  task,
  options,
  editing,
}: {
  task: TaskWithNames;
  options: PriorityOption[];
  editing: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [code, setCode] = useState(task.priority_code);
  const [name, setName] = useState(task.priority_name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = priorityLabel(code, name);

  async function save(nextCodeRaw: string) {
    const nextCode = nextCodeRaw === "" ? null : Number(nextCodeRaw);
    if (nextCode === code) return;
    const nextName =
      nextCode === null ? null : (options.find((o) => o.code === nextCode)?.name ?? null);

    setError(null);
    const prevCode = code;
    const prevName = name;
    setCode(nextCode);
    setName(nextName);
    setPending(true);

    const { error: dbError } = await supabase
      .from("tasks")
      .update({ priority_code: nextCode, priority_name: nextName })
      .eq("id", task.id);

    if (dbError) {
      setCode(prevCode);
      setName(prevName);
      setPending(false);
      setError("שגיאה בשמירה");
      return;
    }

    // A CRM-only task has no record in עדכנית to update, so it saves locally
    // and skips the webhook - same rule as every other editable field.
    if (task.case && task.source_task_id) {
      try {
        const res = await fetch("/api/case-updates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            case_id: task.case.id,
            case_number: task.case.case_number,
            // the name goes out, not the code: עדכנית keeps its own code table
            // and Make resolves the name against it, exactly as it does for
            // status (see docs/make-write-back.md)
            field_name: "priority_name",
            entity_type: "task",
            entity_id: task.id,
            source_ref: task.source_task_id,
            old_value: prevName,
            new_value: nextName,
          }),
        });
        const result = await res.json();
        if (result.status === "failure") {
          await supabase
            .from("tasks")
            .update({ priority_code: prevCode, priority_name: prevName })
            .eq("id", task.id);
          setCode(prevCode);
          setName(prevName);
          setError(result.message ?? "כשל בסנכרון");
        }
      } catch {
        setError("לא ניתן להתחבר לשרת הסנכרון");
      }
    }
    setPending(false);
  }

  if (!editing) {
    return label ? (
      <Badge tone={priorityTone(code)}>{label}</Badge>
    ) : (
      <span className="text-gray-300">—</span>
    );
  }

  return (
    <span className="flex items-center justify-center gap-1.5">
      {pending && <Spinner className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
      <select
        value={code ?? ""}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        className="rounded-md border border-blue-300 bg-blue-50/40 px-2 py-1 text-xs focus:border-blue-500 focus:bg-white focus:outline-none disabled:opacity-50"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
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
