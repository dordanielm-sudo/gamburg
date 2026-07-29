import { Badge, TONE_HEX, type Tone } from "./badge";

export type FieldValue = { label: string; value: React.ReactNode };

// a colored boxed card of label/value pairs - the shared "look" behind the
// case summary card and the task detail page, so any future detail screen
// (e.g. a deadline detail page) matches without reinventing the styling
export function FieldGroup({
  title,
  tone,
  fields,
}: {
  title: string;
  tone: Tone;
  fields: FieldValue[];
}) {
  return (
    <div
      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
      style={{ boxShadow: `inset -3px 0 0 0 ${TONE_HEX[tone]}` }}
    >
      <h3 className="mb-3">
        <Badge tone={tone} dot>
          {title}
        </Badge>
      </h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {fields.map((f) => (
          <div key={f.label}>
            <div className="text-xs text-gray-400">{f.label}</div>
            <div className="mt-0.5 text-sm font-medium text-gray-900">{f.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
