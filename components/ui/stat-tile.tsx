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
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
      <div className={`text-3xl font-extrabold tabular-nums sm:text-4xl ${TONE_TEXT[tone]}`}>
        {value}
      </div>
      <div className="mt-1.5 text-sm font-medium text-gray-500">{label}</div>
    </div>
  );
}
