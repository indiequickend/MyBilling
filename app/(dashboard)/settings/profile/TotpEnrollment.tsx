"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { Button } from "@/components/ui/button";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import {
  startTotpEnrollmentAction,
  confirmTotpEnrollmentAction,
  disableTotpAction,
} from "./actions";

export function TotpEnrollment({ enabled }: { enabled: boolean }) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "done">("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string>();
  const [secret, setSecret] = useState<string>();
  const [backupCodes, setBackupCodes] = useState<string[]>();
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  if (enabled) {
    return (
      <div className="space-y-3">
        <FormNotice message="Two-factor authentication is enabled." />
        <form action={disableTotpAction}>
          <Button type="submit" variant="outline">
            Disable 2FA
          </Button>
        </form>
      </div>
    );
  }

  if (phase === "done" && backupCodes) {
    return (
      <div className="space-y-3">
        <FormNotice message="Two-factor authentication is enabled. Save these backup codes — each works once if you lose access to your authenticator app." />
        <ul className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/30 p-4 font-mono text-sm">
          {backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (phase === "confirm" && qrDataUrl) {
    return (
      <div className="max-w-sm space-y-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated data: URI, not an optimizable static/remote image */}
        <img src={qrDataUrl} alt="Scan with your authenticator app" width={200} height={200} />
        {secret ? (
          <p className="text-xs text-muted-foreground">
            Can&apos;t scan it? Enter this code manually:{" "}
            <span data-testid="totp-secret" className="font-mono">
              {secret}
            </span>
          </p>
        ) : null}
        <FormError message={error} />
        <form
          action={(formData) => {
            startTransition(async () => {
              const result = await confirmTotpEnrollmentAction(formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setBackupCodes(result.backupCodes);
              setPhase("done");
            });
          }}
          className="space-y-4"
        >
          <FormField label="6-digit code" name="code" required autoComplete="one-time-code" />
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
            {isPending ? "Verifying…" : "Confirm"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await startTotpEnrollmentAction();
          setQrDataUrl(result.qrDataUrl);
          setSecret(result.secret);
          setPhase("confirm");
        });
      }}
    >
      {isPending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      {isPending ? "Starting…" : "Enable 2FA"}
    </Button>
  );
}
