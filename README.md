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
  new-document (stage 4), and stuck-case pushes in real time via Supabase
  Realtime - see `supabase/migrations/0006_realtime_and_cron.sql`, which must
  be applied for the bell to receive anything.

## Notes for this codebase

- Next.js 16 renamed Middleware to Proxy: session refresh + auth redirect
  lives in `proxy.ts` (root) + `lib/supabase/proxy.ts`, not `middleware.ts`.
- All data access is enforced by Postgres RLS (see `supabase/`), not
  application-level checks - the browser Supabase client (`lib/supabase/client.ts`)
  is used directly from client components for mutations.
- `lib/supabase/admin.ts` wraps the `service_role` key - only ever called
  from Server Actions that have already verified the caller is a manager
  (see `app/dashboard/users/actions.ts`). Never import it into a Client
  Component.
