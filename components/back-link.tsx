"use client";

import { useRouter } from "next/navigation";

// A "back" link that actually goes back, rather than to a fixed URL.
//
// The case detail page's link used to be a plain <Link href="/cases">, so
// arriving from a filtered or chart-driven view (dashboard donut slice ->
// filtered cases list -> a case) and clicking back landed on the bare,
// unfiltered list - the filter was right there in the previous history
// entry, just not the one this link pointed at.
//
// router.back() replays that entry exactly, filter and all. The fallback
// only matters when there is nothing to go back to - the page was opened
// directly (a bookmark, a shared link, a new tab) - where a plain link is
// the only sane behaviour.
export function BackLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();

  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        // A modified click (new tab, new window, middle-click) means the
        // user wants a real navigation to href, not an in-place history pop.
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
          return;
        }
        if (typeof window !== "undefined" && window.history.length > 1) {
          e.preventDefault();
          router.back();
        }
      }}
    >
      {children}
    </a>
  );
}
