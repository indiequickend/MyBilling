"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { Field, FieldLabel } from "@/components/ui/field";
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
      <p className="text-sm text-muted-foreground">Add at least two accounts to transfer funds between them.</p>
    );
  }

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <FormError message={state.error} />
      <FormNotice message={state.success} />

      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="fromAccountId">From</FieldLabel>
          <SelectField
            name="fromAccountId"
            defaultValue={accounts[0].id}
            placeholder="From account"
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="toAccountId">To</FieldLabel>
          <SelectField
            name="toAccountId"
            defaultValue={accounts[1].id}
            placeholder="To account"
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Amount" name="amountMinor" type="number" required />
        <FormField
          label="Date"
          name="transferDate"
          type="date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
        />
      </div>

      <FormField label="Note (optional)" name="note" />

      <div className="max-w-lg">
        <SubmitButton pendingText="Transferring…">Transfer funds</SubmitButton>
      </div>
    </form>
  );
}
