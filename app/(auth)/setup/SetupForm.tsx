"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { setupAction, type SetupState } from "./actions";

const initialState: SetupState = {};

export function SetupForm() {
  const [state, formAction] = useActionState(setupAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <FormField label="Your name" name="name" required autoComplete="name" />
      <FormField label="Email" name="email" type="email" required autoComplete="email" />
      <FormField
        label="Password"
        name="password"
        type="password"
        required
        autoComplete="new-password"
      />
      <FormField label="Business name" name="businessName" required autoComplete="organization" />
      <SubmitButton pendingText="Creating…">Create admin account</SubmitButton>
    </form>
  );
}
