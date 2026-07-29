"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectField } from "@/components/ui/SelectField";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import type { DocumentPreferencesInput } from "@/lib/validation/preferences";
import { updateDocumentPreferencesAction, type PreferencesPageState } from "../actions";

const initialState: PreferencesPageState = {};

const SECTIONS: Array<{ key: "sales" | "purchases" | "conversions"; label: string }> = [
  { key: "sales", label: "Sales" },
  { key: "purchases", label: "Purchases" },
  { key: "conversions", label: "Conversions" },
];

function Section({
  category,
  label,
  prefs,
}: {
  category: "sales" | "purchases" | "conversions";
  label: string;
  prefs: DocumentPreferencesInput;
}) {
  return (
    <FieldSet className="rounded-lg border p-4">
      <FieldLegend variant="label">{label}</FieldLegend>
      <FieldGroup className="gap-3">
        <Field orientation="horizontal">
          <Checkbox name={`${category}__roundOff`} defaultChecked={prefs.roundOff} />
          <FieldLabel className="font-normal">Round off totals</FieldLabel>
        </Field>

        <Field orientation="horizontal">
          <Checkbox
            name={`${category}__showHeaderFieldSuggestions`}
            defaultChecked={prefs.showHeaderFieldSuggestions}
          />
          <FieldLabel className="font-normal">Show header-field suggestions</FieldLabel>
        </Field>

        <Field className="max-w-xs">
          <FieldLabel>Default discount type</FieldLabel>
          <SelectField
            name={`${category}__defaultDiscountType`}
            defaultValue={prefs.defaultDiscountType}
            placeholder="Type"
            options={[
              { value: "percentage", label: "Percentage" },
              { value: "amount", label: "Amount" },
            ]}
          />
        </Field>

        <Field className="max-w-xs">
          <FieldLabel htmlFor={`${category}-defaultDueDateDays`}>Default due date (days)</FieldLabel>
          <input
            id={`${category}-defaultDueDateDays`}
            type="number"
            name={`${category}__defaultDueDateDays`}
            defaultValue={prefs.defaultDueDateDays}
            min={0}
            max={365}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </Field>

        {category === "purchases" ? (
          <Field orientation="horizontal">
            <Checkbox
              name={`${category}__trackItcEligibility`}
              defaultChecked={prefs.trackItcEligibility}
            />
            <FieldLabel className="font-normal">
              Track ITC eligibility per line item
            </FieldLabel>
          </Field>
        ) : null}
      </FieldGroup>
    </FieldSet>
  );
}

export function DocumentPreferencesForm({
  preferences,
}: {
  preferences: {
    sales: DocumentPreferencesInput;
    purchases: DocumentPreferencesInput;
    conversions: DocumentPreferencesInput;
  };
}) {
  const [state, formAction] = useActionState(updateDocumentPreferencesAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <FormNotice message={state.success} />

      {SECTIONS.map((s) => (
        <Section key={s.key} category={s.key} label={s.label} prefs={preferences[s.key]} />
      ))}

      <div className="max-w-xs">
        <SubmitButton pendingText="Saving…">Save document preferences</SubmitButton>
      </div>
    </form>
  );
}
