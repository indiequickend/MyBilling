"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export type RevealResult = { ok: true; value: string } | { ok: false; error: string };

/** A masked value with an eye-icon toggle that fetches the real value on demand — the server
 * action passed in is expected to permission-check and audit-log the reveal itself (see e.g.
 * revealCustomerGstinAction). Nothing here ever holds the unmasked value until the user asks. */
export function RevealField({
  maskedValue,
  reveal,
}: {
  maskedValue: string;
  reveal: () => Promise<RevealResult>;
}) {
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (revealedValue !== null) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span>{revealedValue}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => setRevealedValue(null)}
          aria-label="Hide value"
        >
          <EyeOff />
        </Button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular-nums">{maskedValue}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={pending}
        aria-label="Reveal value"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await reveal();
            if (result.ok) setRevealedValue(result.value);
            else setError(result.error);
          })
        }
      >
        <Eye />
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
