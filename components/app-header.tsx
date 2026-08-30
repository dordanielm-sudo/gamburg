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
      // The nav sits on every screen, so leaving prefetch on means every page
      // load warms every other page - and these are the expensive ones. It
      // was measured at seven prefetches per load, twice over (Next refires
      // them when the router tree changes), with דשבורד, מועדים and משימות
      // each taking about a second of server time. That work competed with
      // rendering the screen the user was actually waiting for.
      prefetch={false}
      // shrink-0 keeps a pill at its natural width inside the scrolling strip:
      // without it flex squeezes them all to fit and the labels wrap to two
      // lines rather than the strip scrolling
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
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
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6">
        <div className="leading-tight">
          <div className="text-base font-bold text-gray-900 sm:text-lg">
            CRM <span className="text-blue-600">גמבורג</span>
          </div>
          <div className="text-xs text-gray-400">מערכת ניהול תיקים</div>
        </div>

        {/* Seven pills of Hebrew text are wider than a phone, and they cannot
            wrap without the labels breaking mid-word - so below lg the nav
            takes a row of its own and scrolls sideways. That row is the one
            thing that used to push the whole page wider than the screen, which
            is what made every screen render zoomed out on a phone. */}
        <nav className="scroll-strip order-last w-full overflow-x-auto lg:order-none lg:w-auto">
          <div className="flex w-max items-center gap-1 rounded-full bg-gray-100 p-1">
          <NavLink href="/cases">ניהול תיקים</NavLink>
          <NavLink href="/deadlines">מועדים</NavLink>
          <NavLink href="/tasks">משימות</NavLink>
          <NavLink href="/approvals">בקרה ואישורים</NavLink>
          {role === "manager" && (
            <>
              <NavLink href="/dashboard">דשבורד</NavLink>
              <NavLink href="/dashboard/users">משתמשים</NavLink>
              <NavLink href="/dashboard/webhooks">וובהוקים</NavLink>
            </>
          )}
          </div>
        </nav>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <NotificationBell userId={userId} />
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
              {initials(fullName)}
            </div>
            <div className="min-w-0 text-sm leading-tight">
              {/* a long name would otherwise widen this block past the screen */}
              <div className="truncate font-medium text-gray-900">{fullName}</div>
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
              className="shrink-0 text-sm whitespace-nowrap text-gray-400 hover:text-gray-700"
            >
              התנתקות
            </button>
          </form>
        </div>
      </div>
      <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-2 text-sm font-medium text-gray-500 sm:px-6">
        {title}
      </div>
    </header>
  );
}
