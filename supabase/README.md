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
- `tests/` — a local-only Postgres shim (fake `auth` schema/roles) plus seed
  data and RLS assertions, so the policies above can be exercised without a
  live Supabase project. Never apply `tests/00_local_shim.sql` or
  `tests/00b_default_grants.sql` to a real project — it already has that
  infrastructure.

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

Requires Docker only (no Supabase project needed):

```
./scripts/test-rls.sh
```

Spins up a throwaway `postgres:16-alpine` container, applies the migrations
plus the local shim/seed data, and runs 19 assertions covering all 3 roles
(row visibility, column-level write restrictions, task/notification
automation, deactivation). Prints `ALL RLS CHECKS PASSED` on success, or the
first failing assertion otherwise.

## Confirmed role permissions (stage 1-2)

- **manager** — sees and (within the CRM-only fields) edits every case,
  creates tasks for any handler, and is the only role that can call
  `admin_set_user_status()` to change someone's role or deactivate them.
- **handler** — sees only cases where `handler_id` is them; can edit the
  CRM-only fields (flags/note/follow-up) on those cases; can only change the
  `status`/`completed_at` of tasks assigned to them.
- **secretary** — read-only across all cases; cannot edit flags/notes/
  follow-up and cannot create tasks.

No role can edit the עדכנית-sourced fields (`case_number`, `case_name`,
`status`, client details, ...) from the CRM — those are only ever written by
the Make sync job via the `service_role` key, which bypasses RLS.

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
