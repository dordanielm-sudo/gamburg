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
      <div className="mb-4 flex w-fit items-center gap-1 rounded-full bg-gray-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab?.id === t.id
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {activeTab?.content}
    </div>
  );
}
