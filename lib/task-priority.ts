import type { Tone } from "@/components/ui/badge";

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
