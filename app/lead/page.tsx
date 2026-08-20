import type { Metadata } from "next";
import { LeadForm } from "./lead-form";

// Public page - opened as a Telegram Mini App from the firm's bot, by people
// who have no CRM account. proxy.ts's matcher excludes /lead so the session
// check there does not bounce them to /login. Setup (BotFather, Make, the
// env vars): docs/telegram-lead-form.md.
export const metadata: Metadata = {
  title: "השארת פרטים - משרד עו״ד חנה גמבורג",
  description: "טופס יצירת קשר",
  robots: { index: false, follow: false },
};

export default function LeadPage() {
  return <LeadForm />;
}
