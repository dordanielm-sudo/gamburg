// Reading a webhook body that may carry one record or many.
//
// Make bills per bundle through every module - an Iterator does not merge
// anything, it bills - so the only way to cut the operation count on a sweep
// is to send fewer HTTP calls with more in each. case-field-sync established
// the shape and the arithmetic: ~96,000 operations a month at one call per
// record, ~2,000 at a hundred per call. This is that logic, lifted out so
// case-sync, task-sync and deadline-sync can accept the same three shapes
// without three copies of the parsing - including the two ways Make gets it
// subtly wrong.
//
//   { ...record }              one record, the original shape
//   { batches: [ ... ] }       many at once
//   [ ... ]                    the same, unwrapped
//
// The single shape keeps working untouched, so an existing scenario carries
// on while the others move over one at a time.

export interface BatchRead<T> {
  records: T[];
  // True when the body carried many. Callers use it to decide whether to
  // answer with one record's result or with counts, and to keep the whole
  // batch out of webhook_logs.
  batched: boolean;
  // Shapes that work but suggest the scenario is mapped wrong. Returned
  // rather than rejected - the data arrived and is usable, and a warning in
  // the log is what leads someone to the mapping later.
  warnings: string[];
  error?: string;
}

export function readBatch<T>(rawBody: unknown): BatchRead<T> {
  const warnings: string[] = [];

  // A bare array. Valid, and worth a note: the mapped field was sent without
  // its wrapper, which usually means the HTTP module's body is the raw
  // aggregator output rather than {"batches": ...}.
  if (Array.isArray(rawBody)) {
    if (rawBody.length === 0) {
      return { records: [], batched: true, warnings, error: "batch is empty" };
    }
    warnings.push(
      'the body is a bare array - it was read as the batch list, but the expected shape is {"batches": [...]}',
    );
    return { records: rawBody as T[], batched: true, warnings };
  }

  if (!rawBody || typeof rawBody !== "object") {
    return {
      records: [],
      batched: false,
      warnings,
      error: "body must be an object or an array",
    };
  }

  const body = rawBody as { batches?: unknown };
  if (body.batches === undefined || body.batches === null) {
    // One record in the original shape.
    return { records: [rawBody as T], batched: false, warnings };
  }

  let input = body.batches;

  // Make maps an aggregator's output into a text field often enough that
  // this arrives as a quoted JSON string - {"batches":"[{...}]"} rather than
  // {"batches":[{...}]}. That is valid JSON of the wrong shape, and without
  // this it would read as "not an array" and reject a request whose data is
  // perfectly fine.
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      return {
        records: [],
        batched: true,
        warnings,
        error: "batches arrived as a string that is not valid JSON",
      };
    }
    warnings.push(
      "batches arrived as a JSON string rather than an array - the mapped field is wrapped in quotes in the request body",
    );
  }

  if (!Array.isArray(input)) {
    return {
      records: [],
      batched: true,
      warnings,
      error: `batches must be an array, received ${typeof input}`,
    };
  }

  if (input.length === 0) {
    return { records: [], batched: true, warnings, error: "batches array is empty" };
  }

  return { records: input as T[], batched: true, warnings };
}

// What one record in a batch came to. Collected rather than thrown so a
// single bad row does not discard the ninety-nine good ones in the same
// call - the whole point of batching is that a sweep keeps moving.
export interface BatchOutcome {
  ref: string;
  status: "ok" | "skipped" | "error";
  message?: string;
}

export function summarize(outcomes: BatchOutcome[]) {
  return {
    processed: outcomes.length,
    ok: outcomes.filter((o) => o.status === "ok").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
    failed: outcomes.filter((o) => o.status === "error").length,
  };
}

// Runs an async operation over many items with a ceiling on how many are in
// flight at once.
//
// A batch endpoint that awaits each record in turn spends the whole call
// waiting on round trips: at four or five queries per record, a hundred
// records is five hundred sequential trips, and Make gives up at forty
// seconds. Unbounded parallelism is the other extreme - a hundred records
// at once is a hundred connections against one small Postgres instance.
//
// Order of results matches the order of items, so a caller can still pair
// them with what it sent.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}
