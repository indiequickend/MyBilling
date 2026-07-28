"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { PAYMENT_MODES, PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import { recordInvoicePaymentAction, type InvoiceActionState } from "../actions";

const initialState: InvoiceActionState = {};

export function RecordPaymentForm({
  invoiceId,
  bankAccounts,
}: {
  invoiceId: string;
  bankAccounts: Array<{ id: string; name: string }>;
}) {
  const [state, formAction] = useActionState(recordInvoicePaymentAction, initialState);

  if (bankAccounts.length === 0) {
    return (
      <p className="text-sm text-slate-500">Add a bank/cash account in Settings → Banks to record a payment.</p>
    );
  }

  return (
    <form action={formAction} className="max-w-lg space-y-3 rounded-md border border-slate-200 p-4">
      <FormError message={state.error} />
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Amount</span>
          <input
            type="number"
            name="amountMinor"
            min="0"
            step="0.01"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Mode</span>
          <select name="mode" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Account</span>
          <select
            name="bankAccountId"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Date</span>
          <input
            type="date"
            name="paymentDate"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Reference (optional)</span>
        <input
          name="referenceNote"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="max-w-xs">
        <SubmitButton pendingText="Recording…">Record payment</SubmitButton>
      </div>
    </form>
  );
}
