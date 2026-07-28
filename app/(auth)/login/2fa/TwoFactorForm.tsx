"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { verifyTotpAction, type TwoFactorState } from "./actions";

const initialState: TwoFactorState = {};

export function TwoFactorForm() {
  const [state, formAction] = useActionState(verifyTotpAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <FormField
        label="6-digit code or backup code"
        name="code"
        required
        autoComplete="one-time-code"
      />
      <SubmitButton pendingText="Verifying…">Verify</SubmitButton>
    </form>
  );
}
