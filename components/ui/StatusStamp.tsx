import * as React from "react";
import { cn } from "@/lib/utils";

export type StatusStampVariant = "success" | "warning" | "danger" | "outline" | "brass";

const VARIANT_CLASSES: Record<StatusStampVariant, string> = {
  success: "bg-success/60 text-success-foreground",
  warning: "bg-warning/60 text-warning-foreground",
  danger: "bg-danger/60 text-danger-foreground",
  brass: "bg-brass/60 text-brass-foreground",
  outline: "bg-transparent text-foreground",
};

/**
 * Deterministic -2..2 degree rotation from a stable seed (a document id/number).
 * Never Math.random()/Date.now() — must render identically on server and
 * client or React will flag a hydration mismatch.
 */
export function seedRotation(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const normalized = (Math.abs(hash) % 401) / 100; // 0..4
  return normalized - 2; // -2..2
}

/**
 * The app's signature visual element — an ink-rubber-stamp-styled status
 * badge. Prop-compatible with `Badge` (`variant` maps 1:1 to the same
 * success|warning|danger|outline semantic tokens, plus `brass`) so document
 * status call sites are a near-mechanical swap. `seed` (a stable per-document
 * id) drives a deterministic slight rotation so every stamp looks hand-applied
 * without jittering between renders.
 */
export function StatusStamp({
  variant = "outline",
  seed,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { variant?: StatusStampVariant; seed: string }) {
  const rotation = seedRotation(seed);

  return (
    <span
      data-slot="status-stamp"
      data-variant={variant}
      className={cn(
        "inline-flex w-fit shrink-0 items-center justify-center whitespace-nowrap rounded-sm border border-current px-2 py-0.5 font-heading text-[10px] font-semibold tracking-widest uppercase shadow-[inset_0_0_0_2px_currentColor]",
        VARIANT_CLASSES[variant],
        className,
      )}
      style={{ transform: `rotate(${rotation}deg)` }}
      {...props}
    >
      {children}
    </span>
  );
}
