"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CaseTypeStage } from "@/types/database";

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

export async function addStage(
  caseType: string,
  stageName: string,
  displayOrder: number,
) {
  const supabase = await requireManager();

  const { error } = await supabase.from("case_type_stages").insert({
    case_type: caseType.trim(),
    stage_name: stageName.trim(),
    display_order: displayOrder,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/case-stages");
  revalidatePath("/cases");
}

export async function deleteStage(id: string) {
  const supabase = await requireManager();

  const { error } = await supabase
    .from("case_type_stages")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/case-stages");
  revalidatePath("/cases");
}

// swaps display_order with the adjacent stage (within the same case_type)
// to move a stage up/down one position in the sequence
export async function moveStage(
  stages: Pick<CaseTypeStage, "id" | "display_order">[],
  id: string,
  direction: "up" | "down",
) {
  const supabase = await requireManager();

  const ordered = [...stages].sort((a, b) => a.display_order - b.display_order);
  const index = ordered.findIndex((s) => s.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= ordered.length) return;

  const a = ordered[index];
  const b = ordered[swapWith];

  const [{ error: errorA }, { error: errorB }] = await Promise.all([
    supabase
      .from("case_type_stages")
      .update({ display_order: b.display_order })
      .eq("id", a.id),
    supabase
      .from("case_type_stages")
      .update({ display_order: a.display_order })
      .eq("id", b.id),
  ]);
  if (errorA) throw new Error(errorA.message);
  if (errorB) throw new Error(errorB.message);

  revalidatePath("/dashboard/case-stages");
  revalidatePath("/cases");
}
