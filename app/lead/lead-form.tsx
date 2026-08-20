"use client";

import { useCallback, useRef, useState } from "react";
import Script from "next/script";
import { Spinner } from "@/components/ui/spinner";

// Only the slice of the Telegram Mini App SDK this page uses. The real
// object has dozens of members; typing what we touch keeps the compiler
// honest without vendoring a whole .d.ts for a single screen.
interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: {
    user?: { first_name?: string; last_name?: string; username?: string };
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

type Status = "idle" | "sending" | "sent" | "error";

// Telegram paints the Mini App's chrome from the user's theme and exposes it
// as CSS variables. Falling back to the CRM's own palette keeps the page
// readable when it is opened in a plain browser, where those vars are unset.
const surface = {
  backgroundColor: "var(--tg-theme-bg-color, #f9fafb)",
  color: "var(--tg-theme-text-color, #111827)",
};
const card = {
  backgroundColor: "var(--tg-theme-secondary-bg-color, #ffffff)",
  color: "var(--tg-theme-text-color, #111827)",
};
const submit = {
  backgroundColor: "var(--tg-theme-button-color, #2563eb)",
  color: "var(--tg-theme-button-text-color, #ffffff)",
};
const hint = { color: "var(--tg-theme-hint-color, #6b7280)" };

export function LeadForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  // The SDK is loaded by <Script>, so it is not there on first render.
  const webApp = useRef<TelegramWebApp | null>(null);

  const initTelegram = useCallback(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    webApp.current = tg;
    tg.ready();
    tg.expand();

    // Telegram already knows their name - asking for it again is a form
    // field they can delete if it is wrong, not one they must fill in.
    const user = tg.initDataUnsafe?.user;
    const fullName = [user?.first_name, user?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (fullName) setName((current) => current || fullName);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;

    setStatus("sending");
    setError(null);

    try {
      const response = await fetch("/api/telegram-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          // Signed by Telegram; the server checks it against the bot token.
          // Empty outside Telegram, and the server refuses those.
          init_data: webApp.current?.initData ?? "",
        }),
      });
      const body: { status?: string; message?: string } = await response
        .json()
        .catch(() => ({}));

      if (!response.ok || body.status !== "success") {
        // The server's message names the real fault (a Make scenario with no
        // response module, an unconfigured bot token) - useful in the
        // console, not to someone who came here to leave a phone number.
        console.error("lead submit failed", response.status, body);
        setStatus("error");
        setError(
          response.status === 400 && body.message
            ? body.message
            : "אירעה שגיאה בשליחת הפרטים. נסו שוב בעוד רגע.",
        );
        return;
      }

      setStatus("sent");
      // Closing is the Telegram-native "done". Outside Telegram there is no
      // window to close, so the thank-you state below is what they see.
      webApp.current?.close();
    } catch {
      setStatus("error");
      setError("אירעה שגיאה בשליחת הפרטים. נסו שוב בעוד רגע.");
    }
  }

  return (
    <main
      className="flex flex-1 items-center justify-center px-4 py-8"
      style={surface}
    >
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onReady={initTelegram}
      />

      <div
        className="w-full max-w-sm rounded-2xl p-6 shadow-sm ring-1 ring-black/5"
        style={card}
      >
        {status === "sent" ? (
          <>
            <h1 className="mb-2 text-xl font-bold">תודה!</h1>
            <p className="text-sm" style={hint}>
              הפרטים התקבלו, נחזור אליכם בהקדם.
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h1 className="mb-1 text-xl font-bold">נשמח להכיר</h1>
            <p className="mb-6 text-sm" style={hint}>
              השאירו פרטים ונחזור אליכם בהקדם.
            </p>

            <label htmlFor="lead-name" className="mb-1 block text-sm font-medium">
              שם מלא
            </label>
            <input
              id="lead-name"
              name="name"
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mb-4 w-full rounded-lg border border-gray-300 bg-white/70 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />

            <label htmlFor="lead-phone" className="mb-1 block text-sm font-medium">
              מספר טלפון
            </label>
            <input
              id="lead-phone"
              name="phone"
              type="tel"
              required
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mb-4 w-full rounded-lg border border-gray-300 bg-white/70 px-3 py-2 text-start text-sm text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />

            {error && (
              <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={status === "sending"}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold disabled:opacity-60"
              style={submit}
            >
              {status === "sending" && <Spinner className="h-4 w-4" />}
              {status === "sending" ? "שולח..." : "שליחת פרטים"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
