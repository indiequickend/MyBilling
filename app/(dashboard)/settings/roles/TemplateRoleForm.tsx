"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { Field, FieldLabel } from "@/components/ui/field";
import { createRoleFromTemplateAction, type RolesPageState } from "./actions";
import { ROLE_TEMPLATES } from "@/lib/rbac/templates";

const initialState: RolesPageState = {};

export function TemplateRoleForm() {
  const [state, formAction] = useActionState(createRoleFromTemplateAction, initialState);
  const templateNames = Object.keys(ROLE_TEMPLATES);

  return (
    <form action={formAction} className="flex max-w-xl items-end gap-3">
      <div className="flex-1 space-y-4">
        <FormError message={state.error} />
        <FormNotice message={state.success} />
        <FormField label="Role name" name="name" required placeholder="e.g. Cashier" />
      </div>
      <Field className="w-40">
        <FieldLabel htmlFor="template">Based on</FieldLabel>
        <SelectField
          name="template"
          defaultValue={templateNames[0]}
          placeholder="Template"
          options={templateNames.map((t) => ({ value: t, label: t }))}
        />
      </Field>
      <SubmitButton pendingText="Creating…" className="w-auto">
        Create
      </SubmitButton>
    </form>
  );
}
