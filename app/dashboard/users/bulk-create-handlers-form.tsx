"use client";

import { useState } from "react";
import {
  bulkCreatePendingHandlers,
  type BulkHandlerResult,
} from "./actions";
import { Badge, TONE_HEX, type Tone } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

const TONE = "amber" as const;

const STATUS_TONE: Record<BulkHandlerResult["status"], Tone> = {
  created: "green",
  existing: "gray",
  error: "rose",
};

const STATUS_LABEL: Record<BulkHandlerResult["status"], string> = {
  created: "נוצר",
  existing: "כבר קיים",
  error: "שגיאה",
};

// One name per line in, one row of outcomes out - the manual counterpart to
// what case-sync/task-sync already do on their own for a handler_name that
// matches nobody. Meant for materializing a batch of already-known-missing
// names right now, rather than waiting for a sync to touch each one's case
// or task again.
export function BulkCreateHandlersForm() {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [results, setResults] = useState<BulkHandlerResult[] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit() {
    const names = text.split("\n");
    if (names.every((n) => !n.trim())) return;
    setPending(true);
    setFormError(null);
    try {
      const outcome = await bulkCreatePendingHandlers(names);
      setResults(outcome);
      setText("");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "שגיאה");
    }
    setPending(false);
  }

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      style={{ boxShadow: `inset -3px 0 0 0 ${TONE_HEX[TONE]}` }}
    >
      <Badge tone={TONE} dot>
        יצירת מטפלים חסרים
      </Badge>
      <p className="mt-2 text-xs text-gray-500">
        שם אחד בכל שורה, בדיוק כמו ש-handler_name מגיע מעדכנית. מי שיש לו
        פרופיל כבר לא ייפגע; מי שאין לו יקבל פרופיל בלי אימייל אמיתי - הוא
        יעבוד בכל מקום בתוך ה-CRM, ורק לא יוכל להתחבר עד שתגדיר לו אימייל
        בכרטיס שלו.
      </p>

      <div className="mt-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder={"אלינור\nאתי וורמן\nגל\n..."}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
        <button
          onClick={handleSubmit}
          disabled={pending || !text.trim()}
          className="mt-2 flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {pending && <Spinner className="h-4 w-4" />}
          {pending ? "יוצר..." : "יצירה"}
        </button>
      </div>

      {formError && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      {results && (
        <ul className="mt-3 space-y-1">
          {results.map((r) => (
            <li key={r.name} className="flex items-center gap-2 text-sm">
              <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              <span className="text-gray-700">{r.name}</span>
              {r.message && (
                <span className="text-xs text-gray-400">{r.message}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
