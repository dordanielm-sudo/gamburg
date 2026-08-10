# Gamburg CRM — Supabase schema (Stage 1-2)

## Layout

- `migrations/0001_schema.sql` — tables, enums, indexes, and the triggers that
  maintain `updated_at` / `last_touched_at` and auto-create notifications.
- `migrations/0002_rls.sql` — RLS policies for the 3 roles (manager / handler
  / secretary), plus column-level GRANT/REVOKE so only the CRM-only fields on
  `cases` are writable from the app.
- `migrations/0003_auth_sync.sql` — trigger that creates a `profiles` row from
  `auth.users` metadata whenever a user is invited.
- `migrations/0004_user_management.sql` — `is_active` (soft-delete) on
  `profiles`, and `admin_set_user_status()`, the only way role/is_active can
  be changed (checks the caller is a manager itself, since "manager" and
  "handler" are the same Postgres DB role).
- `migrations/0005_stuck_case_check.sql` — `check_stuck_cases()`: notifies
  the handler and every active manager once per "stuck episode" (30+ days
  since `last_touched_at`, section 4.4). Portable, tested locally.
- `migrations/0006_realtime_and_cron.sql` — **Supabase-only**, not run
  against the local test harness: adds `notifications` to the
  `supabase_realtime` publication (the notification bell subscribes to
  INSERT on it) and schedules `check_stuck_cases()` daily via `pg_cron`.
- `tests/` — a local-only Postgres shim (fake `auth` schema/roles, a pg_cron
  stub) plus seed data and assertions, so the policies above can be exercised
  without a live Supabase project. Two assertion files: `02_rls_assertions.sql`
  covers read/write access on `cases`, `tasks` and `notifications`;
  `04_write_access.sql` covers the tables that editing opened up in
  0034–0036 (`case_fields`, `case_deadlines`, `documents`,
  `approval_requests`, plus the write-back trail in `case_sync_log`). Never
  apply `tests/00_local_shim.sql` or `tests/00b_default_grants.sql` to a real
  project — it already has that infrastructure.

## Applying to a real Supabase project

```
supabase link --project-ref <ref>
supabase db push
```

(or paste the `migrations/*.sql` files, in order, into the SQL Editor).

## Creating users

Invite each of the ~5-7 staff via the Dashboard ("Authentication → Invite
user") or the Admin API, setting `user_metadata`:

```json
{ "full_name": "חנה גמבורג", "role": "manager" }
```

`role` is one of `manager` / `handler` / `secretary` and defaults to
`handler` if omitted. The `0003_auth_sync.sql` trigger creates the matching
`profiles` row automatically.

## Running the RLS tests locally

No Supabase project needed:

```
./scripts/test-rls.sh
```

Uses a throwaway `postgres:16-alpine` container when Docker is available,
and otherwise falls back to a local `postgres` binary in a temp directory —
CI sandboxes often have the binary but no usable Docker daemon, and these
tests are worth running in both.

It applies every migration except `0006_realtime_and_cron.sql`, plus the
local shim and seed data, then runs 44 assertions across all 3 roles: row
visibility, column-level write restrictions, task/notification automation,
deactivation, stuck-case notifications, and write access on every table
that editing opened up. Prints `All RLS checks passed.` on success, or stops
at the first failing assertion.

`0006` is the only Supabase-only migration and is skipped — it needs the
`supabase_realtime` publication and the `pg_cron` extension. Apply it
directly on the real project. Later migrations that merely *call*
`cron.schedule()` do run: the shim stubs the `cron` schema so those files
reach their RLS statements instead of aborting.

Two things the suite is deliberately careful about, because they fail in
opposite ways:

- **RLS decides rows.** A blocked write is silent — it matches nothing and
  reports success with zero rows affected. Those assertions check the row
  count, never an exception.
- **GRANTs decide columns.** A blocked column raises. Column grants are
  table-wide and independent of RLS, so a `grant update (…)` on a table that
  never had its table-wide UPDATE revoked does nothing at all. 0034/0035
  shipped exactly that mistake and 0036 fixed it; the suite now pins each
  ungranted column down.

## Confirmed role permissions (stage 1-2)

- **manager** — sees and edits every case, creates tasks for any handler,
  and is the only role that can call `admin_set_user_status()` to change
  someone's role or deactivate them.
- **handler** — sees only cases where `handler_id` is them, and edits those:
  the CRM-only fields, and the synced fields listed below. On tasks, they
  edit the ones assigned to or created by them.
- **secretary** — read-only across all cases; cannot edit anything and
  cannot create tasks.

Editing synced fields was originally forbidden outright: a local change had
nowhere to go and the next sync would overwrite it. That changed once the
write-back existed — 0027 opened status/case_nature/case_stage, 0034 the
חוצצים, 0035 deadlines and tasks, 0037 the client details and case
name/type/open date. Each save leaves through `/api/case-updates` so the
change reaches עדכנית instead of waiting to be overwritten.

Two kinds of column stay locked, for different reasons:

- **`cases.case_number`** — the key Make matches on. Renaming it would break
  the match for every later write-back on that case, including the one
  carrying the rename.
- **`case_fields.page_name`/`field_name`, `case_deadlines.source_field_name`,
  `tasks.source_task_id`** — each ties a row to the record it was synced
  from. Rewriting one orphans the row, and the next sync inserts a duplicate
  instead of updating it.

`tasks.assigned_to` is also ungranted: reassigning a task is not an edit, and
no screen offers it.

Enforced by `grant update (…)` after a `revoke update` on the table — a grant
alone adds nothing where a table-wide UPDATE is already in place (see 0036).
`supabase/tests/04_write_access.sql` asserts both halves.

## User management (in-app panel, built in stage 3)

"Removing" a user is a soft-delete: `admin_set_user_status(id, role, false)`
sets `is_active = false`, which makes `current_user_role()` stop recognizing
them, immediately locking them out of every RLS-gated table - their history
(past cases' handler_id, tasks, notifications, case_sync_log) is untouched.
The panel's server-side route additionally calls the Supabase Admin API to
disable their actual login (e.g. ban the auth.users record), since
`is_active` alone only gates data access inside our tables, not
authentication itself. Reassigning a deactivated handler's open cases is not
part of this flow - `handler_id` is a source field owned by עדכנית, so that
reassignment happens there (via Make), not in the CRM.
