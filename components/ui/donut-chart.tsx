import Link from "next/link";
import { Dot, TONE_HEX, type Tone } from "./badge";

export function DonutChart({
  segments,
  totalLabel = "סה״כ",
  size = 168,
  thickness = 28,
  hrefForSegment,
}: {
  segments: { label: string; value: number; tone: Tone }[];
  totalLabel?: string;
  size?: number;
  thickness?: number;
  // when provided, both the arc and the legend row for a segment become a
  // link to that href (e.g. a pre-filtered /cases list) - omit for a plain,
  // non-interactive chart
  hrefForSegment?: (label: string) => string | null;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const arcs = segments
    .filter((seg) => total > 0 && seg.value > 0)
    .reduce<Array<(typeof segments)[number] & { dash: number; offset: number }>>(
      (list, seg) => {
        const accSoFar = list.reduce((sum, a) => sum + a.value, 0);
        const dash = (seg.value / total) * circumference;
        const offset = -((accSoFar / total) * circumference);
        return [...list, { ...seg, dash, offset }];
      },
      [],
    );

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          {arcs.length === 0 ? (
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth={thickness}
            />
          ) : (
            arcs.map((arc) => {
              const href = hrefForSegment?.(arc.label);
              const circle = (
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={TONE_HEX[arc.tone]}
                  strokeWidth={thickness}
                  strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                  strokeDashoffset={arc.offset}
                  className={href ? "cursor-pointer transition-opacity hover:opacity-75" : undefined}
                >
                  <title>{`${arc.label}: ${arc.value}`}</title>
                </circle>
              );
              // a plain <a> (not next/link) - it's an SVG child here, and
              // next/link's special client-nav handling doesn't apply
              // inside <svg> anyway
              return href ? (
                <a key={arc.label} href={href}>
                  {circle}
                </a>
              ) : (
                <g key={arc.label}>{circle}</g>
              );
            })
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900">{total}</span>
          <span className="text-[11px] text-gray-400">{totalLabel}</span>
        </div>
      </div>
      <ul className="min-w-[160px] space-y-1.5 text-sm">
        {segments.map((seg) => {
          const href = hrefForSegment?.(seg.label);
          const content = (
            <>
              <Dot tone={seg.tone} />
              <span className="text-gray-600">{seg.label}</span>
              <span className="font-semibold text-gray-900">{seg.value}</span>
            </>
          );
          return (
            <li key={seg.label} className="flex items-center gap-2">
              {href ? (
                <Link href={href} className="flex items-center gap-2 hover:text-blue-700">
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
