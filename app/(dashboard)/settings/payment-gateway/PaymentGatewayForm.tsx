"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { FormError } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { savePaymentGatewayAction, type PaymentGatewayFormState } from "./actions";

const initialState: PaymentGatewayFormState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      Save connection
    </Button>
  );
}

export function PaymentGatewayForm({
  bankAccounts,
  defaultValues,
}: {
  bankAccounts: Array<{ id: string; name: string }>;
  defaultValues?: {
    keyId: string;
    accountId: string;
    settlementBankAccountId: string;
  };
}) {
  const [state, formAction] = useActionState(savePaymentGatewayAction, initialState);

  return (
    <form action={formAction} className="max-w-lg space-y-6">
      <FormError message={state.error} />
      {state.success ? <p className="text-sm text-success-foreground">{state.success}</p> : null}
      <FieldGroup>
        <FormField
          label="Key ID"
          name="keyId"
          required
          defaultValue={defaultValues?.keyId}
          error={state.fieldErrors?.keyId}
        />
        <FormField
          label="Key secret"
          name="keySecret"
          type="password"
          required
          error={state.fieldErrors?.keySecret}
        />
        <FormField
          label="Webhook secret"
          name="webhookSecret"
          type="password"
          required
          error={state.fieldErrors?.webhookSecret}
        />
        <FormField
          label="Account ID (optional)"
          name="accountId"
          defaultValue={defaultValues?.accountId}
          error={state.fieldErrors?.accountId}
        />
        <Field data-invalid={state.fieldErrors?.settlementBankAccountId ? true : undefined}>
          <FieldLabel htmlFor="settlementBankAccountId">Settlement account</FieldLabel>
          <SelectField
            name="settlementBankAccountId"
            placeholder="Select an account"
            defaultValue={defaultValues?.settlementBankAccountId}
            options={bankAccounts.map((a) => ({ value: a.id, label: a.name }))}
          />
          <FieldError>{state.fieldErrors?.settlementBankAccountId}</FieldError>
        </Field>
      </FieldGroup>
      <SaveButton />
    </form>
  );
}
