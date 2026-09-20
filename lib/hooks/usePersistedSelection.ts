"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A list of selected ids (visible columns, search fields) remembered in this browser's
 * localStorage under `storageKey`. Renders with `defaults` first (matching the server render, so
 * no hydration mismatch) and swaps in the saved choice after mount. Saved ids not in `validIds`
 * are dropped (e.g. a since-deleted custom field). Every storage access is guarded, so private
 * windows or blocked storage just fall back to the defaults.
 */
export function usePersistedSelection(
  storageKey: string,
  defaults: string[],
  validIds: string[],
  options: { initial?: string[]; skipLoad?: boolean } = {},
) {
  const [selected, setSelected] = useState<string[]>(options.initial ?? defaults);
  const [loaded, setLoaded] = useState(false);
  const validRef = useRef(validIds);
  validRef.current = validIds;
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  const skipLoad = options.skipLoad ?? false;

  useEffect(() => {
    if (skipLoad) {
      setLoaded(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid = new Set(validRef.current);
          const ids = parsed.filter((v): v is string => typeof v === "string" && valid.has(v));
          if (ids.length > 0) setSelected(ids);
        }
      }
    } catch {
      // storage unavailable or corrupt: keep defaults
    }
    setLoaded(true);
  }, [storageKey, skipLoad]);

  const update = useCallback(
    (next: string[]) => {
      setSelected(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore: the choice just won't persist
      }
    },
    [storageKey],
  );

  const reset = useCallback(() => {
    setSelected(defaultsRef.current);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  return { selected, update, reset, loaded };
}
