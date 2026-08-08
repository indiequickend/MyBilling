"use client";

import { useActionState } from "react";
import { updatePaymentAction, type EditPaymentActionState } from "@/app/(dashboard)/payments/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PAYMENT_MODES, PAYMENT_MODE_LABELS } from "@/lib/constants/payments";

const initialState: EditPaymentActionState = {};

export function EditPaymentForm({
  paymentId,
  bankAccounts,
  defaultValues,
}: {
  paymentId: string;
  bankAccounts: Array<{ id: string; name: string }>;
  defaultValues: {
    amountMinor: string;
    mode: (typeof PAYMENT_MODES)[number];
    bankAccountId: string;
    paymentDate: string;
    referenceNote: string;
  };
}) {
  const [state, formAction] = useActionState(updatePaymentAction, initialState);

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <FormError message={state.error} />
      <input type="hidden" name="paymentId" value={paymentId} />

      <FieldGroup>
        <FormField
          label="Amount"
          name="amountMinor"
          type="number"
          required
          defaultValue={defaultValues.amountMinor}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="mode">Mode</FieldLabel>
            <SelectField
              name="mode"
              defaultValue={defaultValues.mode}
              placeholder="Mode"
              options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="bankAccountId">Account</FieldLabel>
            <SelectField
              name="bankAccountId"
              defaultValue={defaultValues.bankAccountId}
              placeholder="Account…"
              required
              options={bankAccounts.map((a) => ({ value: a.id, label: a.name }))}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Date"
            name="paymentDate"
            type="date"
            required
            defaultValue={defaultValues.paymentDate}
          />
          <FormField label="Reference (optional)" name="referenceNote" defaultValue={defaultValues.referenceNote} />
        </div>
      </FieldGroup>

      <div className="max-w-lg">
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}
