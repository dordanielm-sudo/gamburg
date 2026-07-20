"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isCaseStuck, type CaseWithHandler } from "@/types/database";

type SortKey = "case_number" | "case_name" | "opened_date" | "last_touched_at";

type EditableField =
  | "flag_problematic_client"
  | "flag_non_paying"
  | "flag_transferring_documents"
  | "manager_follow_up"
  | "manager_note";

interface SyncStatus {
  phase: "saving" | "success" | "warning" | "failure";
  message?: string;
}

const FLAG_DEFS = [
  { key: "flag_problematic_client", label: "לקוח בעייתי" },
  { key: "flag_non_paying", label: "לא משלם" },
  { key: "flag_transferring_documents", label: "מעביר מסמכים" },
] as const;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("he-IL");
}

export function CasesTable({
  cases,
  canEdit,
}: {
  cases: CaseWithHandler[];
  canEdit: boolean;
}) {
  const [rows, setRows] = useState(cases);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("last_touched_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [syncStatus, setSyncStatus] = useState<Record<string, SyncStatus>>({});

  const supabase = useMemo(() => createClient(), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? rows.filter((c) =>
          [c.case_number, c.case_name, c.client_id_number, c.client_phone]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q)),
        )
      : rows;

    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return sorted;
  }, [rows, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // section 4.2: (1) save immediately to Supabase (optimistic), (2) tell
  // Make about the change via /api/case-updates, (3) show its
  // success/failure/warning response, (4) on failure, undo the optimistic
  // write both in the UI and in Supabase.
  async function updateCase(
    id: string,
    field: EditableField,
    value: boolean | string,
  ) {
    const current = rows.find((r) => r.id === id);
    if (!current) return;
    const oldValue = current[field];

    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setSyncStatus((s) => ({ ...s, [id]: { phase: "saving" } }));

    const { error } = await supabase
      .from("cases")
      .update({ [field]: value })
      .eq("id", id);

    if (error) {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: oldValue } : r)));
      setSyncStatus((s) => ({ ...s, [id]: { phase: "failure", message: "שגיאה בשמירה" } }));
      return;
    }

    try {
      const res = await fetch("/api/case-updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: id,
          case_number: current.case_number,
          field_name: field,
          old_value: oldValue,
          new_value: value,
        }),
      });
      const result = await res.json();

      setSyncStatus((s) => ({
        ...s,
        [id]: { phase: result.status ?? "failure", message: result.message },
      }));

      if (result.status === "failure") {
        await supabase.from("cases").update({ [field]: oldValue }).eq("id", id);
        setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: oldValue } : r)));
      }
    } catch {
      setSyncStatus((s) => ({
        ...s,
        [id]: { phase: "failure", message: "לא ניתן להתחבר לשרת הסנכרון" },
      }));
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <input
          type="text"
          placeholder="חיפוש לפי מספר תיק, שם, ת.ז או טלפון..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-80 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
        <span className="text-sm text-gray-500">
          {filtered.length} תיקים
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-right">
            <tr>
              <Th onClick={() => toggleSort("case_number")}>מספר תיק</Th>
              <Th onClick={() => toggleSort("case_name")}>שם תיק</Th>
              <th className="px-4 py-3 font-medium text-gray-600">סוג</th>
              <th className="px-4 py-3 font-medium text-gray-600">מטפל</th>
              <th className="px-4 py-3 font-medium text-gray-600">סטטוס</th>
              <Th onClick={() => toggleSort("opened_date")}>תאריך פתיחה</Th>
              <th className="px-4 py-3 font-medium text-gray-600">דגלים</th>
              <th className="px-4 py-3 font-medium text-gray-600">מעקב</th>
              <th className="px-4 py-3 font-medium text-gray-600">
                הערת מנהל
              </th>
              <Th onClick={() => toggleSort("last_touched_at")}>
                נגיעה אחרונה
              </Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const stuck = isCaseStuck(c.last_touched_at);
              const sync = syncStatus[c.id];
              return (
                <tr key={c.id} className="border-b border-gray-100">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {c.case_number}
                  </td>
                  <td className="px-4 py-3">{c.case_name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.case_type ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.handler?.full_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.status ?? "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                    {formatDate(c.opened_date)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {FLAG_DEFS.map((f) => (
                        <label
                          key={f.key}
                          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                            c[f.key]
                              ? "border-red-300 bg-red-50 text-red-700"
                              : "border-gray-200 text-gray-400"
                          } ${canEdit ? "cursor-pointer" : ""}`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={c[f.key]}
                            disabled={!canEdit}
                            onChange={(e) =>
                              updateCase(c.id, f.key, e.target.checked)
                            }
                          />
                          {f.label}
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={c.manager_follow_up}
                      disabled={!canEdit}
                      onChange={(e) =>
                        updateCase(c.id, "manager_follow_up", e.target.checked)
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      defaultValue={c.manager_note ?? ""}
                      disabled={!canEdit}
                      placeholder={canEdit ? "הערה..." : ""}
                      onBlur={(e) =>
                        e.target.value !== (c.manager_note ?? "") &&
                        updateCase(c.id, "manager_note", e.target.value)
                      }
                      className="w-full rounded-md border border-transparent px-2 py-1 text-sm focus:border-gray-300 focus:outline-none disabled:bg-transparent"
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">
                        {formatDate(c.last_touched_at)}
                      </span>
                      {stuck && (
                        <span
                          title="לא טופל מעל 30 יום"
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
                        >
                          תיק תקוע
                        </span>
                      )}
                      <SyncBadge sync={sync} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                  לא נמצאו תיקים
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SyncBadge({ sync }: { sync?: SyncStatus }) {
  if (!sync) return null;
  if (sync.phase === "saving") {
    return <span className="text-xs text-gray-400">שומר…</span>;
  }
  if (sync.phase === "success") {
    return (
      <span className="text-xs text-green-700" title={sync.message}>
        מסונכרן
      </span>
    );
  }
  if (sync.phase === "warning") {
    return (
      <span
        className="text-xs text-amber-700"
        title={sync.message ?? "אזהרה מהסנכרון"}
      >
        אזהרת סנכרון
      </span>
    );
  }
  return (
    <span className="text-xs text-red-600" title={sync.message}>
      כשל בסנכרון
    </span>
  );
}

function Th({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className="cursor-pointer px-4 py-3 font-medium text-gray-600 hover:text-gray-900"
    >
      {children}
    </th>
  );
}
