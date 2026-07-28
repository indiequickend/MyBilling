"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
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

      <div className="grid grid-cols-2 gap-4">
        {defs.map((def) => {
          const value = values[def.key];
          if (def.type === "select") {
            return (
              <label key={def.key} className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  {def.label}
                  {def.required ? " *" : ""}
                </span>
                <select
                  name={def.key}
                  defaultValue={typeof value === "string" ? value : ""}
                  required={def.required}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select…</option>
                  {def.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                {state.fieldErrors?.[def.key] ? (
                  <span role="alert" className="mt-1 block text-xs text-red-600">
                    {state.fieldErrors[def.key]}
                  </span>
                ) : null}
              </label>
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
