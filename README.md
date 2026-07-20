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

## Notes for this codebase

- Next.js 16 renamed Middleware to Proxy: session refresh + auth redirect
  lives in `proxy.ts` (root) + `lib/supabase/proxy.ts`, not `middleware.ts`.
- All data access is enforced by Postgres RLS (see `supabase/`), not
  application-level checks - the browser Supabase client (`lib/supabase/client.ts`)
  is used directly from client components for mutations.
