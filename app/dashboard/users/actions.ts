"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/database";

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

// avoids visually ambiguous characters (0/O, 1/l/I) since this gets read
// aloud/typed by hand.
const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generateTempPassword(length = 12) {
  return Array.from(
    randomBytes(length),
    (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length],
  ).join("");
}

export interface CreateUserState {
  error?: string;
  createdEmail?: string;
  tempPassword?: string;
}

export async function createUser(
  _prevState: CreateUserState | undefined,
  formData: FormData,
): Promise<CreateUserState> {
  await requireManager();

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "handler") as UserRole;

  if (!fullName || !email) {
    return { error: "יש למלא שם ואימייל" };
  }

  const tempPassword = generateTempPassword();
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/users");
  return { createdEmail: email, tempPassword };
}

// consolidated manager-side edit: full_name goes through the regular
// client (RLS + the profiles_manager_write_all policy already allow a
// manager to update any profile's name; the "self only" column grant from
// migration 0004 is what non-managers are limited by). role/is_active still
// have to go through admin_set_user_status() - see 0004 for why a raw
// UPDATE can't be used for those two columns.
export async function updateUserProfile(
  userId: string,
  fullName: string,
  role: UserRole,
  isActive: boolean,
) {
  const supabase = await requireManager();

  const { error: nameError } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", userId);
  if (nameError) throw new Error(nameError.message);

  const { error } = await supabase.rpc("admin_set_user_status", {
    target_id: userId,
    new_role: role,
    new_active: isActive,
  });
  if (error) throw new Error(error.message);

  // is_active only gates access to our tables via RLS - also disable/enable
  // the actual Supabase Auth login so a deactivated user can't sign in at all.
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, {
    ban_duration: isActive ? "none" : "876000h",
  });

  revalidatePath("/dashboard/users");
  revalidatePath(`/dashboard/users/${userId}`);
}

export interface ResetPasswordState {
  error?: string;
  tempPassword?: string;
}

// same "temp password, shown once, relayed manually" pattern as createUser -
// no outbound email dependency, matches how the office already hands out
// credentials for new accounts.
export async function resetUserPassword(
  userId: string,
): Promise<ResetPasswordState> {
  await requireManager();

  const tempPassword = generateTempPassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: tempPassword,
  });
  if (error) return { error: error.message };

  return { tempPassword };
}

export async function addTabPermission(profileId: string, pageName: string) {
  const supabase = await requireManager();

  const { error } = await supabase.from("profile_tab_permissions").insert({
    profile_id: profileId,
    page_name: pageName.trim(),
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/users/${profileId}`);
}

export async function removeTabPermission(id: string, profileId: string) {
  const supabase = await requireManager();

  const { error } = await supabase
    .from("profile_tab_permissions")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/dashboard/users/${profileId}`);
}
