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

export async function addColumnPreset(
  caseType: string,
  pageName: string,
  fieldName: string,
  displayOrder: number,
) {
  const supabase = await requireManager();

  const { error } = await supabase.from("case_type_column_presets").insert({
    case_type: caseType.trim(),
    page_name: pageName.trim(),
    field_name: fieldName.trim(),
    display_order: displayOrder,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/case-columns");
  revalidatePath("/cases");
}

export async function deleteColumnPreset(id: string) {
  const supabase = await requireManager();

  const { error } = await supabase
    .from("case_type_column_presets")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/case-columns");
  revalidatePath("/cases");
}
