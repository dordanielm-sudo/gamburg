"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CaseTypeColumnPreset } from "@/types/database";

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

// swaps display_order with the adjacent preset (within the same case_type)
// to move a column up/down one position - same pattern as case-stages
export async function moveColumnPreset(
  presets: Pick<CaseTypeColumnPreset, "id" | "display_order">[],
  id: string,
  direction: "up" | "down",
) {
  const supabase = await requireManager();

  const ordered = [...presets].sort((a, b) => a.display_order - b.display_order);
  const index = ordered.findIndex((p) => p.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= ordered.length) return;

  const a = ordered[index];
  const b = ordered[swapWith];

  const [{ error: errorA }, { error: errorB }] = await Promise.all([
    supabase
      .from("case_type_column_presets")
      .update({ display_order: b.display_order })
      .eq("id", a.id),
    supabase
      .from("case_type_column_presets")
      .update({ display_order: a.display_order })
      .eq("id", b.id),
  ]);
  if (errorA) throw new Error(errorA.message);
  if (errorB) throw new Error(errorB.message);

  revalidatePath("/dashboard/case-columns");
  revalidatePath("/cases");
}
