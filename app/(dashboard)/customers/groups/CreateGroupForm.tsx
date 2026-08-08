"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { createCustomerGroupAction, type PartyGroupFormState } from "./actions";

const initialState: PartyGroupFormState = {};

export function CreateGroupForm() {
  const [state, formAction] = useActionState(createCustomerGroupAction, initialState);

  return (
    <form action={formAction} className="flex max-w-sm items-end gap-2">
      <div className="flex-1">
        <FormField label="New group name" name="name" required />
      </div>
      <SubmitButton pendingText="Adding…" className="w-auto shrink-0">
        Add
      </SubmitButton>
      <FormError message={state.error} />
    </form>
  );
}
