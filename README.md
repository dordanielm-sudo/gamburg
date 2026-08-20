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
- `/lead` - public Telegram Mini App lead form (no CRM account): a
  prospective client leaves a name and phone in the firm's bot and the lead
  is forwarded to Make. Setup and the Make contract:
  [`docs/telegram-lead-form.md`](./docs/telegram-lead-form.md).
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
  optimistic write, from every editable field on every screen (the case
  card, the cases list, the חוצצים tabs, deadlines and tasks - not only the
  CRM-only flags/note/follow-up it started with). Logs the change to
  `case_sync_log`, forwards it to `MAKE_OUTGOING_WEBHOOK_URL`, and relays
  Make's synchronous `{status, message, record_id}` response; on `failure`
  the client undoes its optimistic write. If the env var isn't set, it
  responds `warning` ("saved in the CRM only") instead of erroring - useful
  before the Make scenario exists yet.

  The payload identifies what changed with `entity_type` + `source_ref`
  (the id עדכנית knows the record by - our own uuid means nothing there).
  Full contract, routing table and the Make build guide:
  [`docs/make-write-back.md`](./docs/make-write-back.md).
- `POST /api/webhooks/case-field-sync` - Make calls this on a schedule with
  every חוצץ of every case, pulled from עדכנית's custom-fields view. Takes
  a `batches` array of up to ~100 case+tab groups per request, because Make
  bills per bundle and one call per case would cost ~96,000 operations a
  month. The scenario's SQL, the Make module setup and the body-size limit:
  [`docs/case-field-pull.md`](./docs/case-field-pull.md).
- `POST /api/telegram-lead` - called by the browser from the `/lead`
  Telegram Mini App form. Not a CRM session: when `TELEGRAM_BOT_TOKEN` is
  set, the signed `initData` string the Mini App receives is verified
  against it (`lib/telegram-init-data.ts`) so only someone actually inside
  the bot can submit. Forwards `{name, phone}` - nothing else - to
  `outgoing_telegram_lead` / `MAKE_TELEGRAM_LEAD_WEBHOOK_URL`, counts any
  2xx as delivered, and logs every call to `webhook_logs`. Contract and
  BotFather setup:
  [`docs/telegram-lead-form.md`](./docs/telegram-lead-form.md).
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
  HTML redirect to /login. It also excludes `/lead`, the Telegram lead form,
  which is filled in by people with no CRM account at all.
- All data access is enforced by Postgres RLS (see `supabase/`), not
  application-level checks - the browser Supabase client (`lib/supabase/client.ts`)
  is used directly from client components for mutations.
- `lib/supabase/admin.ts` wraps the `service_role` key - only ever called
  from server code that has already verified the caller (a manager, in
  `app/dashboard/users/actions.ts`; a valid webhook secret, in
  `app/api/webhooks/incoming-document`). Never import it into a Client
  Component.
