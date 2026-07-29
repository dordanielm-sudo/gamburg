import type { ApprovalRequestWithNames } from "@/types/database";

type StepState = "done" | "current" | "rejected" | "future";

const CIRCLE_STYLE: Record<StepState, string> = {
  done: "bg-emerald-600 text-white",
  current: "bg-blue-600 text-white",
  rejected: "bg-rose-600 text-white",
  future: "border-2 border-gray-300 bg-white text-gray-400",
};

const CONNECTOR_STYLE: Record<StepState, string> = {
  done: "bg-emerald-400",
  current: "bg-blue-300",
  rejected: "bg-rose-400",
  future: "bg-gray-200",
};

function reviewState(status: ApprovalRequestWithNames["status"]): StepState {
  return status === "pending_review" ? "current" : "done";
}

function approvalState(status: ApprovalRequestWithNames["status"]): StepState {
  if (status === "approved") return "done";
  if (status === "rejected") return "rejected";
  if (status === "pending_approval") return "current";
  return "future";
}

export function ApprovalFlow({ request }: { request: ApprovalRequestWithNames }) {
  const step2 = reviewState(request.status);
  const step3 = approvalState(request.status);

  const steps: { title: string; subtitle: string | null; state: StepState }[] = [
    {
      title: "הוגש ע״י מטפל",
      subtitle: request.submitted_by_profile?.full_name ?? null,
      state: "done",
    },
    {
      title: "בדיקת עו״ד",
      subtitle: request.reviewed_by_profile?.full_name ?? (step2 === "current" ? "ממתין לבדיקה" : null),
      state: step2,
    },
    {
      title: "אישור סופי מנהל",
      subtitle:
        request.status === "rejected"
          ? `נדחה${request.approved_by_profile?.full_name ? ` ע״י ${request.approved_by_profile.full_name}` : ""}`
          : request.approved_by_profile?.full_name ?? (step3 === "current" ? "ממתין לאישור" : null),
      state: step3,
    },
  ];

  return (
    <div className="flex items-start">
      {steps.map((s, i) => (
        <div key={s.title} className="flex flex-1 items-start last:flex-none">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${CIRCLE_STYLE[s.state]}`}
            >
              {s.state === "done" ? "✓" : s.state === "rejected" ? "✕" : i + 1}
            </div>
            <div className="w-24 text-xs font-semibold text-gray-800">{s.title}</div>
            {s.subtitle && (
              <div className="w-24 text-[11px] leading-tight text-gray-500">{s.subtitle}</div>
            )}
          </div>
          {i < steps.length - 1 && (
            <div className={`mt-4 h-0.5 flex-1 ${CONNECTOR_STYLE[steps[i + 1].state]}`} />
          )}
        </div>
      ))}
    </div>
  );
}
