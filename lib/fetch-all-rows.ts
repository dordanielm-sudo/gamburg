import "server-only";

// PostgREST caps any single select() at db.max_rows (1000 here) regardless of
// how large a .range() is requested. Past that, a query does not error - it
// silently returns the first 1000 rows, so a screen looks fine while quietly
// working off a fraction of the data. That is how the dashboard came to
// compute every KPI on 1000 cases out of thousands.
//
// The loop below was written out by hand on four screens before this. One
// copy, so the next screen that needs it gets the tie-breaking right for free.
export const PAGE_SIZE = 1000;

/**
 * Runs `page(from, to)` repeatedly until a batch comes back short of a full
 * page, concatenating the results.
 *
 * The query inside `page` must order by something **unique as a tiebreaker**
 * (id is the obvious choice) on top of its real sort column. Without it, rows
 * with equal sort values can land in a different order on each round trip, and
 * the same row is then skipped or returned twice across the batch boundary.
 */
export async function fetchAllRows<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error };
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return { data: all, error: null };
}
