"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateUserProfile } from "../actions";
import type { Profile, UserRole } from "@/types/database";
import { Badge, TONE_HEX } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

const ROLE_LABELS: Record<UserRole, string> = {
  manager: "מנהל/ת",
  handler: "מטפל/ת",
  secretary: "מזכירה",
};

const TONE = "indigo" as const;

export function UserEditForm({ user, email }: { user: Profile; email: string }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(user.full_name);
  const [emailValue, setEmailValue] = useState(email);
  const [role, setRole] = useState<UserRole>(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty =
    fullName !== user.full_name ||
    emailValue !== email ||
    role !== user.role ||
    isActive !== user.is_active;

  function handleSave() {
    setError(null);
    setSaved(false);
    if (!fullName.trim()) {
      setError("שם מלא לא יכול להיות ריק");
      return;
    }
    if (!emailValue.trim()) {
      setError("אימייל לא יכול להיות ריק");
      return;
    }
    startTransition(async () => {
      try {
        await updateUserProfile(user.id, fullName.trim(), emailValue.trim(), role, isActive);
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בשמירה");
      }
    });
  }

  return (
    <section
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      style={{ boxShadow: `inset -3px 0 0 0 ${TONE_HEX[TONE]}` }}
    >
      <Badge tone={TONE} dot>
        פרטי משתמש
      </Badge>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs text-gray-500">שם מלא</label>
          <input
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setSaved(false);
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">אימייל</label>
          <input
            type="email"
            value={emailValue}
            onChange={(e) => {
              setEmailValue(e.target.value);
              setSaved(false);
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">תפקיד</label>
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value as UserRole);
              setSaved(false);
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">סטטוס</label>
          <label className="flex h-[38px] items-center gap-2 rounded-md border border-gray-300 px-3 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => {
                setIsActive(e.target.checked);
                setSaved(false);
              }}
              className="h-4 w-4 accent-blue-600"
            />
            {isActive ? "פעיל" : "מושבת"}
          </label>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={pending || !dirty}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending && <Spinner className="h-4 w-4" />}
          {pending ? "שומר..." : "שמירה"}
        </button>
        {saved && !dirty && (
          <Badge tone="green">נשמר בהצלחה</Badge>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
