"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveOrCreateHandler } from "@/lib/handler-resolution";
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
// UPDATE can't be used for those two columns. email lives only in
// auth.users (profiles has no email column), so it's Admin-API only -
// email_confirm: true sets it immediately with no confirmation-link
// round-trip, same as at account creation.
export async function updateUserProfile(
  userId: string,
  fullName: string,
  email: string,
  role: UserRole,
  isActive: boolean,
  udkanitUserId: number | null,
) {
  const supabase = await requireManager();

  const { error: nameError } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", userId);
  if (nameError) throw new Error(nameError.message);

  // not part of the update above: 0004 granted authenticated UPDATE on
  // full_name only, so touching any other column is refused at the column
  // GRANT regardless of the row policy. Goes through the same kind of
  // manager-checked function role and is_active use (0044).
  const { error: udkanitError } = await supabase.rpc("admin_set_udkanit_user_id", {
    target_id: userId,
    new_id: udkanitUserId,
  });
  if (udkanitError) throw new Error(udkanitError.message);

  const { error } = await supabase.rpc("admin_set_user_status", {
    target_id: userId,
    new_role: role,
    new_active: isActive,
  });
  if (error) throw new Error(error.message);

  // is_active only gates access to our tables via RLS - also disable/enable
  // the actual Supabase Auth login so a deactivated user can't sign in at all.
  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
    ban_duration: isActive ? "none" : "876000h",
  });
  if (authError) throw new Error(authError.message);

  // auto_created (0047) marks a profile the sync provisioned with a
  // placeholder address because handler_name matched nobody yet. Setting a
  // real email here - the same action that gives the account a working
  // login - is exactly the signal that setup is done, so it clears itself
  // rather than needing a separate step. Same column-GRANT trap as
  // udkanit_user_id (0004 only granted `authenticated` write on full_name),
  // so this goes through the admin client rather than a plain update.
  const { error: autoCreatedError } = await admin
    .from("profiles")
    .update({ auto_created: false })
    .eq("id", userId);
  if (autoCreatedError) throw new Error(autoCreatedError.message);

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

export interface BulkHandlerResult {
  name: string;
  status: "created" | "existing" | "error";
  message?: string;
}

// Manual counterpart to the auto-creation in case-sync/task-sync (0047): the
// same resolveOrCreateHandler a sync uses, run here on demand so a manager
// can materialize a batch of known-missing handler_names right now, rather
// than waiting for a sync to touch each one's case or task again.
export async function bulkCreatePendingHandlers(
  names: string[],
): Promise<BulkHandlerResult[]> {
  await requireManager();
  const admin = createAdminClient();

  const unique = Array.from(
    new Set(names.map((n) => n.trim()).filter((n) => n.length > 0)),
  );

  const results: BulkHandlerResult[] = [];
  // one at a time - this is Admin API user creation, not worth parallelizing
  // against for a batch that is, in practice, a handful of names
  for (const name of unique) {
    const resolved = await resolveOrCreateHandler(admin, name);
    if (resolved.error) {
      results.push({ name, status: "error", message: resolved.error });
    } else if (resolved.created) {
      results.push({ name, status: "created" });
    } else {
      results.push({ name, status: "existing" });
    }
  }

  if (results.some((r) => r.status === "created")) {
    revalidatePath("/dashboard/users");
  }
  return results;
}
