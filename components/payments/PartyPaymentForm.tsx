"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PAYMENT_MODES, PAYMENT_MODE_LABELS } from "@/lib/constants/payments";

type PartyPaymentActionState = { error?: string };

/**
 * The Ledger's "You Got"/"You Gave" quick payment entry (project_spec.md → Customers & Vendors) —
 * records money in/out against a party with no invoice/purchase attached (an advance/on-account
 * payment). Shared by the Customer and Vendor Ledger pages; `action` differs per party type.
 */
export function PartyPaymentForm({
  partyType,
  partyIdFieldName,
  partyId,
  bankAccounts,
  action,
}: {
  partyType: "customer" | "vendor";
  partyIdFieldName: string;
  partyId: string;
  bankAccounts: Array<{ id: string; name: string }>;
  action: (state: PartyPaymentActionState, formData: FormData) => Promise<PartyPaymentActionState>;
}) {
  const [state, formAction] = useActionState(action, {});

  if (bankAccounts.length === 0) {
    return (
      <p className="text-sm text-accent-mint-foreground/80">
        Add a bank/cash account in Settings → Banks to record a payment.
      </p>
    );
  }

  const directionOptions =
    partyType === "customer"
      ? [
          { value: "in", label: "You Got (received)" },
          { value: "out", label: "You Gave (refund)" },
        ]
      : [
          { value: "out", label: "You Gave (paid)" },
          { value: "in", label: "You Got (refund)" },
        ];

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <FormError message={state.error} />
      <input type="hidden" name={partyIdFieldName} value={partyId} />

      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="direction">Type</FieldLabel>
            <SelectField name="direction" defaultValue={directionOptions[0].value} placeholder="Type" options={directionOptions} />
          </Field>
          <FormField label="Amount" name="amountMinor" type="number" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="mode">Mode</FieldLabel>
            <SelectField
              name="mode"
              defaultValue="cash"
              placeholder="Mode"
              options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="bankAccountId">Account</FieldLabel>
            <SelectField
              name="bankAccountId"
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
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
          <FormField label="Reference (optional)" name="referenceNote" />
        </div>
      </FieldGroup>

      <div className="max-w-xs">
        <SubmitButton pendingText="Recording…">Record payment</SubmitButton>
      </div>
    </form>
  );
}
