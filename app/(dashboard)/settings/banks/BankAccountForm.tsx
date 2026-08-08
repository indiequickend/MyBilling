"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { Field, FieldLabel } from "@/components/ui/field";
import { BANK_ACCOUNT_TYPES, BANK_ACCOUNT_TYPE_LABELS } from "@/lib/constants/payments";
import { createBankAccountAction, updateBankAccountAction, type BankAccountFormState } from "./actions";

const initialState: BankAccountFormState = {};

export function BankAccountForm({
  mode,
  bankAccountId,
  defaultValues,
}: {
  mode: "create" | "edit";
  bankAccountId?: string;
  defaultValues?: {
    type: string;
    name: string;
    accountHolderName: string;
    accountNumber: string;
    ifsc: string;
    upiId: string;
    openingBalance: string;
  };
}) {
  const action = mode === "create" ? createBankAccountAction : updateBankAccountAction;
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="max-w-lg space-y-6">
      <FormError message={state.error} />
      {bankAccountId ? <input type="hidden" name="bankAccountId" value={bankAccountId} /> : null}

      <Field>
        <FieldLabel htmlFor="type">Type</FieldLabel>
        <SelectField
          name="type"
          defaultValue={defaultValues?.type ?? "bank"}
          placeholder="Type"
          options={BANK_ACCOUNT_TYPES.map((t) => ({ value: t, label: BANK_ACCOUNT_TYPE_LABELS[t] }))}
        />
      </Field>

      <FormField
        label="Name"
        name="name"
        required
        defaultValue={defaultValues?.name}
        error={state.fieldErrors?.name}
      />
      <FormField
        label="Account holder name"
        name="accountHolderName"
        defaultValue={defaultValues?.accountHolderName}
        error={state.fieldErrors?.accountHolderName}
      />
      <FormField
        label="Account number"
        name="accountNumber"
        defaultValue={defaultValues?.accountNumber}
        error={state.fieldErrors?.accountNumber}
      />
      <FormField
        label="IFSC"
        name="ifsc"
        defaultValue={defaultValues?.ifsc}
        error={state.fieldErrors?.ifsc}
      />
      <FormField
        label="UPI ID"
        name="upiId"
        placeholder="business@upi"
        defaultValue={defaultValues?.upiId}
        error={state.fieldErrors?.upiId}
      />
      <FormField
        label="Opening balance"
        name="openingBalanceMinor"
        type="number"
        defaultValue={defaultValues?.openingBalance}
        error={state.fieldErrors?.openingBalanceMinor}
      />

      <div className="max-w-lg">
        <SubmitButton pendingText="Saving…">
          {mode === "create" ? "Add account" : "Save changes"}
        </SubmitButton>
      </div>
    </form>
  );
}
