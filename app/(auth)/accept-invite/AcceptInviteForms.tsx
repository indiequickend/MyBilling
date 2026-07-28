"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import {
  acceptInviteNewUserAction,
  acceptInviteExistingUserAction,
  type AcceptInviteState,
} from "./actions";

const initialState: AcceptInviteState = {};

export function NewUserAcceptForm({ token, email }: { token: string; email: string }) {
  const [state, formAction] = useActionState(acceptInviteNewUserAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-slate-600">
        Creating an account for <span className="font-medium text-slate-900">{email}</span>
      </p>
      <FormField label="Your name" name="name" required autoComplete="name" />
      <FormField
        label="Password"
        name="password"
        type="password"
        required
        autoComplete="new-password"
      />
      <SubmitButton pendingText="Creating account…">Accept & create account</SubmitButton>
    </form>
  );
}

export function ExistingUserAcceptForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(acceptInviteExistingUserAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingText="Accepting…">Accept invitation</SubmitButton>
    </form>
  );
}
