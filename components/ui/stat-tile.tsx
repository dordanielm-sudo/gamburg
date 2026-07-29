import { TONE_TEXT, type Tone } from "./badge";

export function StatTile({
  label,
  value,
  tone = "indigo",
}: {
  label: string;
  value: number | string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`text-4xl font-extrabold tabular-nums ${TONE_TEXT[tone]}`}>
        {value}
      </div>
      <div className="mt-1.5 text-sm font-medium text-gray-500">{label}</div>
    </div>
  );
}
