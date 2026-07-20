"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserStatus } from "./actions";
import type { Profile, UserRole } from "@/types/database";

const ROLE_LABELS: Record<UserRole, string> = {
  manager: "מנהל/ת",
  handler: "מטפל/ת",
  secretary: "מזכירה",
};

export function UsersTable({ users }: { users: Profile[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function apply(user: Profile, role: UserRole, isActive: boolean) {
    setPendingId(user.id);
    startTransition(async () => {
      try {
        await setUserStatus(user.id, role, isActive);
      } finally {
        setPendingId(null);
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 font-semibold">משתמשים</h2>
      <table className="w-full text-sm">
        <thead className="text-right text-gray-500">
          <tr>
            <th className="py-1">שם</th>
            <th className="py-1">תפקיד</th>
            <th className="py-1">סטטוס</th>
            <th className="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-gray-100">
              <td className="py-1.5">{u.full_name}</td>
              <td className="py-1.5">
                <select
                  value={u.role}
                  disabled={pendingId === u.id}
                  onChange={(e) =>
                    apply(u, e.target.value as UserRole, u.is_active)
                  }
                  className="rounded-md border border-gray-200 bg-transparent px-2 py-1 text-sm"
                >
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-1.5">
                {u.is_active ? (
                  <span className="text-green-700">פעיל</span>
                ) : (
                  <span className="text-gray-400">מושבת</span>
                )}
              </td>
              <td className="py-1.5">
                <button
                  disabled={pendingId === u.id}
                  onClick={() => apply(u, u.role, !u.is_active)}
                  className="text-sm text-gray-500 underline hover:text-gray-900 disabled:opacity-50"
                >
                  {u.is_active ? "השבתה" : "הפעלה"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
