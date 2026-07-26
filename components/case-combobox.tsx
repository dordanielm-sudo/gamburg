"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface CaseOption {
  id: string;
  case_number: string;
  case_name: string;
}

// One control instead of three (a plain select, a separate search box to
// filter it, and a manual "type the number" fallback) - type a case number
// or name, matching cases (number-prefix matches first, so a typed number
// always jumps to the top) show in a dropdown, click one to select. Typing
// text that never gets clicked is still reported via onTextChange, so a
// caller can resolve it as a raw case_number on submit if it wants that
// fallback (see task-board.tsx/deadlines-board.tsx's case_number_manual).
export function CaseCombobox({
  cases,
  label,
  placeholder = "הקלד מספר תיק או שם...",
  initialText = "",
  onSelect,
  onTextChange,
  className,
}: {
  cases: CaseOption[];
  label?: string;
  placeholder?: string;
  initialText?: string;
  onSelect: (c: CaseOption) => void;
  onTextChange?: (text: string) => void;
  className?: string;
}) {
  const [query, setQuery] = useState(initialText);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cases.slice(0, 8);
    const starts: CaseOption[] = [];
    const contains: CaseOption[] = [];
    for (const c of cases) {
      const num = c.case_number.toLowerCase();
      const name = c.case_name.toLowerCase();
      if (num.startsWith(q)) starts.push(c);
      else if (num.includes(q) || name.includes(q)) contains.push(c);
    }
    return [...starts, ...contains].slice(0, 8);
  }, [cases, query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleSelect(c: CaseOption) {
    setQuery(`${c.case_number} - ${c.case_name}`);
    setOpen(false);
    onSelect(c);
  }

  function handleChange(text: string) {
    setQuery(text);
    setOpen(true);
    onTextChange?.(text);
  }

  function handleClear() {
    setQuery("");
    onTextChange?.("");
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      {label && (
        <label className="mb-1 block text-xs text-gray-500">{label}</label>
      )}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-md border border-gray-300 px-3 py-2 pl-7 text-sm focus:border-gray-500 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="נקה"
            className="absolute top-1/2 left-2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
          >
            ✕
          </button>
        )}
      </div>
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full min-w-[220px] overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => handleSelect(c)}
                className="block w-full px-3 py-2 text-right text-sm hover:bg-gray-50"
              >
                {c.case_number} - {c.case_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
