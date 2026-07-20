import { logout } from "@/app/login/actions";

const ROLE_LABELS: Record<string, string> = {
  manager: "מנהלת",
  handler: "מטפל/ת",
  secretary: "מזכירה",
};

export function AppHeader({
  fullName,
  role,
}: {
  fullName: string;
  role: string;
}) {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div>
        <span className="font-semibold">CRM גמבורג</span>
        <span className="mx-3 text-gray-300">|</span>
        <span className="text-sm text-gray-600">ניהול תיקים פתוחים</span>
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
