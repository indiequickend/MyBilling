"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
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

      <fieldset className="space-y-3 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-900">Invoice numbering</legend>

        <label className="block max-w-xs text-sm">
          <span className="mb-1 block font-medium text-slate-700">Prefix</span>
          <input
            name="invoice__prefix"
            defaultValue={invoiceConfig.prefix}
            placeholder="INV-"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block max-w-xs text-sm">
          <span className="mb-1 block font-medium text-slate-700">Number padding</span>
          <input
            type="number"
            name="invoice__padding"
            min={1}
            max={10}
            defaultValue={invoiceConfig.padding}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="block max-w-xs text-sm">
          <span className="mb-1 block font-medium text-slate-700">Reset</span>
          <select
            name="invoice__resetPolicy"
            defaultValue={invoiceConfig.resetPolicy}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="fiscal_year">Every fiscal year</option>
            <option value="never">Never (one continuous series)</option>
          </select>
        </label>

        <label className="block max-w-xs text-sm">
          <span className="mb-1 block font-medium text-slate-700">Fiscal year starts in</span>
          <select
            name="fyStartMonth"
            defaultValue={fyStartMonth}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <div className="max-w-xs">
        <SubmitButton pendingText="Saving…">Save numbering settings</SubmitButton>
      </div>
    </form>
  );
}
