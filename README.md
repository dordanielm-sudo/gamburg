# Gamburg CRM

CRM תפעולי למשרד עו״ד חנה גמבורג. Next.js (App Router) + TypeScript + Supabase.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project's URL/anon key
npm run dev
```

Database schema, RLS policies, and how to run the RLS test suite locally are
documented in [`supabase/README.md`](./supabase/README.md).

Deploying to a Cloudways server (Node install, PM2, Nginx reverse proxy,
SSL, redeploy script) is documented step by step in [`DEPLOY.md`](./DEPLOY.md).

## Pages

- `/login` - email/password sign-in.
- `/cases` - "ניהול תיקים פתוחים": searchable/sortable table, all 3 roles.
- `/dashboard` - manager-only stats (open/stuck/flagged cases, per-handler
  and per-status breakdowns).
- `/dashboard/users` - manager-only user management: add a user (shown a
  temporary password once, to relay manually), change role, deactivate/
  reactivate.
- `/tasks` - task list (open/done); only the manager creates tasks, everyone
  sees their own. The header's notification bell (all pages) shows new-task,
  new-document, and stuck-case pushes in real time via Supabase Realtime -
  see `supabase/migrations/0006_realtime_and_cron.sql`, which must be
  applied for the bell to receive anything.

## Webhooks (stage 4, section 4.2 / 4.3b)

- `POST /api/case-updates` - called by the browser right after an
  optimistic write to `cases` (flags/note/follow-up). Logs the change to
  `case_sync_log`, forwards it to `MAKE_OUTGOING_WEBHOOK_URL`, and relays
  Make's synchronous `{status, message, record_id}` response; on `failure`
  the client undoes its optimistic write. If the env var isn't set, it
  responds `warning` ("saved in the CRM only") instead of erroring - useful
  before the Make scenario exists yet.
- `POST /api/webhooks/incoming-document` - Make calls this (not a CRM user
  session) whenever a new relevant document arrives. Authenticated by a
  shared secret header, not Supabase Auth: `x-webhook-secret` must match
  `MAKE_INCOMING_WEBHOOK_SECRET`. Body: `{ case_number, document_name?,
  message? }`. Notifies the case's handler, or every active manager if the
  case has none.

## Notes for this codebase

- Next.js 16 renamed Middleware to Proxy: session refresh + auth redirect
  lives in `proxy.ts` (root) + `lib/supabase/proxy.ts`, not `middleware.ts`.
  `proxy.ts`'s matcher excludes `/api/*` on purpose - those routes enforce
  their own auth (session or shared secret) and must return JSON, not an
  HTML redirect to /login.
- All data access is enforced by Postgres RLS (see `supabase/`), not
  application-level checks - the browser Supabase client (`lib/supabase/client.ts`)
  is used directly from client components for mutations.
- `lib/supabase/admin.ts` wraps the `service_role` key - only ever called
  from server code that has already verified the caller (a manager, in
  `app/dashboard/users/actions.ts`; a valid webhook secret, in
  `app/api/webhooks/incoming-document`). Never import it into a Client
  Component.
