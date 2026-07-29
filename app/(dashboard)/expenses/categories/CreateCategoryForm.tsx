"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { createExpenseCategoryAction, type ExpenseCategoryFormState } from "./actions";

const initialState: ExpenseCategoryFormState = {};

export function CreateCategoryForm() {
  const [state, formAction] = useActionState(createExpenseCategoryAction, initialState);

  return (
    <form action={formAction} className="flex max-w-sm items-end gap-2">
      <div className="flex-1">
        <FormField label="New category name" name="name" required />
      </div>
      <SubmitButton pendingText="Adding…">Add</SubmitButton>
      <FormError message={state.error} />
    </form>
  );
}
