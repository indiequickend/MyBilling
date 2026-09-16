"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { FormError } from "@/components/auth/AuthCard";
import { PAYMENT_MODES, PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import { saveExpenseAction, type ExpenseFormState } from "./actions";

const initialState: ExpenseFormState = {};

function SubmitButton({ mode }: { mode: "create" | "edit" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      {mode === "create" ? "Record expense" : "Save changes"}
    </Button>
  );
}

export type ExpenseFormDefaultValues = {
  categoryId: string;
  amountMinor: string;
  mode: string;
  bankAccountId: string;
  vendorId: string;
  supplierName: string;
  supplierGstin: string;
  projectId: string;
  description: string;
  expenseDate: string;
  tdsApplicable: boolean;
  tdsSectionCode: string;
  tdsRatePercent: string;
  tdsAmountMinor: string;
  tcsApplicable: boolean;
  tcsSectionCode: string;
  tcsRatePercent: string;
  tcsAmountMinor: string;
};

export function ExpenseForm({
  mode = "create",
  expenseId,
  categories,
  bankAccounts,
  vendors,
  projects,
  defaultValues,
}: {
  mode?: "create" | "edit";
  expenseId?: string;
  categories: Array<{ id: string; name: string }>;
  bankAccounts: Array<{ id: string; name: string }>;
  vendors: Array<{ id: string; label: string }>;
  /** Only passed when the current user can view Projects — absent (not just empty) means the
   * picker shouldn't render at all for them. */
  projects?: Array<{ id: string; name: string }>;
  defaultValues?: ExpenseFormDefaultValues;
}) {
  const [state, formAction] = useActionState(saveExpenseAction, initialState);

  return (
    <form action={formAction} encType="multipart/form-data" className="max-w-2xl space-y-6">
      <FormError message={state.error} />
      {expenseId ? <input type="hidden" name="expenseId" value={expenseId} /> : null}

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
                <FieldLabel htmlFor="bankAccountId">Paid from</FieldLabel>
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
              label="Expense date"
              name="expenseDate"
              type="date"
              required
              defaultValue={defaultValues?.expenseDate ?? new Date().toISOString().slice(0, 10)}
              error={state.fieldErrors?.expenseDate}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="vendorId">Vendor (optional)</FieldLabel>
                <SelectField
                  name="vendorId"
                  defaultValue={defaultValues?.vendorId}
                  placeholder="None"
                  options={[{ value: "", label: "None" }, ...vendors.map((v) => ({ value: v.id, label: v.label }))]}
                />
              </Field>
              <FormField
                label="Supplier name"
                name="supplierName"
                defaultValue={defaultValues?.supplierName}
                error={state.fieldErrors?.supplierName}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Supplier GSTIN"
                name="supplierGstin"
                defaultValue={defaultValues?.supplierGstin}
                error={state.fieldErrors?.supplierGstin}
              />
              <FormField
                label="Description"
                name="description"
                defaultValue={defaultValues?.description}
                error={state.fieldErrors?.description}
              />
            </div>

            {projects ? (
              <Field>
                <FieldLabel htmlFor="projectId">Project (optional)</FieldLabel>
                <SelectField
                  name="projectId"
                  defaultValue={defaultValues?.projectId}
                  placeholder="None"
                  options={[{ value: "", label: "None" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
                />
              </Field>
            ) : null}

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

      <Card>
        <CardHeader>
          <CardTitle>Tax Deduction / Collection (TDS / TCS)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Field orientation="horizontal">
                <Checkbox id="tdsApplicable" name="tdsApplicable" defaultChecked={defaultValues?.tdsApplicable} />
                <FieldLabel htmlFor="tdsApplicable" className="font-normal">
                  TDS deducted from this supplier
                </FieldLabel>
              </Field>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <FormField
                  label="Section code"
                  name="tdsSectionCode"
                  placeholder="e.g. 194C"
                  defaultValue={defaultValues?.tdsSectionCode}
                />
                <FormField label="Rate %" name="tdsRatePercent" type="number" defaultValue={defaultValues?.tdsRatePercent} />
                <FormField
                  label="TDS amount"
                  name="tdsAmountMinor"
                  type="number"
                  defaultValue={defaultValues?.tdsAmountMinor}
                  error={state.fieldErrors?.tdsAmountMinor}
                />
              </div>
            </div>
            <div>
              <Field orientation="horizontal">
                <Checkbox id="tcsApplicable" name="tcsApplicable" defaultChecked={defaultValues?.tcsApplicable} />
                <FieldLabel htmlFor="tcsApplicable" className="font-normal">
                  TCS collected by this supplier
                </FieldLabel>
              </Field>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <FormField
                  label="Section code"
                  name="tcsSectionCode"
                  placeholder="e.g. 206C(1H)"
                  defaultValue={defaultValues?.tcsSectionCode}
                />
                <FormField label="Rate %" name="tcsRatePercent" type="number" defaultValue={defaultValues?.tcsRatePercent} />
                <FormField
                  label="TCS amount"
                  name="tcsAmountMinor"
                  type="number"
                  defaultValue={defaultValues?.tcsAmountMinor}
                  error={state.fieldErrors?.tcsAmountMinor}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <SubmitButton mode={mode} />
    </form>
  );
}
