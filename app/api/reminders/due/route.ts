import { runIncomingWebhook } from "@/lib/webhook-handler";
import {
  REMINDER_SOURCE_FIELDS,
  REMINDER_DAYS_BEFORE,
  officeToday,
  addDays,
} from "@/lib/reminder-fields";

// Everything a reminder email needs, for every relevant deadline coming up.
// Make calls this once a day and sends the mail; the CRM decides what is due
// and to whom, and sends nothing itself.
//
// Pull rather than push, deliberately: the database has pg_cron (0006) but
// no pg_net, so it cannot make an HTTP call, and adding that to reach one
// scenario would be new infrastructure to keep alive. Make already runs on a
// schedule, retries, and keeps a history - all of which a push would have to
// reimplement. Authentication, logging and the editable secret come from
// runIncomingWebhook like every other Make-facing route.
//
// Idempotent: it reports what is due on the day it is asked, and keeps no
// record of having been asked. Calling it twice produces the same answer
// twice, so a retry is safe - but so is a duplicate email, which is why the
// scenario should run once a day rather than hourly.

interface RemindersPayload {
  // Overrides for a manual catch-up run: a specific date to treat as today,
  // or a different set of lead times. Both optional - normal scheduled runs
  // send an empty body.
  today?: string | null;
  days_before?: number[] | null;
}

interface DeadlineRow {
  id: string;
  label: string;
  due_date: string;
  source_field_name: string | null;
  page_name: string | null;
  case: {
    id: string;
    case_number: string;
    case_name: string;
    handler_id: string | null;
  } | null;
}

interface ProfileRow {
  id: string;
  full_name: string;
  role: string;
  auto_created: boolean;
}

interface Recipient {
  profile_id: string;
  name: string;
  // "handler" - the person the case is assigned to. "manager" - חנה, or
  // whoever holds the manager role, who is copied on every reminder.
  reason: "handler" | "manager";
  email: string | null;
  // False when the address is a placeholder from an auto-created profile
  // (see lib/handler-resolution.ts) or missing entirely. The reminder is
  // still returned - Make decides whether to skip it or route it elsewhere -
  // because dropping it here would hide the problem rather than surface it.
  can_email: boolean;
}

const PLACEHOLDER_EMAIL_SUFFIX = "@no-login.invalid";

export async function POST(request: Request) {
  return runIncomingWebhook(
    "reminders_due",
    request,
    process.env.MAKE_REMINDERS_WEBHOOK_SECRET,
    async (rawBody, admin) => {
      const body = (rawBody ?? {}) as RemindersPayload;

      const today = body.today?.trim() || officeToday();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
        return { status: 400, json: { error: "today must be YYYY-MM-DD" } };
      }

      const daysBefore =
        body.days_before && body.days_before.length > 0
          ? body.days_before
          : [...REMINDER_DAYS_BEFORE];
      if (daysBefore.some((d) => !Number.isInteger(d) || d < 0)) {
        return {
          status: 400,
          json: { error: "days_before must be non-negative whole numbers" },
        };
      }

      // date -> how many days ahead it is, so each row knows which reminder
      // it is without recomputing the arithmetic per row
      const dueDates = new Map<string, number>();
      for (const d of daysBefore) dueDates.set(addDays(today, d), d);

      const { data: deadlines, error } = await admin
        .from("case_deadlines")
        .select(
          "id, label, due_date, source_field_name, page_name, " +
            "case:cases!case_deadlines_case_id_fkey(id, case_number, case_name, handler_id)",
        )
        .eq("status", "open")
        .in("due_date", [...dueDates.keys()])
        .in("source_field_name", [...REMINDER_SOURCE_FIELDS])
        .order("due_date")
        .returns<DeadlineRow[]>();

      if (error) {
        return { status: 500, json: { error: error.message } };
      }

      const rows = deadlines ?? [];
      if (rows.length === 0) {
        return {
          status: 200,
          json: { status: "ok", today, reminders: [], count: 0 },
        };
      }

      // Every active manager is copied on every reminder, resolved by role
      // rather than by name - the same reasoning as resolveOrCreateHandler's
      // "מנהל" branch, so this keeps working if the role ever moves.
      const { data: managers } = await admin
        .from("profiles")
        .select("id, full_name, role, auto_created")
        .eq("role", "manager")
        .eq("is_active", true)
        .returns<ProfileRow[]>();

      const handlerIds = [
        ...new Set(
          rows
            .map((r) => r.case?.handler_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      const { data: handlers } = await admin
        .from("profiles")
        .select("id, full_name, role, auto_created")
        .in("id", handlerIds.length > 0 ? handlerIds : ["00000000-0000-0000-0000-000000000000"])
        .returns<ProfileRow[]>();

      const profiles = new Map<string, ProfileRow>();
      for (const p of [...(managers ?? []), ...(handlers ?? [])]) {
        profiles.set(p.id, p);
      }

      // profiles has no email column - it lives in auth.users and is only
      // reachable through the Admin API (see app/dashboard/users/actions.ts).
      // One call per distinct person, which is a handful, not per deadline.
      const emails = new Map<string, string | null>();
      await Promise.all(
        [...profiles.keys()].map(async (id) => {
          const { data } = await admin.auth.admin.getUserById(id);
          emails.set(id, data.user?.email ?? null);
        }),
      );

      function recipient(
        id: string,
        reason: Recipient["reason"],
      ): Recipient | null {
        const profile = profiles.get(id);
        if (!profile) return null;
        const email = emails.get(id) ?? null;
        const usable =
          Boolean(email) && !email!.endsWith(PLACEHOLDER_EMAIL_SUFFIX);
        return {
          profile_id: id,
          name: profile.full_name,
          reason,
          email,
          can_email: usable,
        };
      }

      const reminders = rows.map((r) => {
        const people: Recipient[] = [];
        const handlerId = r.case?.handler_id;
        if (handlerId) {
          const person = recipient(handlerId, "handler");
          if (person) people.push(person);
        }
        for (const m of managers ?? []) {
          // a manager who is also the case's handler is one recipient, not two
          if (people.some((p) => p.profile_id === m.id)) continue;
          const person = recipient(m.id, "manager");
          if (person) people.push(person);
        }

        return {
          deadline_id: r.id,
          case_number: r.case?.case_number ?? null,
          case_name: r.case?.case_name ?? null,
          label: r.label,
          source_field_name: r.source_field_name,
          page_name: r.page_name,
          due_date: r.due_date,
          days_until: dueDates.get(r.due_date) ?? null,
          recipients: people,
        };
      });

      return {
        status: 200,
        json: {
          status: "ok",
          today,
          count: reminders.length,
          // Surfaced rather than left for Make to work out: a reminder with
          // nobody reachable is the case that quietly sends no mail.
          unreachable: reminders.filter((r) =>
            r.recipients.every((p) => !p.can_email),
          ).length,
          reminders,
        },
      };
    },
  );
}
