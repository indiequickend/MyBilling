"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { PAYMENT_MODES, PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import { Button } from "@/components/ui/button";

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

const fieldClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

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
      <p className="text-sm text-accent-mint-foreground/80">
        Add a bank/cash account in Settings → Banks to record a payment now.
      </p>
    );
  }

  return (
    <div className="space-y-3">
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
              className={`col-span-6 sm:col-span-2 ${fieldClass}`}
            />
            <select
              name={`payment__${i}__mode`}
              value={row.mode}
              onChange={(e) => update(i, { mode: e.target.value })}
              className={`col-span-6 sm:col-span-2 ${fieldClass}`}
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
              className={`col-span-6 sm:col-span-3 ${fieldClass}`}
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
              className={`col-span-6 sm:col-span-2 ${fieldClass}`}
            />
            <input
              name={`payment__${i}__referenceNote`}
              value={row.referenceNote}
              onChange={(e) => update(i, { referenceNote: e.target.value })}
              placeholder="Reference (optional)"
              className={`col-span-5 sm:col-span-2 ${fieldClass}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
              aria-label="Remove payment"
              className="col-span-1 text-accent-mint-foreground hover:text-destructive"
            >
              <X />
            </Button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="bg-background"
        onClick={() =>
          setRows((prev) => [
            ...prev,
            { ...BLANK_PAYMENT, bankAccountId: defaultBankAccountId ?? bankAccounts[0]?.id ?? "" },
          ])
        }
      >
        + Add payment
      </Button>
    </div>
  );
}
