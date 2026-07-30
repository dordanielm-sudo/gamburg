"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ApprovalRequestWithNames, ApprovalStatus, Case } from "@/types/database";
import { CaseCombobox } from "@/components/case-combobox";
import { Badge, type Tone } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ApprovalFlow } from "@/components/ui/approval-flow";

const STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending_review: "ממתין לבדיקת עו״ד",
  pending_approval: "ממתין לאישור מנהל",
  approved: "אושר",
  rejected: "נדחה",
};

const STATUS_TONE: Record<ApprovalStatus, Tone> = {
  pending_review: "amber",
  pending_approval: "blue",
  approved: "green",
  rejected: "rose",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function ApprovalBoard({
  requests,
  canCreate,
  isManager,
  cases,
  currentUserId,
  currentUserFullName,
}: {
  requests: ApprovalRequestWithNames[];
  canCreate: boolean;
  isManager: boolean;
  cases: Pick<Case, "id" | "case_number" | "case_name">[];
  currentUserId: string;
  currentUserFullName: string;
}) {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(requests);
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "pending" | "">(
    () => (searchParams.get("status") === "pending" ? "pending" : ""),
  );
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createCaseId, setCreateCaseId] = useState("");
  const [createCaseText, setCreateCaseText] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!statusFilter) return rows;
    if (statusFilter === "pending") {
      return rows.filter(
        (r) => r.status === "pending_review" || r.status === "pending_approval",
      );
    }
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  async function handleCreate(formData: FormData) {
    setFormError(null);
    const requestType = String(formData.get("request_type") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim() || null;

    let caseId = createCaseId;
    const manualCaseNumber = createCaseText.trim();
    if (!caseId && manualCaseNumber) {
      const { data: foundCase } = await supabase
        .from("cases")
        .select("id")
        .eq("case_number", manualCaseNumber)
        .maybeSingle();
      if (!foundCase) {
        setFormError(`לא נמצא תיק עם מספר "${manualCaseNumber}"`);
        return;
      }
      caseId = foundCase.id;
    }
    if (!requestType || !caseId) {
      setFormError("יש למלא סוג בקשה ותיק");
      return;
    }

    setCreating(true);
    const { data, error } = await supabase
      .from("approval_requests")
      .insert({
        case_id: caseId,
        request_type: requestType,
        submitted_by: currentUserId,
        notes,
      })
      .select(
        "*, submitted_by_profile:profiles!approval_requests_submitted_by_fkey(id, full_name), reviewed_by_profile:profiles!approval_requests_reviewed_by_fkey(id, full_name), approved_by_profile:profiles!approval_requests_approved_by_fkey(id, full_name), case:cases!approval_requests_case_id_fkey(id, case_number, case_name)",
      )
      .single<ApprovalRequestWithNames>();
    setCreating(false);

    if (error) {
      setFormError(error.message);
      return;
    }
    setRows((prev) => [data, ...prev]);
    setCreateCaseId("");
    setCreateCaseText("");
  }

  async function markReviewed(request: ApprovalRequestWithNames) {
    setPendingId(request.id);
    const { error } = await supabase
      .from("approval_requests")
      .update({ reviewed_by: currentUserId, status: "pending_approval" })
      .eq("id", request.id);
    setPendingId(null);
    if (!error) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === request.id
            ? {
                ...r,
                status: "pending_approval",
                reviewed_by: currentUserId,
                reviewed_by_profile: { id: currentUserId, full_name: currentUserFullName },
              }
            : r,
        ),
      );
    }
  }

  async function decide(request: ApprovalRequestWithNames, approve: boolean) {
    setPendingId(request.id);
    const status: ApprovalStatus = approve ? "approved" : "rejected";
    const { error } = await supabase
      .from("approval_requests")
      .update({ approved_by: currentUserId, status })
      .eq("id", request.id);
    setPendingId(null);
    if (!error) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === request.id
            ? {
                ...r,
                status,
                approved_by: currentUserId,
                approved_by_profile: { id: currentUserId, full_name: currentUserFullName },
              }
            : r,
        ),
      );
    }
  }

  return (
    <div className="space-y-6">
      {canCreate && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">בקשת אישור חדשה</h2>
          <form
            action={handleCreate}
            key={rows.length}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs text-gray-500">
                סוג בקשה
              </label>
              <input
                name="request_type"
                placeholder="למשל: בקשה להחרגת רכב"
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="w-56">
              <CaseCombobox
                cases={cases}
                label="תיק"
                onSelect={(c) => {
                  setCreateCaseId(c.id);
                  setCreateCaseText("");
                }}
                onTextChange={(text) => {
                  setCreateCaseId("");
                  setCreateCaseText(text);
                }}
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs text-gray-500">
                הערה (אופציונלי)
              </label>
              <input
                name="notes"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creating && <Spinner className="h-4 w-4" />}
              {creating ? "שולח..." : "שליחה"}
            </button>
          </form>
          {formError && (
            <p className="mt-2 text-sm text-red-700">{formError}</p>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as ApprovalStatus | "pending" | "")
          }
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">סטטוס: הכל</option>
          <option value="pending">ממתין (לבדיקה או לאישור)</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <span className="mr-auto">
          <Badge tone="indigo">{filtered.length} בקשות</Badge>
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-400 shadow-sm">
          אין בקשות
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="font-medium text-gray-900">
                    {r.request_type}
                  </span>
                  {r.case && (
                    <Link
                      href={`/cases/${r.case.id}`}
                      className="mr-2 text-xs text-blue-600 hover:underline"
                    >
                      {r.case.case_number} - {r.case.case_name}
                    </Link>
                  )}
                </div>
                <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABELS[r.status]}</Badge>
              </div>

              <div className="my-4 overflow-x-auto">
                <ApprovalFlow request={r} />
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>{formatDateTime(r.created_at)}</span>
              </div>
              {r.notes && (
                <div className="mt-1 text-xs text-gray-500">{r.notes}</div>
              )}
              {(r.status === "pending_review" || r.status === "pending_approval") && (
                <div className="mt-3 flex items-center gap-2">
                  {r.status === "pending_review" && (
                    <button
                      onClick={() => markReviewed(r)}
                      disabled={pendingId === r.id}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {pendingId === r.id && <Spinner className="h-3.5 w-3.5" />}
                      סמן כנבדק ע״י עו״ד
                    </button>
                  )}
                  {r.status === "pending_approval" && isManager && (
                    <>
                      <button
                        onClick={() => decide(r, true)}
                        disabled={pendingId === r.id}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {pendingId === r.id && <Spinner className="h-3.5 w-3.5" />}
                        אישור
                      </button>
                      <button
                        onClick={() => decide(r, false)}
                        disabled={pendingId === r.id}
                        className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        {pendingId === r.id && <Spinner className="h-3.5 w-3.5" />}
                        דחייה
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
