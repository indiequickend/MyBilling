"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { Field, FieldLabel } from "@/components/ui/field";
import { transferFundsAction, updateBankTransferAction, type TransferFundsFormState } from "./actions";

const initialState: TransferFundsFormState = {};

export function TransferFundsForm({
  accounts,
  transfer,
}: {
  accounts: Array<{ id: string; name: string }>;
  /** Present when editing an existing transfer. */
  transfer?: {
    id: string;
    fromAccountId: string;
    toAccountId: string;
    amount: string;
    transferDate: string;
    note: string;
  };
}) {
  const [state, formAction] = useActionState(transfer ? updateBankTransferAction : transferFundsAction, initialState);

  if (accounts.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">Add at least two accounts to transfer funds between them.</p>
    );
  }

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      {transfer ? <input type="hidden" name="transferId" value={transfer.id} /> : null}
      <FormError message={state.error} />
      <FormNotice message={state.success} />

      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldLabel htmlFor="fromAccountId">From</FieldLabel>
          <SelectField
            name="fromAccountId"
            defaultValue={transfer?.fromAccountId ?? accounts[0].id}
            placeholder="From account"
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="toAccountId">To</FieldLabel>
          <SelectField
            name="toAccountId"
            defaultValue={transfer?.toAccountId ?? accounts[1].id}
            placeholder="To account"
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Amount" name="amountMinor" type="number" required defaultValue={transfer?.amount} />
        <FormField
          label="Date"
          name="transferDate"
          type="date"
          required
          defaultValue={transfer?.transferDate ?? new Date().toISOString().slice(0, 10)}
        />
      </div>

      <FormField label="Note (optional)" name="note" defaultValue={transfer?.note} />

      <div className="max-w-lg">
        <SubmitButton pendingText={transfer ? "Saving…" : "Transferring…"}>
          {transfer ? "Save changes" : "Transfer funds"}
        </SubmitButton>
      </div>
    </form>
  );
}
