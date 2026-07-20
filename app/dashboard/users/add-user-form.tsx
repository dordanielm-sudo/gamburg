"use client";

import { useActionState } from "react";
import { createUser, type CreateUserState } from "./actions";

const initialState: CreateUserState = {};

export function AddUserForm() {
  const [state, formAction, pending] = useActionState(
    createUser,
    initialState,
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold">הוספת משתמש</h2>

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-gray-500">שם מלא</label>
          <input
            name="full_name"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">אימייל</label>
          <input
            name="email"
            type="email"
            required
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">תפקיד</label>
          <select
            name="role"
            defaultValue="handler"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          >
            <option value="manager">מנהל/ת</option>
            <option value="handler">מטפל/ת</option>
            <option value="secretary">מזכירה</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "מוסיף..." : "הוספה"}
        </button>
      </form>

      {state?.error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      {state?.tempPassword && (
        <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          משתמש נוצר עבור <strong>{state.createdEmail}</strong>. הסיסמה
          הזמנית (מוצגת פעם אחת - יש להעביר ידנית):
          <div className="mt-1 font-mono text-base">{state.tempPassword}</div>
        </div>
      )}
    </section>
  );
}
