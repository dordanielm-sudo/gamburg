// shared color language for statuses across the app - a small fixed set of
// semantic tones, each with a light badge style, a solid dot/circle style,
// a text color, and a hex value (for SVG/CSS that can't take a Tailwind
// class, like the donut chart).
export type Tone = "gray" | "blue" | "amber" | "green" | "rose" | "purple" | "indigo";

export const TONE_BADGE: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-600",
  blue: "bg-blue-50 text-blue-700",
  amber: "bg-amber-50 text-amber-700",
  green: "bg-emerald-50 text-emerald-700",
  rose: "bg-rose-50 text-rose-700",
  purple: "bg-purple-50 text-purple-700",
  indigo: "bg-indigo-50 text-indigo-700",
};

export const TONE_DOT: Record<Tone, string> = {
  gray: "bg-gray-400",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  rose: "bg-rose-500",
  purple: "bg-purple-500",
  indigo: "bg-indigo-500",
};

export const TONE_SOLID: Record<Tone, string> = {
  gray: "bg-gray-400",
  blue: "bg-blue-600",
  amber: "bg-amber-500",
  green: "bg-emerald-600",
  rose: "bg-rose-600",
  purple: "bg-purple-600",
  indigo: "bg-indigo-600",
};

export const TONE_TEXT: Record<Tone, string> = {
  gray: "text-gray-600",
  blue: "text-blue-600",
  amber: "text-amber-600",
  green: "text-emerald-600",
  rose: "text-rose-600",
  purple: "text-purple-600",
  indigo: "text-indigo-600",
};

export const TONE_HEX: Record<Tone, string> = {
  gray: "#9ca3af",
  blue: "#3b82f6",
  amber: "#f59e0b",
  green: "#10b981",
  rose: "#f43f5e",
  purple: "#a855f7",
  indigo: "#6366f1",
};

export function Dot({ tone = "gray", className = "" }: { tone?: Tone; className?: string }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${TONE_DOT[tone]} ${className}`}
    />
  );
}

const BADGE_SIZE = {
  sm: "px-2.5 py-1 text-xs gap-1.5",
  md: "px-3 py-1.5 text-sm gap-2 font-semibold",
};

export function Badge({
  tone = "gray",
  dot = false,
  size = "sm",
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  size?: keyof typeof BADGE_SIZE;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ${BADGE_SIZE[size]} ${TONE_BADGE[tone]}`}
    >
      {dot && <Dot tone={tone} />}
      {children}
    </span>
  );
}

// deterministic color for free-text values with no fixed semantic mapping
// (e.g. status strings synced verbatim from עדכנית) - same string always
// gets the same tone, so the UI stays visually stable across reloads
const HASH_TONES: Tone[] = ["blue", "purple", "indigo", "amber", "green", "rose"];

export function hashTone(value: string): Tone {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return HASH_TONES[Math.abs(hash) % HASH_TONES.length];
}
