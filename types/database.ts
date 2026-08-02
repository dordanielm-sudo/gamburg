// Hand-written to match supabase/migrations/*.sql. Once the project is
// linked to a real Supabase instance, these can be regenerated/checked
// against `supabase gen types typescript`.

export type UserRole = "manager" | "handler" | "secretary";
export type TaskStatus = "open" | "done" | "cancelled";
export type NotificationType =
  | "new_task"
  | "new_document"
  | "stuck_case"
  | "task_due_soon"
  | "approval_request_submitted"
  | "approval_request_decided";
export type WebhookStatus = "pending" | "success" | "failure" | "warning";
export type HearingStatus = "scheduled" | "held" | "postponed" | "cancelled";
export type DocumentStatus = "valid" | "in_correction" | "correction_needed";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

// per-user חוצץ visibility (migration 0023) - zero rows for a profile
// means unrestricted (sees every tab)
export interface ProfileTabPermission {
  id: string;
  profile_id: string;
  page_name: string;
  created_at: string;
}

export interface SpouseDetails {
  name?: string | null;
  id_number?: string | null;
  phone?: string | null;
}

export interface Case {
  id: string;
  case_number: string;
  case_name: string;
  opened_date: string | null;
  case_type: string | null;
  case_nature: string | null;
  case_stage: string | null;
  handler_id: string | null;
  external_ref: string | null;
  status: string | null;
  client_id_number: string | null;
  client_phone: string | null;
  client_email: string | null;
  client_address: string | null;
  spouse_details: SpouseDetails | null;
  drive_url: string | null;
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

// for the cases screen's date-range filter (deadlines/tasks) and its
// per-חוצץ field picker (case_fields)
export interface CaseWithRelations extends CaseWithHandler {
  case_deadlines: Pick<CaseDeadline, "id" | "due_date" | "status">[];
  tasks: Pick<Task, "id" | "due_date" | "status">[];
  case_fields: Pick<
    CaseField,
    "page_name" | "field_name" | "value_text" | "value_date" | "value_number"
  >[];
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
  responsible_id: string | null;
  file_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseDocumentWithResponsible extends CaseDocument {
  responsible: Pick<Profile, "id" | "full_name"> | null;
}

export interface CaseDeadline {
  id: string;
  case_id: string;
  label: string;
  due_date: string;
  status: TaskStatus;
  notes: string | null;
  external_date: string | null;
  zoom_link: string | null;
  address: string | null;
  client_updated: boolean;
  preparation_done: boolean;
  source_field_name: string | null;
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

// חוצצים (tabs) - one row per synced field, grouped by page_name into a
// tab on the case detail page. See migration 0017 for why this is a
// generic EAV shape instead of one column per field.
export interface CaseField {
  id: string;
  case_id: string;
  page_name: string;
  field_name: string;
  value_text: string | null;
  value_date: string | null;
  value_number: number | null;
  source_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

// per-case-type fixed columns on the cases list (migration 0019) - a
// manager-configured ordered list of (page_name, field_name) shown as
// extra columns whenever the cases list is narrowed to one case_type
export interface CaseTypeColumnPreset {
  id: string;
  case_type: string;
  page_name: string;
  field_name: string;
  display_order: number;
  created_at: string;
}

// שלבים בתיק - a manager-configured ordered stage list per case_type
// (migration 0028), powering the visual stepper on the case card
export interface CaseTypeStage {
  id: string;
  case_type: string;
  stage_name: string;
  display_order: number;
  created_at: string;
}

// תתי-שלבים - a manager-configured checklist per שלב (migration 0029),
// e.g. under "הכנת טופס 5": בדיקה מקדמית, חוצץ כללי השלמת מסמכים, etc.
export interface CaseTypeStageItem {
  id: string;
  stage_id: string;
  item_text: string;
  display_order: number;
  created_at: string;
}

// per-case completion state for a תת-שלב (migration 0029) - absence of a
// row for a given (case_id, item_id) means "not done yet"
export interface CaseStageChecklistEntry {
  id: string;
  case_id: string;
  item_id: string;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  created_at: string;
}

// תבניות סינון שמורות (migration 0031) - a manager builds a set of
// conditions (on a fixed column or a specific חוצץ field), each allowing
// multiple values (OR within the condition, AND across conditions), and
// saves it by name; anyone can pick a saved template to apply it.
// `key` encodes the field exactly like the field picker in the UI:
// "fixed:<col>" or "case_field:<page_name>::<field_name>".
export interface ViewFilterCondition {
  key: string;
  values: string[];
}

// screen === "cases": also remembers which columns are shown, in what
// order, and the active sort - not just the filter
export interface CasesViewConfig {
  filters: ViewFilterCondition[];
  columns?: string[];
  sortKey?: string;
  sortDir?: "asc" | "desc";
}

// screen === "dashboard": one donut slot's pre-filter + group-by field
export interface ChartViewConfig {
  filters: ViewFilterCondition[];
  groupBy: string;
}

export interface ViewTemplate {
  id: string;
  screen: string;
  name: string;
  config: CasesViewConfig | ChartViewConfig;
  display_order: number;
  created_by: string | null;
  created_at: string;
}

// per-user drag-reordered column order for a given table (migration 0026) -
// self-served, unlike CaseTypeColumnPreset which a manager configures
export interface ProfileColumnOrder {
  id: string;
  profile_id: string;
  table_key: string;
  column_order: string[];
  updated_at: string;
}

export function formatCaseFieldValue(
  f: Pick<CaseField, "value_text" | "value_date" | "value_number">,
): string {
  if (f.value_date) return new Date(f.value_date).toLocaleDateString("he-IL");
  if (f.value_number !== null) return String(f.value_number);
  if (f.value_text) return f.value_text;
  return "—";
}

// בקרה ואישורים - a generic 3-step workflow (submit -> review -> manager
// approval), request_type is free text so any approval type works
export type ApprovalStatus =
  | "pending_review"
  | "pending_approval"
  | "approved"
  | "rejected";

export interface ApprovalRequest {
  id: string;
  case_id: string;
  request_type: string;
  status: ApprovalStatus;
  submitted_by: string;
  reviewed_by: string | null;
  approved_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalRequestWithNames extends ApprovalRequest {
  submitted_by_profile: Pick<Profile, "id" | "full_name"> | null;
  reviewed_by_profile: Pick<Profile, "id" | "full_name"> | null;
  approved_by_profile: Pick<Profile, "id" | "full_name"> | null;
  // the extra case_type/case_nature/status/team/handler/case_fields are
  // optional - only fetched on the /approvals board (for its advanced
  // filter), not on the case-detail page's approvals panel
  case:
    | (Pick<Case, "id" | "case_number" | "case_name"> &
        Partial<Pick<Case, "case_type" | "case_nature" | "status" | "team">> & {
          handler?: Pick<Profile, "id" | "full_name"> | null;
          case_fields?: Pick<
            CaseField,
            "page_name" | "field_name" | "value_text" | "value_date" | "value_number"
          >[];
        })
    | null;
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
  notes: string | null;
  priority_code: number | null;
  priority_name: string | null;
  category_code: number | null;
  category_name: string | null;
  informed_users_names: string | null;
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

// developer/admin panel (/dashboard/webhooks) - lets a manager edit a
// webhook's secret/URL from the UI and see its recent call history,
// instead of SSHing in to edit .env.production. See migration 0018.
export type WebhookDirection = "incoming" | "outgoing";
export type WebhookValueType = "secret" | "url";
export type WebhookLogStatus = "ok" | "error" | "skipped" | "unauthorized";

export interface WebhookConfig {
  key: string;
  label: string;
  endpoint_path: string;
  direction: WebhookDirection;
  value_type: WebhookValueType;
  value: string | null;
  updated_at: string;
}

export interface WebhookLog {
  id: string;
  webhook_key: string;
  status: WebhookLogStatus;
  status_code: number;
  request_body: unknown;
  response_body: unknown;
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
