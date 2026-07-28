"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
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
  category: string;
  label: string;
  prefs: DocumentPreferencesInput;
}) {
  return (
    <fieldset className="space-y-3 rounded-md border border-slate-200 p-4">
      <legend className="px-1 text-sm font-medium text-slate-900">{label}</legend>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name={`${category}__roundOff`} defaultChecked={prefs.roundOff} />
        Round off totals
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name={`${category}__showHeaderFieldSuggestions`}
          defaultChecked={prefs.showHeaderFieldSuggestions}
        />
        Show header-field suggestions
      </label>

      <label className="block max-w-xs text-sm">
        <span className="mb-1 block font-medium text-slate-700">Default discount type</span>
        <select
          name={`${category}__defaultDiscountType`}
          defaultValue={prefs.defaultDiscountType}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="percentage">Percentage</option>
          <option value="amount">Amount</option>
        </select>
      </label>

      <label className="block max-w-xs text-sm">
        <span className="mb-1 block font-medium text-slate-700">Default due date (days)</span>
        <input
          type="number"
          name={`${category}__defaultDueDateDays`}
          defaultValue={prefs.defaultDueDateDays}
          min={0}
          max={365}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
    </fieldset>
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
