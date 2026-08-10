import type { Tone } from "@/components/ui/badge";

// A priority as עדכנית sends it: a code that drives the colour, and the name
// people read. They always travel together.
export interface PriorityOption {
  code: number;
  name: string;
}

// Lives here rather than beside the editor because server components call it
// too, and everything exported from a "use client" module becomes a client
// reference - calling one from the server throws at request time, with no
// hint as to which call it was.
export function collectPriorityOptions(
  tasks: { priority_code: number | null; priority_name: string | null }[],
): PriorityOption[] {
  const byCode = new Map<number, string>();
  for (const t of tasks) {
    if (t.priority_code === null) continue;
    const name = t.priority_name ?? String(t.priority_code);
    // first name wins; a later blank must not overwrite a real one
    if (!byCode.has(t.priority_code)) byCode.set(t.priority_code, name);
  }
  return [...byCode.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.code - b.code);
}

// Priority is synced as-is from עדכנית (PriorityCode/PriorityName) with no
// fixed enum on the source side - only two codes have been observed so far
// (2=רגילה, 3=גבוהה) and more may appear, so anything above רגילה is
// treated as "stands out" rather than matching against a hardcoded list.
export const NORMAL_PRIORITY_CODE = 2;
export const HIGH_PRIORITY_CODE = 3;

export function priorityTone(code: number | null | undefined): Tone {
  if (code === null || code === undefined) return "gray";
  if (code >= HIGH_PRIORITY_CODE) return "amber";
  if (code <= NORMAL_PRIORITY_CODE) return "gray";
  return "blue";
}

export function priorityLabel(
  code: number | null | undefined,
  name: string | null | undefined,
): string | null {
  if (name) return name;
  if (code === null || code === undefined) return null;
  return String(code);
}
