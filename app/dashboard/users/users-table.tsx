import Link from "next/link";
import type { Profile, UserRole } from "@/types/database";
import { Badge, TONE_HEX, type Tone } from "@/components/ui/badge";
import { NamedAvatar } from "@/components/ui/avatar";

const ROLE_LABELS: Record<UserRole, string> = {
  manager: "מנהל/ת",
  handler: "מטפל/ת",
  secretary: "מזכירה",
};

const ROLE_TONE: Record<UserRole, Tone> = {
  manager: "indigo",
  handler: "blue",
  secretary: "purple",
};

export function UsersTable({ users }: { users: Profile[] }) {
  return (
    <section className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-indigo-100 bg-indigo-50/60 text-right">
          <tr>
            <th className="w-1 p-0" aria-hidden />
            <th className="px-4 py-3 font-semibold text-indigo-900">שם</th>
            <th className="px-4 py-3 font-semibold text-indigo-900">תפקיד</th>
            <th className="px-4 py-3 font-semibold text-indigo-900">סטטוס</th>
            <th className="px-4 py-3 font-semibold text-indigo-900"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const rowTone = u.is_active ? ROLE_TONE[u.role] : "gray";
            return (
              <tr
                key={u.id}
                className="border-b border-gray-100 transition-colors hover:bg-gray-50/60"
                style={{ boxShadow: `inset -3px 0 0 0 ${TONE_HEX[rowTone]}` }}
              >
                <td className="w-1 p-0" aria-hidden />
                <td className="px-4 py-3.5">
                  <Link
                    prefetch={false}
                    href={`/dashboard/users/${u.id}`}
                    className="hover:text-blue-700 hover:underline"
                  >
                    <NamedAvatar name={u.full_name} />
                  </Link>
                </td>
                <td className="px-4 py-3.5">
                  <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <Badge tone={u.is_active ? "green" : "gray"}>
                      {u.is_active ? "פעיל" : "מושבת"}
                    </Badge>
                    {u.auto_created && (
                      <span title="נוצר אוטומטית מסנכרון - טרם הוגדר אימייל אמיתי">
                        <Badge tone="amber">טרם הוזן אימייל</Badge>
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-left">
                  <Link
                    prefetch={false}
                    href={`/dashboard/users/${u.id}`}
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    פתיחת כרטיס ←
                  </Link>
                </td>
              </tr>
            );
          })}
          {users.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                אין משתמשים
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
