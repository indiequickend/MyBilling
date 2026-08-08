"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { createPriceListAction, type PriceListFormState } from "./actions";

const initialState: PriceListFormState = {};

export function CreatePriceListForm() {
  const [state, formAction] = useActionState(createPriceListAction, initialState);

  return (
    <form action={formAction} className="flex max-w-md items-end gap-2">
      <div className="flex-1">
        <FormField label="New price list name" name="name" required />
      </div>
      <div className="flex-1">
        <FormField label="Description" name="description" />
      </div>
      <SubmitButton pendingText="Adding…" className="w-auto shrink-0">
        Add
      </SubmitButton>
      <FormError message={state.error} />
    </form>
  );
}
