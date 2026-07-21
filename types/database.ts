// Hand-written to match supabase/migrations/*.sql. Once the project is
// linked to a real Supabase instance, these can be regenerated/checked
// against `supabase gen types typescript`.

export type UserRole = "manager" | "handler" | "secretary";
export type TaskStatus = "open" | "done" | "cancelled";
export type NotificationType = "new_task" | "new_document" | "stuck_case";
export type WebhookStatus = "pending" | "success" | "failure" | "warning";
export type HearingStatus = "scheduled" | "held" | "postponed" | "cancelled";
export type DocumentStatus = "pending" | "received" | "missing";

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
  team: string | null;
  last_touched_at: string;
  created_at: string;
  updated_at: string;
}

export interface CaseWithHandler extends Case {
  handler: Pick<Profile, "id" | "full_name"> | null;
}

export interface Hearing {
  id: string;
  case_id: string;
  court: string | null;
  judge: string | null;
  hearing_type: string | null;
  hearing_at: string;
  status: HearingStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseDocument {
  id: string;
  case_id: string;
  title: string;
  doc_type: string | null;
  status: DocumentStatus;
  doc_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseDeadline {
  id: string;
  case_id: string;
  label: string;
  due_date: string;
  status: TaskStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseDeadlineWithCase extends CaseDeadline {
  case: Pick<CaseWithHandler, "id" | "case_number" | "case_name" | "handler"> | null;
}

// a deadline is "urgent" once it's due within this many days (or already overdue)
export const DEADLINE_SOON_DAYS = 3;

export function deadlineUrgency(
  dueDate: string,
  status: TaskStatus,
): "overdue" | "soon" | "normal" | "done" {
  if (status === "done") return "done";
  const days = Math.floor(
    (new Date(dueDate + "T00:00:00").getTime() - new Date().setHours(0, 0, 0, 0)) /
      (24 * 60 * 60 * 1000),
  );
  if (days < 0) return "overdue";
  if (days <= DEADLINE_SOON_DAYS) return "soon";
  return "normal";
}

export interface Task {
  id: string;
  text: string;
  created_by: string;
  assigned_to: string;
  case_id: string | null;
  status: TaskStatus;
  source_task_id: string | null;
  start_date: string | null;
  due_date: string | null;
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

export interface CaseSyncLogEntry {
  id: string;
  case_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  webhook_status: WebhookStatus;
  webhook_message: string | null;
  created_at: string;
  responded_at: string | null;
}

export interface TaskWithNames extends Task {
  assigned_to_profile: Pick<Profile, "id" | "full_name"> | null;
  created_by_profile: Pick<Profile, "id" | "full_name"> | null;
  case: Pick<Case, "id" | "case_number" | "case_name"> | null;
}

// section 4.4: no touch for 30+ days
export const STUCK_CASE_DAYS = 30;

export function isCaseStuck(lastTouchedAt: string): boolean {
  const ageMs = Date.now() - new Date(lastTouchedAt).getTime();
  return ageMs > STUCK_CASE_DAYS * 24 * 60 * 60 * 1000;
}
