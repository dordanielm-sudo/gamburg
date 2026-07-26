import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { AppHeader } from "@/components/app-header";
import { WebhooksPanel } from "./webhooks-panel";
import type { WebhookConfig, WebhookLog } from "@/types/database";

export default async function WebhooksPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager") redirect("/cases");

  const supabase = await createClient();
  const [{ data: configs, error: configsError }, { data: logs }] =
    await Promise.all([
      supabase
        .from("webhook_configs")
        .select("*")
        .order("direction")
        .returns<WebhookConfig[]>(),
      supabase
        .from("webhook_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300)
        .returns<WebhookLog[]>(),
    ]);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <AppHeader
        fullName={profile.full_name}
        role={profile.role}
        userId={profile.id}
        title="וובהוקים - איזור מפתחים"
      />
      <main className="flex-1 p-6">
        {configsError ? (
          <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            שגיאה בטעינה: {configsError.message}
          </p>
        ) : (
          <WebhooksPanel configs={configs ?? []} logs={logs ?? []} />
        )}
      </main>
    </div>
  );
}
