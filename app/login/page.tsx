import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center bg-gray-50 px-4">
      <form
        action={login}
        className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-md"
      >
        <h1 className="mb-1 text-xl font-bold text-gray-900">
          CRM <span className="text-blue-600">גמבורג</span>
        </h1>
        <p className="mb-6 text-sm text-gray-500">כניסה למערכת</p>

        <label className="mb-1 block text-sm font-medium text-gray-700">
          אימייל
        </label>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium text-gray-700">
          סיסמה
        </label>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />

        {error && (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          התחברות
        </button>
      </form>
    </main>
  );
}
