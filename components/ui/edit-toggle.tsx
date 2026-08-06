"use client";

// Shared "עריכת שדות" / "סיום עריכה" switch. Every screen that opens fields
// for editing uses this one, so the control looks and reads the same
// everywhere and a user learns it once.
export function EditToggle({
  editing,
  onToggle,
  hint,
}: {
  editing: boolean;
  onToggle: () => void;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {editing && hint && <p className="text-xs text-gray-400">{hint}</p>}
      <button
        onClick={onToggle}
        className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          editing
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
        }`}
      >
        {editing ? "סיום עריכה" : "עריכת שדות"}
      </button>
    </div>
  );
}

// Every synced screen shows the same sentence when edit mode opens.
export const SYNC_HINT = "שינויים נשמרים ביציאה מהשדה ונשלחים לעדכנית";
// ...and CRM-only screens say so explicitly, so nobody expects a change here
// to turn up in עדכנית.
export const LOCAL_HINT = "שינויים נשמרים ביציאה מהשדה";
