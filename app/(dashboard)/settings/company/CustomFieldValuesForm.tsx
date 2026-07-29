"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { Field, FieldLabel } from "@/components/ui/field";
import type { CustomFieldType } from "@/lib/validation/shared";
import { updateCustomFieldValuesAction, type CompanyPageState } from "./actions";

const initialState: CompanyPageState = {};

export function CustomFieldValuesForm({
  defs,
  values,
}: {
  defs: Array<{
    key: string;
    label: string;
    type: CustomFieldType;
    options: string[];
    required: boolean;
  }>;
  values: Record<string, unknown>;
}) {
  const [state, formAction] = useActionState(updateCustomFieldValuesAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <FormNotice message={state.success} />

      <div className="grid gap-4 sm:grid-cols-2">
        {defs.map((def) => {
          const value = values[def.key];
          if (def.type === "select") {
            return (
              <Field key={def.key}>
                <FieldLabel htmlFor={def.key}>
                  {def.label}
                  {def.required ? " *" : ""}
                </FieldLabel>
                <SelectField
                  name={def.key}
                  defaultValue={typeof value === "string" ? value : ""}
                  placeholder="Select…"
                  required={def.required}
                  options={def.options.map((o) => ({ value: o, label: o }))}
                />
                {state.fieldErrors?.[def.key] ? (
                  <p className="text-sm text-destructive">{state.fieldErrors[def.key]}</p>
                ) : null}
              </Field>
            );
          }
          return (
            <FormField
              key={def.key}
              label={def.required ? `${def.label} *` : def.label}
              name={def.key}
              type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
              required={def.required}
              defaultValue={
                typeof value === "string" || typeof value === "number" ? String(value) : ""
              }
              error={state.fieldErrors?.[def.key]}
            />
          );
        })}
      </div>

      <div className="max-w-xs">
        <SubmitButton pendingText="Saving…">Save field values</SubmitButton>
      </div>
    </form>
  );
}
