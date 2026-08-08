"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import type { DocumentNumberingConfigInput } from "@/lib/validation/preferences";
import { updateDocumentNumberingAction, type PreferencesPageState } from "../actions";

const initialState: PreferencesPageState = {};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function DocumentNumberingForm({
  fyStartMonth,
  invoiceConfig,
}: {
  fyStartMonth: number;
  invoiceConfig: DocumentNumberingConfigInput;
}) {
  const [state, formAction] = useActionState(updateDocumentNumberingAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <FormNotice message={state.success} />

      <FieldSet className="rounded-lg border p-4">
        <FieldLegend variant="label">Invoice numbering</FieldLegend>
        <FieldGroup className="max-w-xs gap-3">
          <FormField label="Prefix" name="invoice__prefix" defaultValue={invoiceConfig.prefix} placeholder="INV-" />
          <FormField
            label="Number padding"
            name="invoice__padding"
            type="number"
            defaultValue={String(invoiceConfig.padding)}
          />
          <Field>
            <FieldLabel htmlFor="invoice__resetPolicy">Reset</FieldLabel>
            <SelectField
              name="invoice__resetPolicy"
              defaultValue={invoiceConfig.resetPolicy}
              placeholder="Reset policy"
              options={[
                { value: "fiscal_year", label: "Every fiscal year" },
                { value: "never", label: "Never (one continuous series)" },
              ]}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="fyStartMonth">Fiscal year starts in</FieldLabel>
            <SelectField
              name="fyStartMonth"
              defaultValue={String(fyStartMonth)}
              placeholder="Month"
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      <div className="max-w-lg">
        <SubmitButton pendingText="Saving…">Save numbering settings</SubmitButton>
      </div>
    </form>
  );
}
