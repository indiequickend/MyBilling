"use client";

import { useState } from "react";
import { PAYMENT_MODES, PAYMENT_MODE_LABELS } from "@/lib/constants/payments";

export type PaymentSplitRow = {
  amountMinor: string;
  mode: string;
  bankAccountId: string;
  paymentDate: string;
  referenceNote: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const BLANK_PAYMENT: PaymentSplitRow = {
  amountMinor: "",
  mode: "cash",
  bankAccountId: "",
  paymentDate: today(),
  referenceNote: "",
};

const inputClass = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

/** Inline split-payment recording at invoice save time — only submitted when the invoice is
 * finalized (see InvoiceForm's "Save"/"Save & Print" intents). */
export function PaymentSplitsEditor({
  bankAccounts,
  defaultBankAccountId,
}: {
  bankAccounts: Array<{ id: string; name: string }>;
  defaultBankAccountId?: string;
}) {
  const [rows, setRows] = useState<PaymentSplitRow[]>([]);

  function update(index: number, patch: Partial<PaymentSplitRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  if (bankAccounts.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Add a bank/cash account in Settings → Banks to record a payment now.
      </p>
    );
  }

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium text-slate-700">
        Record payment now (optional)
      </legend>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-2">
            <input
              name={`payment__${i}__amountMinor`}
              type="number"
              min="0"
              step="0.01"
              value={row.amountMinor}
              onChange={(e) => update(i, { amountMinor: e.target.value })}
              placeholder="Amount"
              className={`col-span-2 ${inputClass}`}
            />
            <select
              name={`payment__${i}__mode`}
              value={row.mode}
              onChange={(e) => update(i, { mode: e.target.value })}
              className={`col-span-2 ${inputClass}`}
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_MODE_LABELS[m]}
                </option>
              ))}
            </select>
            <select
              name={`payment__${i}__bankAccountId`}
              value={row.bankAccountId}
              onChange={(e) => update(i, { bankAccountId: e.target.value })}
              className={`col-span-3 ${inputClass}`}
            >
              <option value="">Account…</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <input
              name={`payment__${i}__paymentDate`}
              type="date"
              value={row.paymentDate}
              onChange={(e) => update(i, { paymentDate: e.target.value })}
              className={`col-span-2 ${inputClass}`}
            />
            <input
              name={`payment__${i}__referenceNote`}
              value={row.referenceNote}
              onChange={(e) => update(i, { referenceNote: e.target.value })}
              placeholder="Reference (optional)"
              className={`col-span-2 ${inputClass}`}
            />
            <button
              type="button"
              onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
              className="col-span-1 text-xs text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          setRows((prev) => [
            ...prev,
            { ...BLANK_PAYMENT, bankAccountId: defaultBankAccountId ?? bankAccounts[0]?.id ?? "" },
          ])
        }
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
      >
        + Add payment
      </button>
    </fieldset>
  );
}
