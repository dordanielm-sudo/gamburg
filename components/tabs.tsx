"use client";

import { useState } from "react";

// generic tab switcher - starting point for the bigger חוצצים project, but
// scoped for now to whatever a page actually needs (e.g. a case's spouse
// tab). A single tab renders with no tab bar at all.
export function Tabs({
  tabs,
}: {
  tabs: { id: string; label: string; content: React.ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id);
  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];

  if (tabs.length <= 1) {
    return <>{tabs[0]?.content ?? null}</>;
  }

  return (
    <div>
      {/* A case can carry seven חוצצים, which is wider than a phone. The strip
          scrolls sideways instead of stretching the page, same as the main nav
          - w-max on the inner row is what lets it exceed the scroller. */}
      <div className="scroll-strip mb-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max items-center gap-1 rounded-full bg-gray-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab?.id === t.id
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
        </div>
      </div>
      {activeTab?.content}
    </div>
  );
}
