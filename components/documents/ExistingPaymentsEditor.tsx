"use client";

import { useState } from "react";
import { Undo2, X } from "lucide-react";
import { PAYMENT_MODES, PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import type { BankAccountOption } from "@/lib/utils/bankAccounts";
import { Button } from "@/components/ui/button";

export type ExistingPaymentRow = {
  id: string;
  docNumber?: string;
  /** Rupees string, as typed into the amount field. */
  amount: string;
  mode: string;
  bankAccountId: string;
  /** yyyy-mm-dd */
  paymentDate: string;
  referenceNote: string;
  /** false for gateway-collected payments — shown read-only, never submitted. */
  editable: boolean;
};

const fieldClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

/**
 * Payments already recorded against a document, shown inside its edit form. Each editable row is
 * submitted as `existingPayment__<i>__<field>`; the server diffs it against the stored payment and
 * only edits/voids what actually changed (see saveInvoiceAction). "Remove" voids the payment on
 * save — money movement is never hard-deleted.
 */
export function ExistingPaymentsEditor({
  payments,
  bankAccounts,
  canEdit,
  canRemove,
}: {
  payments: ExistingPaymentRow[];
  bankAccounts: BankAccountOption[];
  canEdit: boolean;
  canRemove: boolean;
}) {
  const [rows, setRows] = useState(payments.map((p) => ({ ...p, removed: false })));

  function update(index: number, patch: Partial<(typeof rows)[number]>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  if (rows.length === 0) return <p className="text-sm text-accent-mint-foreground/80">No payments recorded yet.</p>;

  return (
    <div className="space-y-2">
      {rows.map((row, i) => {
        const fieldsDisabled = !row.editable || !canEdit || row.removed;
        // Keep an account that's since been archived selectable so an untouched row round-trips.
        const accountOptions = bankAccounts.some((a) => a.id === row.bankAccountId)
          ? bankAccounts
          : [...bankAccounts, { id: row.bankAccountId, name: "(archived account)", isDefault: false }];
        return (
          <div key={row.id} className={`grid grid-cols-12 items-center gap-2 ${row.removed ? "opacity-50" : ""}`}>
            {row.editable ? (
              <>
                <input type="hidden" name={`existingPayment__${i}__id`} value={row.id} />
                {row.removed ? <input type="hidden" name={`existingPayment__${i}__remove`} value="1" /> : null}
              </>
            ) : null}
            <span className="col-span-12 text-xs text-accent-mint-foreground/80 sm:col-span-1 sm:text-sm">
              {row.docNumber ?? "—"}
            </span>
            <input
              name={`existingPayment__${i}__amountMinor`}
              type="number"
              min="0"
              step="0.01"
              value={row.amount}
              onChange={(e) => update(i, { amount: e.target.value })}
              readOnly={fieldsDisabled}
              disabled={!row.editable}
              aria-label="Amount"
              className={`col-span-6 sm:col-span-2 ${fieldClass}`}
            />
            <select
              name={`existingPayment__${i}__mode`}
              value={row.mode}
              onChange={(e) => update(i, { mode: e.target.value })}
              disabled={fieldsDisabled}
              aria-label="Mode"
              className={`col-span-6 sm:col-span-2 ${fieldClass}`}
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_MODE_LABELS[m]}
                </option>
              ))}
            </select>
            {fieldsDisabled && row.editable ? (
              // Disabled selects aren't submitted — mirror their values so the row still round-trips.
              <>
                <input type="hidden" name={`existingPayment__${i}__mode`} value={row.mode} />
                <input type="hidden" name={`existingPayment__${i}__bankAccountId`} value={row.bankAccountId} />
              </>
            ) : null}
            <select
              name={`existingPayment__${i}__bankAccountId`}
              value={row.bankAccountId}
              onChange={(e) => update(i, { bankAccountId: e.target.value })}
              disabled={fieldsDisabled}
              aria-label="Account"
              className={`col-span-6 sm:col-span-2 ${fieldClass}`}
            >
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <input
              name={`existingPayment__${i}__paymentDate`}
              type="date"
              value={row.paymentDate}
              onChange={(e) => update(i, { paymentDate: e.target.value })}
              readOnly={fieldsDisabled}
              disabled={!row.editable}
              aria-label="Payment date"
              className={`col-span-6 sm:col-span-2 ${fieldClass}`}
            />
            <input
              name={`existingPayment__${i}__referenceNote`}
              value={row.referenceNote}
              onChange={(e) => update(i, { referenceNote: e.target.value })}
              readOnly={fieldsDisabled}
              disabled={!row.editable}
              placeholder="Reference (optional)"
              aria-label="Reference"
              className={`col-span-10 sm:col-span-2 ${fieldClass}`}
            />
            <div className="col-span-2 flex justify-end sm:col-span-1">
              {!row.editable ? (
                <span className="text-xs text-accent-mint-foreground/80">Online</span>
              ) : canRemove ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => update(i, { removed: !row.removed })}
                  aria-label={row.removed ? "Keep payment" : "Remove payment"}
                  title={row.removed ? "Keep payment" : "Remove (void) payment on save"}
                  className="text-accent-mint-foreground hover:text-destructive"
                >
                  {row.removed ? <Undo2 /> : <X />}
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
      {rows.some((r) => r.removed) ? (
        <p className="text-xs text-accent-mint-foreground/80">Removed payments are voided when you save.</p>
      ) : null}
    </div>
  );
}
