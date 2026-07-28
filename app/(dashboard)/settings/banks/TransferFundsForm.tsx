"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { transferFundsAction, type TransferFundsFormState } from "./actions";

const initialState: TransferFundsFormState = {};

export function TransferFundsForm({
  accounts,
}: {
  accounts: Array<{ id: string; name: string }>;
}) {
  const [state, formAction] = useActionState(transferFundsAction, initialState);

  if (accounts.length < 2) {
    return (
      <p className="text-sm text-slate-500">Add at least two accounts to transfer funds between them.</p>
    );
  }

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <FormError message={state.error} />
      <FormNotice message={state.success} />

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">From</span>
          <select
            name="fromAccountId"
            defaultValue={accounts[0].id}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">To</span>
          <select
            name="toAccountId"
            defaultValue={accounts[1].id}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Amount</span>
          <input
            type="number"
            name="amountMinor"
            step="0.01"
            min="0"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Date</span>
          <input
            type="date"
            name="transferDate"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Note (optional)</span>
        <input
          type="text"
          name="note"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="max-w-xs">
        <SubmitButton pendingText="Transferring…">Transfer funds</SubmitButton>
      </div>
    </form>
  );
}
