"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { resendVerificationAction, type ResendVerificationState } from "./actions";

const initialState: ResendVerificationState = {};

export function ResendVerificationForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(resendVerificationAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <FormError message={state.error} />
      <FormNotice message={state.success} />
      <input type="hidden" name="email" value={email} />
      <SubmitButton pendingText="Sending…">Resend verification email</SubmitButton>
    </form>
  );
}
