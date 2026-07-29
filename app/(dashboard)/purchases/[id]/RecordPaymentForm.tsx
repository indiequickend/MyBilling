"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PAYMENT_MODES, PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import { recordPurchasePaymentAction, type PurchaseActionState } from "../actions";

const initialState: PurchaseActionState = {};

export function RecordPaymentForm({
  purchaseId,
  bankAccounts,
}: {
  purchaseId: string;
  bankAccounts: Array<{ id: string; name: string }>;
}) {
  const [state, formAction] = useActionState(recordPurchasePaymentAction, initialState);

  if (bankAccounts.length === 0) {
    return (
      <p className="text-sm text-accent-mint-foreground/80">
        Add a bank/cash account in Settings → Banks to record a payment.
      </p>
    );
  }

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <FormError message={state.error} />
      <input type="hidden" name="purchaseId" value={purchaseId} />

      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Amount" name="amountMinor" type="number" required />
          <Field>
            <FieldLabel htmlFor="mode">Mode</FieldLabel>
            <SelectField
              name="mode"
              defaultValue="cash"
              placeholder="Mode"
              options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="bankAccountId">Account</FieldLabel>
            <SelectField
              name="bankAccountId"
              placeholder="Account…"
              required
              options={bankAccounts.map((a) => ({ value: a.id, label: a.name }))}
            />
          </Field>
          <FormField
            label="Date"
            name="paymentDate"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </div>

        <FormField label="Reference (optional)" name="referenceNote" />
      </FieldGroup>

      <div className="max-w-xs">
        <SubmitButton pendingText="Recording…">Record payment</SubmitButton>
      </div>
    </form>
  );
}
