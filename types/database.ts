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
  // vwExportToOuterSystems_LoginUsers.UserID in עדכנית (0043). Set by hand on
  // the users screen - names there abbreviate and collide, so they cannot be
  // matched automatically. Null means tasks cannot be created in עדכנית for
  // this person.
  udkanit_user_id: number | null;
  // set when a handler_name from a sync matched no profile and this one was
  // created on the spot (0047) - it has a placeholder email and no working
  // login until a manager sets a real one, which clears this back to false.
  auto_created: boolean;
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
  status_changed_at: string | null;
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
  // which חוצץ source_field_name lives on - needed because the field name
  // alone is not always unique across tabs ("מועד העלאת הצו" exists on more
  // than one). null for a deadline synced before this column existed.
  page_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// The joined case carries the same fields the cases screen filters on, so the
// deadlines board can offer סינון מתקדם at the same depth - including חוצצים
// and שלב בתיק - instead of only the deadline's own columns.
export interface CaseDeadlineWithCase extends CaseDeadline {
  case:
    | (Pick<
        CaseWithHandler,
        | "id"
        | "case_number"
        | "case_name"
        | "handler"
        | "status"
        | "case_type"
        | "case_nature"
        | "case_stage"
        | "team"
      > & {
        case_fields: Pick<
          CaseField,
          "page_name" | "field_name" | "value_text" | "value_date" | "value_number"
        >[];
      })
    | null;
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
  // "in" (the default, and what every template saved before this existed
  // means) - the field's value must be one of `values`.
  // "not_empty" - the field only has to hold something. That is what a slice
  // of a per-field chart counts, so it is also what that slice's
  // click-through has to say; `values` is ignored.
  // "empty" - the opposite: the field holds nothing. Without this, a field
  // nobody has filled in yet (or not filled in for the cases currently in
  // scope) offers no values to pick from and so could never be filtered on
  // at all - exactly the case a manager most wants to find ("which cases are
  // missing X"). `values` is ignored, same as "not_empty".
  op?: "in" | "not_empty" | "empty";
}

// screen === "cases": also remembers which columns are shown, in what
// order, and the active sort - not just the filter
export interface CasesViewConfig {
  filters: ViewFilterCondition[];
  columns?: string[];
  sortKey?: string;
  sortDir?: "asc" | "desc";
}

// screen === "dashboard": one donut slot's pre-filter + what it groups by.
//
// A donut groups by one field or by several. Each field contributes its own
// values as slices, so adding צוות to a chart adds a slice per team - not a
// single "צוות" slice, which would only say how many cases have any team at
// all and answer nothing.
//
// `groupBy` is kept alongside `fields` and always mirrors fields[0]: every
// chart and template saved before multiple fields existed has only groupBy,
// and reading `fields ?? [groupBy]` is what lets those keep working
// untouched.
//
// With more than one field the slices no longer partition the cases - each
// field's values sum to the case count on their own, so the total is a
// multiple of it. That is inherent to putting several breakdowns side by
// side, which is what was asked for.
// `values` narrows a field to the values worth showing, keyed by field. A
// חוצץ field is mostly empty, so grouping by one puts a "ללא ערך" slice of
// 1481 next to the 20/17/6 that are the actual answer, and the donut becomes
// unreadable. Absent for a field means every value, which is what every chart
// saved before this says.
//
// Deliberately not the same thing as `filters`: a filter narrows which cases
// the whole chart counts, so using one here would also shrink every other
// field on the chart. This narrows only what one field draws.
export interface ChartViewConfig {
  filters: ViewFilterCondition[];
  groupBy: string;
  fields?: string[];
  values?: Record<string, string[]>;
}

// The dashboard's chart layout: which charts exist, in what order, and what
// each one shows. Kept as a single view_templates row (screen =
// "dashboard_layout") rather than a row per chart - add/remove/reorder is
// then one atomic write, with no display_order to keep consistent.
export interface DashboardChartConfig {
  title: string;
  groupBy: string;
  filters: ViewFilterCondition[];
  fields?: string[];
  values?: Record<string, string[]>;
}

export interface DashboardLayoutConfig {
  charts: DashboardChartConfig[];
}

export interface ViewTemplate {
  id: string;
  screen: string;
  name: string;
  config: CasesViewConfig | ChartViewConfig | DashboardLayoutConfig;
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
  // the title (עדכנית's TaskSubject) - what every screen shows. Nullable only
  // because the column was added after the fact (0042); in practice every task
  // has one, and taskTitle() below covers the gap.
  subject: string | null;
  // the optional body (עדכנית's TaskText) - set on about a third of tasks
  text: string | null;
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

// What to show as the task's one-line title. subject is the real one, but a
// task synced before 0042 - or created against an older build - can still
// carry its title in text, so fall back rather than render an empty row.
export function taskTitle(task: Pick<Task, "subject" | "text">): string {
  return task.subject?.trim() || task.text?.trim() || "";
}

// section 4.4: no touch for 30+ days
export const STUCK_CASE_DAYS = 30;

export function isCaseStuck(lastTouchedAt: string): boolean {
  const ageMs = Date.now() - new Date(lastTouchedAt).getTime();
  return ageMs > STUCK_CASE_DAYS * 24 * 60 * 60 * 1000;
}
