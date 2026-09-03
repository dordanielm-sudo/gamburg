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
