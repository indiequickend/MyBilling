"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { updateProfileAction, type ProfileState } from "./actions";

const initialState: ProfileState = {};

export function ProfileForm({ name, phone }: { name: string; phone?: string }) {
  const [state, formAction] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="max-w-sm space-y-4">
      <FormError message={state.error} />
      {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
      <FormField label="Name" name="name" required defaultValue={name} autoComplete="name" />
      <FormField label="Phone (optional)" name="phone" defaultValue={phone} autoComplete="tel" />
      <SubmitButton pendingText="Saving…">Save</SubmitButton>
    </form>
  );
}
