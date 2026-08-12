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
