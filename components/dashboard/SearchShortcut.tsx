"use client";

import { useEffect } from "react";
import { Search } from "lucide-react";

function focusPageSearch() {
  document.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
}

/** Focuses the current page's own search box (list pages each have one) — not a new global-search backend. */
export function SearchShortcut() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusPageSearch();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <button
      type="button"
      onClick={focusPageSearch}
      className="hidden h-8 w-full max-w-64 items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground hover:bg-muted md:flex"
    >
      <Search className="size-3.5" />
      <span className="flex-1 truncate text-left">Search this page…</span>
      <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">Ctrl K</kbd>
    </button>
  );
}
