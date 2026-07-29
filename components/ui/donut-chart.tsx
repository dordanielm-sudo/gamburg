import { Dot, TONE_HEX, type Tone } from "./badge";

export function DonutChart({
  segments,
  totalLabel = "סה״כ",
  size = 168,
  thickness = 28,
}: {
  segments: { label: string; value: number; tone: Tone }[];
  totalLabel?: string;
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  let acc = 0;
  const stops: string[] = [];
  for (const seg of segments) {
    if (total <= 0 || seg.value <= 0) continue;
    const start = (acc / total) * 360;
    acc += seg.value;
    const end = (acc / total) * 360;
    stops.push(`${TONE_HEX[seg.tone]} ${start}deg ${end}deg`);
  }
  const gradient =
    stops.length > 0 ? `conic-gradient(${stops.join(", ")})` : "conic-gradient(#e5e7eb 0deg 360deg)";

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div
        className="relative shrink-0 rounded-full"
        style={{ width: size, height: size, background: gradient }}
      >
        <div
          className="absolute rounded-full bg-white"
          style={{ top: thickness, left: thickness, right: thickness, bottom: thickness }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900">{total}</span>
          <span className="text-[11px] text-gray-400">{totalLabel}</span>
        </div>
      </div>
      <ul className="min-w-[160px] space-y-1.5 text-sm">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-2">
            <Dot tone={seg.tone} />
            <span className="text-gray-600">{seg.label}</span>
            <span className="font-semibold text-gray-900">{seg.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
