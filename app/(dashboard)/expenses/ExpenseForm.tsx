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
import { saveExpenseAction, type ExpenseFormState } from "./actions";

const initialState: ExpenseFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      Record expense
    </Button>
  );
}

export function ExpenseForm({
  categories,
  bankAccounts,
  vendors,
}: {
  categories: Array<{ id: string; name: string }>;
  bankAccounts: Array<{ id: string; name: string }>;
  vendors: Array<{ id: string; label: string }>;
}) {
  const [state, formAction] = useActionState(saveExpenseAction, initialState);

  return (
    <form action={formAction} encType="multipart/form-data" className="max-w-2xl space-y-6">
      <FormError message={state.error} />

      <Card>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={state.fieldErrors?.categoryId ? true : undefined}>
                <FieldLabel htmlFor="categoryId">Category</FieldLabel>
                <SelectField
                  name="categoryId"
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
                error={state.fieldErrors?.amountMinor}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="mode">Mode</FieldLabel>
                <SelectField
                  name="mode"
                  defaultValue="cash"
                  placeholder="Mode"
                  options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))}
                />
              </Field>
              <Field data-invalid={state.fieldErrors?.bankAccountId ? true : undefined}>
                <FieldLabel htmlFor="bankAccountId">Paid from</FieldLabel>
                <SelectField
                  name="bankAccountId"
                  placeholder="Account…"
                  required
                  options={bankAccounts.map((a) => ({ value: a.id, label: a.name }))}
                />
              </Field>
            </div>

            <FormField
              label="Expense date"
              name="expenseDate"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              error={state.fieldErrors?.expenseDate}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="vendorId">Vendor (optional)</FieldLabel>
                <SelectField
                  name="vendorId"
                  placeholder="None"
                  options={[{ value: "", label: "None" }, ...vendors.map((v) => ({ value: v.id, label: v.label }))]}
                />
              </Field>
              <FormField label="Supplier name" name="supplierName" error={state.fieldErrors?.supplierName} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Supplier GSTIN"
                name="supplierGstin"
                error={state.fieldErrors?.supplierGstin}
              />
              <FormField label="Description" name="description" error={state.fieldErrors?.description} />
            </div>

            <Field>
              <FieldLabel htmlFor="receipt">Receipt (optional, PDF or image)</FieldLabel>
              <input
                id="receipt"
                name="receipt"
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="text-sm"
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <SubmitButton />
    </form>
  );
}
