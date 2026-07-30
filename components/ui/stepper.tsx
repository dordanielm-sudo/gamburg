type StepState = "done" | "current" | "future";

const CIRCLE_STYLE: Record<StepState, string> = {
  done: "bg-emerald-600 text-white",
  current: "bg-blue-600 text-white ring-4 ring-blue-100",
  future: "border-2 border-gray-300 bg-white text-gray-400",
};

const CONNECTOR_STYLE: Record<StepState, string> = {
  done: "bg-emerald-400",
  current: "bg-blue-300",
  future: "bg-gray-200",
};

// horizontal numbered-step workflow indicator - currentIndex -1 means the
// case's current value doesn't match any of these steps (no highlight)
export function Stepper({
  steps,
  currentIndex,
  onSelect,
}: {
  steps: string[];
  currentIndex: number;
  onSelect?: (index: number) => void;
}) {
  return (
    <div className="flex items-start overflow-x-auto pb-1">
      {steps.map((label, i) => {
        const state: StepState =
          currentIndex === -1 ? "future" : i < currentIndex ? "done" : i === currentIndex ? "current" : "future";
        const connectorState: StepState =
          currentIndex !== -1 && i < currentIndex ? "done" : "future";
        return (
          <div key={label} className="flex min-w-[84px] flex-1 items-start last:flex-none">
            <div className="flex flex-col items-center gap-1.5 text-center">
              <button
                type="button"
                onClick={onSelect ? () => onSelect(i) : undefined}
                disabled={!onSelect}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${CIRCLE_STYLE[state]} ${
                  onSelect ? "cursor-pointer hover:opacity-80" : "cursor-default"
                }`}
              >
                {state === "done" ? "✓" : i + 1}
              </button>
              <div
                className={`w-20 text-[11px] leading-tight ${
                  state === "future" ? "text-gray-400" : "font-medium text-gray-800"
                }`}
              >
                {label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className={`mt-4 h-0.5 flex-1 ${CONNECTOR_STYLE[connectorState]}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
