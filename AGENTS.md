<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Every `<Link>` in this app sets `prefetch={false}`

Next warms each Link that scrolls into view by rendering its target on the
server. That is a good trade on a site of cheap pages. Here almost every
route is expensive - the cases list loads every case with its deadlines,
tasks and חוצץ fields - and links appear once per table row and once per
chart slice.

Measured on the real data: a single screen load fired 62 requests, of which
about 30 were prefetches nobody asked for, several taking a second of server
time each. They competed for the same cores as the screen being waited on,
so leaving prefetch on actively slowed down the page the user was looking at.

Navigation still feels immediate because `app/loading.tsx` renders the moment
a link is clicked.

So: any new `<Link>` needs `prefetch={false}` unless its target is genuinely
cheap and the link is genuinely likely to be clicked.

# Traps already caught once - don't rediscover these

## Column GRANTs and row RLS are independent
A table can have an RLS policy that lets a manager update any row, and
`revoke update ... ; grant update (some_column) ...` on the same table at the
same time. Passing the row check does not get you past the column grant.
Adding a new editable column (e.g. `profiles.udkanit_user_id`, migration
0043) silently failed to save - not an RLS error, a column-privilege one -
until 0044 added a `SECURITY DEFINER` function the same shape as
`admin_set_user_status()`. If a new column on `profiles` or `cases` needs to
be settable from the client, check what the table's `grant update (...)`
already lists before assuming RLS is the whole story.

## Make's default reply breaks every write-back until a scenario has a Webhook response module
A Make webhook trigger answers `Accepted` (plain text) the instant it fires,
before the scenario body has run. `lib/make-webhook.ts` requires a JSON body
with `status: "success"|"failure"|"warning"`, so every write-back scenario
needs an explicit **Webhook response** module at the end of *every* branch,
or the CRM sees `Accepted`, calls it a failure, and rolls back its own
optimistic save - including a save that had nothing to do with עדכנית
writing back, like moving the שלב stepper. Symptom to recognize instantly:
an edit visibly reverts a few hundred ms after it was made.

## `Counter` columns are IDENTITY - never compute them
`dbo.Tasks.Counter`, `dbo.UserData_Records.Counter`, etc. are auto-numbered.
Never `max(Counter)+1` - that's a race condition waiting for two concurrent
writers. Leave the column out of the INSERT and read the id back with
`SCOPE_IDENTITY()`.

## A foreign key with no `ON DELETE` blocks deletion through the normal UI
`notifications.task_id -> tasks.id` had no cascade, so the plain "delete
task" button in the CRM failed with a constraint violation the moment a task
had an unread notification - not a new bug, just never hit before. Same
shape on the עדכנית side: `TaskLinks`/`HozActions` reference `Tasks.Counter`
with no declared FK at all, which is worse - a delete there succeeds and
leaves orphaned rows silently instead of erroring. Before wiring up any new
DELETE (either side), query what actually references the table
(`information_schema` / `sys.foreign_keys`), don't assume the schema
declares everything.

## `deploy.sh` never runs migrations
It fetches, builds, and restarts PM2 - nothing touches Supabase. Every new
file under `supabase/migrations/` needs a manual run in the Supabase SQL
editor, in order, before or as part of the deploy. Forgetting this produces
confusing failures that look like the deployed code is wrong when it's
actually the schema that's behind.

## עדכנית's export views are frequently not the write target
`vwExportToOuterSystems_*` views exist for reading. Several are joins across
multiple base tables, which SQL Server refuses to UPDATE through - the write
succeeds (`@@ROWCOUNT` even, sometimes) but touches nothing. Find the base
tables the view is built from (`sys.dm_sql_referenced_entities` or the view's
`object_definition()`) and write to those directly.

## Never import a plain value from a `"use client"` file into server code
`DASHBOARD_LAYOUT_SCREEN` - the string `"dashboard_layout"` - was exported
from `app/dashboard/case-charts-panel.tsx` (a client component) and imported
by `app/dashboard/page.tsx` (a server component) to filter a query on. The
client boundary exists to hand server code an opaque reference to a
*component*; it makes no promise about a plain constant, and the value the
server bundle ended up comparing against was not that string.

What made this cost a full day: nothing fails. The query is valid, returns
no error, and matches zero rows - indistinguishable from "nothing saved
yet", so the dashboard fell back to its default charts on every load while
the saved row sat in the table. RLS, PostgREST's schema cache, PM2 workers,
Nginx, Cloudflare and the browser cache were all eliminated first, and the
only clue that survived was that the *neighbouring* query in the same file,
filtering on a literal `"dashboard"`, always worked.

Values shared by both sides go in their own module - see
`lib/dashboard-layout.ts`. If a server-side query returns nothing while the
same query run directly against PostgREST returns the row, suspect the
filter value before suspecting the database.

## An export view that lacks a column silently sends nothing, not an error
684 cases sat with no handler for weeks. The auto-provisioning in
`lib/handler-resolution.ts` was not failing - it was never called, because
`vwExportToOuterSystems_Files`, the view the case-sync scenario reads, has
no handler column at all, so `handler_name` was simply absent from every
payload. An absent optional field looks exactly like "this case genuinely
has no handler".

The handler lives in `vwMainTik.TikMetaplim` (a comma-separated list) with
`TikMetaplimUserIDs` positionally aligned to it. `TikOwner` on the export
view is always one of those ids - עדכנית's own "case owner" - so joining
`vwExportToOuterSystems_LoginUsers` on it yields one handler, by full name
(`חנה גמבורג`, not the `חנה` that `TikMetaplim` abbreviates to). Note that
adding a column to the SQL is only half of it: Make must also map the new
field into the webhook body, or it reaches the query and stops there.
