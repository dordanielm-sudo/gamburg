"use client";

import { useState, useTransition } from "react";
import { resetUserPassword } from "../actions";
import { Badge, TONE_HEX } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

const TONE = "amber" as const;

export function ResetPasswordPanel({
  userId,
  userFullName,
}: {
  userId: string;
  userFullName: string;
}) {
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleReset() {
    if (
      !confirm(
        `לאפס את הסיסמה של ${userFullName}? הסיסמה הנוכחית תפסיק לעבוד מיד.`,
      )
    ) {
      return;
    }
    setError(null);
    setTempPassword(null);
    startTransition(async () => {
      const result = await resetUserPassword(userId);
      if (result.error) setError(result.error);
      else setTempPassword(result.tempPassword ?? null);
    });
  }

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      style={{ boxShadow: `inset -3px 0 0 0 ${TONE_HEX[TONE]}` }}
    >
      <Badge tone={TONE} dot>
        איפוס סיסמה
      </Badge>
      <p className="mt-2 mb-4 text-xs text-gray-400">
        יוצר סיסמה זמנית חדשה במקום הסיסמה הנוכחית - יש להעביר אותה למשתמש
        ידנית (מוצגת פעם אחת בלבד).
      </p>

      <button
        onClick={handleReset}
        disabled={pending}
        className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
      >
        {pending && <Spinner className="h-4 w-4" />}
        {pending ? "מאפס..." : "איפוס סיסמה"}
      </button>

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {tempPassword && (
        <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          הסיסמה אופסה. הסיסמה הזמנית (מוצגת פעם אחת - יש להעביר ידנית):
          <div className="mt-1 font-mono text-base">{tempPassword}</div>
        </div>
      )}
    </section>
  );
}
