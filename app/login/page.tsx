import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <form
        action={login}
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm"
      >
        <h1 className="mb-1 text-xl font-semibold">CRM גמבורג</h1>
        <p className="mb-6 text-sm text-gray-500">כניסה למערכת</p>

        <label className="mb-1 block text-sm font-medium text-gray-700">
          אימייל
        </label>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium text-gray-700">
          סיסמה
        </label>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />

        {error && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          התחברות
        </button>
      </form>
    </main>
  );
}
