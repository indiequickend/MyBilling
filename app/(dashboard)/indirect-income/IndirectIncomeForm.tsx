"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { FormError } from "@/components/auth/AuthCard";
import { PAYMENT_MODES, PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import { saveIndirectIncomeAction, type IndirectIncomeFormState } from "./actions";

const initialState: IndirectIncomeFormState = {};

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      {mode === "create" ? "Record income" : "Save changes"}
    </Button>
  );
}

export type IndirectIncomeFormDefaultValues = {
  categoryId: string;
  amountMinor: string;
  mode: string;
  bankAccountId: string;
  customerId: string;
  sourceName: string;
  description: string;
  incomeDate: string;
};

export function IndirectIncomeForm({
  mode = "create",
  indirectIncomeId,
  categories,
  bankAccounts,
  customers,
  defaultValues,
}: {
  mode?: "create" | "edit";
  indirectIncomeId?: string;
  categories: Array<{ id: string; name: string }>;
  bankAccounts: Array<{ id: string; name: string }>;
  customers: Array<{ id: string; label: string }>;
  defaultValues?: IndirectIncomeFormDefaultValues;
}) {
  const [state, formAction] = useActionState(saveIndirectIncomeAction, initialState);

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <FormError message={state.error} />
      {indirectIncomeId ? <input type="hidden" name="indirectIncomeId" value={indirectIncomeId} /> : null}

      <Card>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={state.fieldErrors?.categoryId ? true : undefined}>
                <FieldLabel htmlFor="categoryId">Category</FieldLabel>
                <SelectField
                  name="categoryId"
                  defaultValue={defaultValues?.categoryId}
                  placeholder="Select a category…"
                  required
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                />
                {state.fieldErrors?.categoryId ? (
                  <p className="text-sm text-destructive">{state.fieldErrors.categoryId}</p>
                ) : null}
              </Field>
              <FormField
                label="Amount"
                name="amountMinor"
                type="number"
                required
                defaultValue={defaultValues?.amountMinor}
                error={state.fieldErrors?.amountMinor}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="mode">Mode</FieldLabel>
                <SelectField
                  name="mode"
                  defaultValue={defaultValues?.mode ?? "cash"}
                  placeholder="Mode"
                  options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))}
                />
              </Field>
              <Field data-invalid={state.fieldErrors?.bankAccountId ? true : undefined}>
                <FieldLabel htmlFor="bankAccountId">Received into</FieldLabel>
                <SelectField
                  name="bankAccountId"
                  defaultValue={defaultValues?.bankAccountId}
                  placeholder="Account…"
                  required
                  options={bankAccounts.map((a) => ({ value: a.id, label: a.name }))}
                />
              </Field>
            </div>

            <FormField
              label="Date"
              name="incomeDate"
              type="date"
              required
              defaultValue={defaultValues?.incomeDate ?? new Date().toISOString().slice(0, 10)}
              error={state.fieldErrors?.incomeDate}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="customerId">Customer (optional)</FieldLabel>
                <SelectField
                  name="customerId"
                  defaultValue={defaultValues?.customerId}
                  placeholder="None"
                  options={[{ value: "", label: "None" }, ...customers.map((c) => ({ value: c.id, label: c.label }))]}
                />
              </Field>
              <FormField
                label="Source"
                name="sourceName"
                defaultValue={defaultValues?.sourceName}
                error={state.fieldErrors?.sourceName}
              />
            </div>

            <FormField
              label="Description"
              name="description"
              defaultValue={defaultValues?.description}
              error={state.fieldErrors?.description}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <SubmitButton mode={mode} />
    </form>
  );
}
