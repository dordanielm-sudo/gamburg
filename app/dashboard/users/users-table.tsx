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

// Auto-created profiles carry a deliberately undeliverable address under
// .invalid (see lib/handler-resolution.ts). Printing it would read as a real
// address nobody recognises, so it says what it is instead - this is the one
// column where "no email" is the useful fact.
const PLACEHOLDER_EMAIL_SUFFIX = "@no-login.invalid";

function UserEmail({ email }: { email: string | null }) {
  if (!email || email.endsWith(PLACEHOLDER_EMAIL_SUFFIX)) {
    return <span className="text-sm text-gray-400">לא הוגדר</span>;
  }
  return (
    <span dir="ltr" className="block text-right text-sm text-gray-700">
      {email}
    </span>
  );
}

export function UsersTable({
  users,
  emails,
}: {
  users: Profile[];
  // profile id -> the address in auth.users, where email actually lives.
  // Resolved on the server (see page.tsx) because reading it needs the
  // service role, which never reaches a client component.
  emails: Record<string, string | null>;
}) {
  return (
    <section className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-indigo-100 bg-indigo-50/60 text-right">
          <tr>
            <th className="w-1 p-0" aria-hidden />
            <th className="px-4 py-3 font-semibold text-indigo-900">שם</th>
            <th className="px-4 py-3 font-semibold text-indigo-900">אימייל</th>
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
                  <UserEmail email={emails[u.id] ?? null} />
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
