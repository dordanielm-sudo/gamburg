import Link from "next/link";
import { logout } from "@/app/login/actions";

const ROLE_LABELS: Record<string, string> = {
  manager: "מנהלת",
  handler: "מטפל/ת",
  secretary: "מזכירה",
};

export function AppHeader({
  fullName,
  role,
  title,
}: {
  fullName: string;
  role: string;
  title: string;
}) {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-4">
        <span className="font-semibold whitespace-nowrap">CRM גמבורג</span>
        <nav className="flex items-center gap-3 text-sm text-gray-600">
          <Link href="/cases" className="hover:text-gray-900">
            ניהול תיקים
          </Link>
          {role === "manager" && (
            <>
              <Link href="/dashboard" className="hover:text-gray-900">
                דשבורד
              </Link>
              <Link href="/dashboard/users" className="hover:text-gray-900">
                משתמשים
              </Link>
            </>
          )}
        </nav>
        <span className="text-gray-300">|</span>
        <span className="text-sm text-gray-600">{title}</span>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-600">
          {fullName} ({ROLE_LABELS[role] ?? role})
        </span>
        <form action={logout}>
          <button type="submit" className="text-gray-500 hover:text-gray-900">
            התנתקות
          </button>
        </form>
      </div>
    </header>
  );
}
