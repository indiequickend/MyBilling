"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { createBusinessAction, type CreateBusinessState } from "../actions";

const initialState: CreateBusinessState = {};

export function CreateBusinessForm() {
  const [state, formAction] = useActionState(createBusinessAction, initialState);

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <FormError message={state.error} />
      <FormField label="Business name" name="name" required autoComplete="organization" />
      <SubmitButton pendingText="Creating…">Create business</SubmitButton>
    </form>
  );
}
