"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { minorToRupeesString } from "@/lib/utils/money";

type ApplyAdvanceActionState = { error?: string };

export type AvailableAdvanceOption = {
  paymentId: string;
  docNumber?: string;
  amountMinor: number;
  paymentDate: Date | string;
};

/**
 * Settles some or all of an existing advance/on-account payment against this Invoice/Purchase —
 * the manual-settle counterpart to recording a brand-new payment. Shown only when the party has at
 * least one unapplied advance in the matching direction (see listAvailableAdvances).
 */
export function ApplyAdvanceForm({
  targetIdFieldName,
  targetId,
  advances,
  action,
}: {
  targetIdFieldName: string;
  targetId: string;
  advances: AvailableAdvanceOption[];
  action: (state: ApplyAdvanceActionState, formData: FormData) => Promise<ApplyAdvanceActionState>;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <FormError message={state.error} />
      <input type="hidden" name={targetIdFieldName} value={targetId} />

      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="paymentId">Advance</FieldLabel>
            <SelectField
              name="paymentId"
              placeholder="Select advance…"
              required
              options={advances.map((a) => ({
                value: a.paymentId,
                label: `${a.docNumber ?? "Advance"} — ₹${minorToRupeesString(a.amountMinor)} (${new Date(
                  a.paymentDate,
                ).toLocaleDateString()})`,
              }))}
            />
          </Field>
          <FormField label="Amount to apply" name="amountMinor" type="number" required />
        </div>
      </FieldGroup>

      <div className="max-w-lg">
        <SubmitButton pendingText="Applying…">Apply advance</SubmitButton>
      </div>
    </form>
  );
}
