"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function requireManager() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "manager") {
    throw new Error("only a manager may perform this action");
  }

  return supabase;
}

export async function updateWebhookValue(key: string, value: string) {
  const supabase = await requireManager();

  const { error } = await supabase
    .from("webhook_configs")
    .update({ value: value.trim() || null })
    .eq("key", key);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/webhooks");
}
