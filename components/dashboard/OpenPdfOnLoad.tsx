"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";

// Only same-origin PDF routes — the value comes from the URL, so it must never be an open redirect.
const PDF_PATH = /^\/api\/[a-z0-9/-]+\/pdf$/i;

/**
 * "Save & Print" flows end in a server-action redirect, which can only replace the current tab.
 * They redirect to the saved document with `?openPdf=<pdf route>` instead; this opens that PDF in
 * a new tab, then strips the param so a refresh doesn't reopen it. If the browser blocks the
 * popup, a dismissible notice offers the same link.
 */
function OpenPdfOnLoadInner() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("openPdf");
  const [blockedHref, setBlockedHref] = useState<string | null>(null);

  useEffect(() => {
    if (!requested || !PDF_PATH.test(requested)) return;
    const opened = window.open(requested, "_blank", "noopener,noreferrer");
    if (!opened) setBlockedHref(requested);
    const url = new URL(window.location.href);
    url.searchParams.delete("openPdf");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [requested]);

  if (!blockedHref) return null;
  return (
    <div className="fixed right-4 bottom-20 z-50 flex items-center gap-3 rounded-lg border bg-background p-3 text-sm shadow-lg md:bottom-4">
      <span>Your PDF is ready.</span>
      <a
        href={blockedHref}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline"
        onClick={() => setBlockedHref(null)}
      >
        Open PDF
      </a>
      <button type="button" aria-label="Dismiss" onClick={() => setBlockedHref(null)}>
        <X className="size-4" />
      </button>
    </div>
  );
}

export function OpenPdfOnLoad() {
  return (
    <Suspense fallback={null}>
      <OpenPdfOnLoadInner />
    </Suspense>
  );
}
