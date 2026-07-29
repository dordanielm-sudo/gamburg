"use client";

import { useState, useTransition } from "react";
import { addTabPermission, removeTabPermission } from "../../actions";
import type { ProfileTabPermission } from "@/types/database";

export function TabPermissionsPanel({
  profileId,
  permissions,
  pageNameOptions,
}: {
  profileId: string;
  permissions: ProfileTabPermission[];
  pageNameOptions: string[];
}) {
  const [pageName, setPageName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const restricted = permissions.length > 0;

  function handleAdd() {
    setError(null);
    if (!pageName.trim()) {
      setError("יש לבחור או להקליד חוצץ");
      return;
    }
    startTransition(async () => {
      try {
        await addTabPermission(profileId, pageName);
        setPageName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בהוספה");
      }
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      try {
        await removeTabPermission(id, profileId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בהסרה");
      }
    });
  }

  return (
    <section className="max-w-xl rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 font-semibold text-gray-900">הרשאות חוצצים</h2>
      <p className="mb-4 text-xs text-gray-400">
        כברירת מחדל המשתמש רואה את כל החוצצים. ברגע שמוסיפים חוצץ אחד לרשימה
        למטה, המשתמש יראה <strong>רק</strong> את החוצצים שברשימה.
      </p>

      {restricted ? (
        <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          מוגבל - רואה רק את החוצצים המפורטים למטה
        </div>
      ) : (
        <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          ללא הגבלה - רואה את כל החוצצים
        </div>
      )}

      {permissions.length > 0 && (
        <ul className="mb-4 space-y-1.5">
          {permissions.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm"
            >
              <span className="font-medium text-gray-900">{p.page_name}</span>
              <button
                onClick={() => handleRemove(p.id)}
                disabled={pending}
                className="text-xs text-rose-600 hover:text-rose-800 hover:underline"
              >
                הסרה
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-4">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs text-gray-500">
            הוספת חוצץ מותר
          </label>
          <input
            list="page-name-options"
            value={pageName}
            onChange={(e) => setPageName(e.target.value)}
            placeholder="למשל: חדל&quot;פ"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <datalist id="page-name-options">
            {pageNameOptions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <button
          onClick={handleAdd}
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "מוסיף..." : "הוספה"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
