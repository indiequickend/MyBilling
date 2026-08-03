"use client";

import { useEffect } from "react";

/**
 * Registered as a real client-bundle module (not an inline <script> tag) so
 * it is covered by middleware.ts's nonce-based script-src automatically —
 * no CSP changes needed. Renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installability/offline-fallback is a progressive enhancement —
        // never block or surface an error to the user if this fails.
      });
    }
  }, []);

  return null;
}
