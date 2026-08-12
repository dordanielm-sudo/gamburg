import "server-only";

// Times one server-side fetch and logs it, so a slow screen can be traced to
// the query responsible instead of guessed at.
//
// Written after an investigation that ruled out, one at a time: data volume
// (about 1,250 rows a screen), distance to the database (5ms - app and
// database are both in London), the database itself (2ms for the screen's
// main query), the Cloudflare tunnel (about 100ms) and Next's link
// prefetching (which was real, and is fixed). None of them explained a screen
// taking seconds, and each round of guessing cost a deploy.
//
// The output goes to stdout, which PM2 captures:
//
//   pm2 logs gamburg-crm --lines 200 --nostream | grep timing
//
// One line per query is cheap enough to leave on - this is a twenty-user app,
// not a public site - and the next time a screen feels slow the answer is
// already in the log rather than several deploys away.
// PromiseLike, not Promise: a Supabase query builder is thenable but is not a
// real Promise, and requiring one would mean wrapping every call site.
export async function timed<T>(label: string, work: PromiseLike<T>): Promise<T> {
  const started = Date.now();
  try {
    return await work;
  } finally {
    console.log(`[timing] ${label} ${Date.now() - started}ms`);
  }
}

// Wraps a whole page's render. Logged last, so the per-query lines above it
// add up to something that can be compared against the total - if they do not,
// the time is in the render itself and not in the data.
export function pageTimer(name: string) {
  const started = Date.now();
  return () => console.log(`[timing] ${name} TOTAL ${Date.now() - started}ms`);
}
