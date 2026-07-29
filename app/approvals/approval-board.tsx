"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { ApprovalRequestWithNames, ApprovalStatus, Case } from "@/types/database";
import { CaseCombobox } from "@/components/case-combobox";

const STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending_review: "ממתין לבדיקת עו״ד",
  pending_approval: "ממתין לאישור מנהל",
  approved: "אושר",
  rejected: "נדחה",
};

const STATUS_BADGE: Record<ApprovalStatus, string> = {
  pending_review: "bg-amber-50 text-amber-700",
  pending_approval: "bg-blue-50 text-blue-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-700",
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
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(requests);
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "">("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createCaseId, setCreateCaseId] = useState("");
  const [createCaseText, setCreateCaseText] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = useMemo(
    () => (statusFilter ? rows.filter((r) => r.status === statusFilter) : rows),
    [rows, statusFilter],
  );

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
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
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
          onChange={(e) => setStatusFilter(e.target.value as ApprovalStatus | "")}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">סטטוס: הכל</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <span className="mr-auto rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          {filtered.length} בקשות
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
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_BADGE[r.status]}`}
                >
                  {STATUS_LABELS[r.status]}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                {r.submitted_by_profile?.full_name && (
                  <span>הוגש ע״י: {r.submitted_by_profile.full_name}</span>
                )}
                {r.reviewed_by_profile?.full_name && (
                  <span>נבדק ע״י: {r.reviewed_by_profile.full_name}</span>
                )}
                {r.approved_by_profile?.full_name && (
                  <span>הוכרע ע״י: {r.approved_by_profile.full_name}</span>
                )}
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
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      סמן כנבדק ע״י עו״ד
                    </button>
                  )}
                  {r.status === "pending_approval" && isManager && (
                    <>
                      <button
                        onClick={() => decide(r, true)}
                        disabled={pendingId === r.id}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        אישור
                      </button>
                      <button
                        onClick={() => decide(r, false)}
                        disabled={pendingId === r.id}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
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
