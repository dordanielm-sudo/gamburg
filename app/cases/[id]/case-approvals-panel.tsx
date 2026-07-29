import Link from "next/link";
import type { ApprovalRequestWithNames, ApprovalStatus } from "@/types/database";
import { Badge, TONE_HEX, type Tone } from "@/components/ui/badge";
import { NamedAvatar } from "@/components/ui/avatar";

const PANEL_TONE: Tone = "purple";

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

export function CaseApprovalsPanel({
  requests,
}: {
  requests: ApprovalRequestWithNames[];
}) {
  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      style={{ boxShadow: `inset -3px 0 0 0 ${TONE_HEX[PANEL_TONE]}` }}
    >
      <Badge tone={PANEL_TONE} dot>
        בקרה ואישורים ({requests.length})
      </Badge>
      <div className="mt-3">
        {requests.length === 0 ? (
          <p className="text-sm text-gray-400">אין בקשות אישור לתיק זה</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {requests.map((r) => (
              <li key={r.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {r.request_type}
                  </span>
                  <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                </div>
                {r.submitted_by_profile?.full_name && (
                  <div className="mt-1">
                    <NamedAvatar
                      name={r.submitted_by_profile.full_name}
                      size="h-5 w-5 text-[9px]"
                      className="text-xs text-gray-500"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/approvals"
          className="mt-3 inline-block text-sm text-blue-600 hover:underline"
        >
          לניהול מלא של בקרה ואישורים
        </Link>
      </div>
    </section>
  );
}
