"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";
import { NotificationBell } from "@/components/notification-bell";

const ROLE_LABELS: Record<string, string> = {
  manager: "מנהלת",
  handler: "מטפל/ת",
  secretary: "מזכירה",
};

const ROLE_BADGE: Record<string, string> = {
  manager: "bg-blue-50 text-blue-700",
  handler: "bg-emerald-50 text-emerald-700",
  secretary: "bg-amber-50 text-amber-700",
};

function initials(name: string) {
  return name.trim().slice(0, 2);
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
        active ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-200"
      }`}
    >
      {children}
    </Link>
  );
}

export function AppHeader({
  fullName,
  role,
  title,
  userId,
}: {
  fullName: string;
  role: string;
  title: string;
  userId: string;
}) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3">
        <div className="leading-tight">
          <div className="text-lg font-bold text-gray-900">
            CRM <span className="text-blue-600">גמבורג</span>
          </div>
          <div className="text-xs text-gray-400">מערכת ניהול תיקים</div>
        </div>

        <nav className="flex items-center gap-1 rounded-full bg-gray-100 p-1">
          <NavLink href="/cases">ניהול תיקים</NavLink>
          <NavLink href="/deadlines">מועדים</NavLink>
          <NavLink href="/tasks">משימות</NavLink>
          {role === "manager" && (
            <>
              <NavLink href="/dashboard">דשבורד</NavLink>
              <NavLink href="/dashboard/users">משתמשים</NavLink>
            </>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <NotificationBell userId={userId} />
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
              {initials(fullName)}
            </div>
            <div className="text-sm leading-tight">
              <div className="font-medium text-gray-900">{fullName}</div>
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  ROLE_BADGE[role] ?? "bg-gray-100 text-gray-600"
                }`}
              >
                {ROLE_LABELS[role] ?? role}
              </span>
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="text-sm text-gray-400 hover:text-gray-700"
            >
              התנתקות
            </button>
          </form>
        </div>
      </div>
      <div className="border-t border-gray-100 bg-gray-50/60 px-6 py-2 text-sm font-medium text-gray-500">
        {title}
      </div>
    </header>
  );
}
