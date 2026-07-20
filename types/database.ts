// Hand-written to match supabase/migrations/*.sql. Once the project is
// linked to a real Supabase instance, these can be regenerated/checked
// against `supabase gen types typescript`.

export type UserRole = "manager" | "handler" | "secretary";
export type TaskStatus = "open" | "done";
export type NotificationType = "new_task" | "new_document" | "stuck_case";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Case {
  id: string;
  case_number: string;
  case_name: string;
  opened_date: string | null;
  case_type: string | null;
  case_nature: string | null;
  handler_id: string | null;
  external_ref: string | null;
  status: string | null;
  client_id_number: string | null;
  client_phone: string | null;
  spouse_details: Record<string, unknown> | null;
  source_updated_at: string | null;
  flag_problematic_client: boolean;
  flag_non_paying: boolean;
  flag_transferring_documents: boolean;
  manager_note: string | null;
  manager_follow_up: boolean;
  last_touched_at: string;
  created_at: string;
  updated_at: string;
}

export interface CaseWithHandler extends Case {
  handler: Pick<Profile, "id" | "full_name"> | null;
}

export interface Task {
  id: string;
  text: string;
  created_by: string;
  assigned_to: string;
  case_id: string | null;
  status: TaskStatus;
  created_at: string;
  completed_at: string | null;
}

export interface Notification {
  id: string;
  type: NotificationType;
  user_id: string;
  case_id: string | null;
  task_id: string | null;
  title: string | null;
  body: string | null;
  is_read: boolean;
  created_at: string;
}

// section 4.4: no touch for 30+ days
export const STUCK_CASE_DAYS = 30;

export function isCaseStuck(lastTouchedAt: string): boolean {
  const ageMs = Date.now() - new Date(lastTouchedAt).getTime();
  return ageMs > STUCK_CASE_DAYS * 24 * 60 * 60 * 1000;
}
