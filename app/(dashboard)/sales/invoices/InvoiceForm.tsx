"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { FormError } from "@/components/auth/AuthCard";
import { DISCOUNT_TARGETS, DISCOUNT_TARGET_LABELS } from "@/lib/constants/invoices";
import type { CustomFieldType } from "@/lib/validation/shared";
import { LineItemsEditor, type LineItemRow } from "@/components/documents/LineItemsEditor";
import { PaymentSplitsEditor } from "@/components/documents/PaymentSplitsEditor";
import { saveInvoiceAction, type InvoiceFormState } from "./actions";

const initialState: InvoiceFormState = {};

function SubmitIntentButton({
  intent,
  variant = "outline",
  children,
}: {
  intent: "draft" | "finalize" | "finalize_print";
  variant?: "default" | "outline";
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" name="intent" value={intent} disabled={pending} variant={variant}>
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      {children}
    </Button>
  );
}

export type InvoiceFormDefaultValues = {
  customerId: string;
  invoiceDate: string;
  dueDate: string;
  referenceNumber: string;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  roundOff: boolean;
  notes: string;
  terms: string;
  noteTemplateId: string;
  termTemplateId: string;
  signatureId: string;
  bankAccountId: string;
  discountType: "amount" | "percentage";
  discountValue: string;
  discountTarget: (typeof DISCOUNT_TARGETS)[number];
  customFieldValues: Record<string, unknown>;
  lineItems: LineItemRow[];
  sourceQuotationId?: string;
  sourceSalesOrderId?: string;
  tcsApplicable?: boolean;
  tcsSectionCode?: string;
  tcsRatePercent?: string;
  tcsAmountMinor?: string;
};

export function InvoiceForm({
  mode,
  invoiceId,
  editableStatus,
  customers,
  signatures,
  bankAccounts,
  noteTemplates,
  termTemplates,
  warehouses,
  defaultWarehouseId,
  customFieldDefs,
  businessState,
  defaultValues,
}: {
  mode: "create" | "edit";
  invoiceId?: string;
  editableStatus?: "draft" | "pending" | "partially_paid";
  customers: Array<{ id: string; label: string }>;
  signatures: Array<{ id: string; name: string }>;
  bankAccounts: Array<{ id: string; name: string }>;
  noteTemplates: Array<{ id: string; label: string }>;
  termTemplates: Array<{ id: string; label: string }>;
  warehouses: Array<{ id: string; name: string }>;
  defaultWarehouseId?: string;
  customFieldDefs: Array<{
    key: string;
    label: string;
    type: CustomFieldType;
    options: string[];
    required: boolean;
  }>;
  businessState: string;
  defaultValues?: InvoiceFormDefaultValues;
}) {
  const [state, formAction] = useActionState(saveInvoiceAction, initialState);

  const canDraft = mode === "create" || editableStatus === "draft";
  const showPayments = mode === "create" || editableStatus === "draft";
  const placeOfSupplyState = defaultValues?.placeOfSupplyState ?? businessState;

  return (
    <form action={formAction} className="space-y-6">
      <FormError message={state.error} />
      {invoiceId ? <input type="hidden" name="invoiceId" value={invoiceId} /> : null}
      {defaultValues?.sourceQuotationId ? (
        <input type="hidden" name="sourceQuotationId" value={defaultValues.sourceQuotationId} />
      ) : null}
      {defaultValues?.sourceSalesOrderId ? (
        <input type="hidden" name="sourceSalesOrderId" value={defaultValues.sourceSalesOrderId} />
      ) : null}

      <Card>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={state.fieldErrors?.customerId ? true : undefined}>
                <FieldLabel htmlFor="customerId">Customer</FieldLabel>
                <SelectField
                  name="customerId"
                  defaultValue={defaultValues?.customerId}
                  placeholder="Select a customer…"
                  options={customers.map((c) => ({ value: c.id, label: c.label }))}
                  required
                />
                {state.fieldErrors?.customerId ? (
                  <p className="text-sm text-destructive">{state.fieldErrors.customerId}</p>
                ) : null}
              </Field>
              <FormField
                label="Place of supply (state)"
                name="placeOfSupplyState"
                required
                defaultValue={placeOfSupplyState}
                error={state.fieldErrors?.placeOfSupplyState}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                label="Invoice date"
                name="invoiceDate"
                type="date"
                required
                defaultValue={defaultValues?.invoiceDate ?? new Date().toISOString().slice(0, 10)}
                error={state.fieldErrors?.invoiceDate}
              />
              <FormField
                label="Due date"
                name="dueDate"
                type="date"
                defaultValue={defaultValues?.dueDate}
                error={state.fieldErrors?.dueDate}
              />
              <FormField
                label="Reference number"
                name="referenceNumber"
                defaultValue={defaultValues?.referenceNumber}
                error={state.fieldErrors?.referenceNumber}
              />
            </div>
            <Field orientation="horizontal">
              <Checkbox
                id="reverseCharge"
                name="reverseCharge"
                defaultChecked={defaultValues?.reverseCharge}
              />
              <FieldLabel htmlFor="reverseCharge" className="font-normal">
                Reverse charge applicable
              </FieldLabel>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {customFieldDefs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Custom fields</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {customFieldDefs.map((def) => {
                const value = defaultValues?.customFieldValues?.[def.key];
                if (def.type === "select") {
                  return (
                    <Field key={def.key}>
                      <FieldLabel htmlFor={def.key}>
                        {def.label}
                        {def.required ? " *" : ""}
                      </FieldLabel>
                      <SelectField
                        name={def.key}
                        defaultValue={typeof value === "string" ? value : ""}
                        placeholder="Select…"
                        required={def.required}
                        options={def.options.map((o) => ({ value: o, label: o }))}
                      />
                    </Field>
                  );
                }
                return (
                  <FormField
                    key={def.key}
                    label={def.required ? `${def.label} *` : def.label}
                    name={def.key}
                    type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
                    required={def.required}
                    defaultValue={
                      typeof value === "string" || typeof value === "number" ? String(value) : ""
                    }
                    error={state.fieldErrors?.[def.key]}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent>
          <LineItemsEditor
            defaultRows={defaultValues?.lineItems ?? []}
            businessState={businessState}
            placeOfSupplyState={placeOfSupplyState}
            warehouses={warehouses}
            defaultWarehouseId={defaultWarehouseId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Discount &amp; round-off</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="discountType">Type</FieldLabel>
              <SelectField
                name="discountType"
                defaultValue={defaultValues?.discountType ?? "percentage"}
                placeholder="Type"
                options={[
                  { value: "percentage", label: "Percentage" },
                  { value: "amount", label: "Amount" },
                ]}
              />
            </Field>
            <FormField
              label="Value"
              name="discountValue"
              type="number"
              defaultValue={defaultValues?.discountValue ?? "0"}
            />
            <Field>
              <FieldLabel htmlFor="discountTarget">Applies to</FieldLabel>
              <SelectField
                name="discountTarget"
                defaultValue={defaultValues?.discountTarget ?? "total"}
                placeholder="Applies to"
                options={DISCOUNT_TARGETS.map((t) => ({ value: t, label: DISCOUNT_TARGET_LABELS[t] }))}
              />
            </Field>
            <Field orientation="horizontal" className="pt-6">
              <Checkbox id="roundOff" name="roundOff" defaultChecked={defaultValues?.roundOff ?? true} />
              <FieldLabel htmlFor="roundOff" className="font-normal">
                Round off total
              </FieldLabel>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax Collection (TCS)</CardTitle>
        </CardHeader>
        <CardContent>
          <Field orientation="horizontal">
            <Checkbox
              id="tcsApplicable"
              name="tcsApplicable"
              defaultChecked={defaultValues?.tcsApplicable}
            />
            <FieldLabel htmlFor="tcsApplicable" className="font-normal">
              TCS collected from this customer
            </FieldLabel>
          </Field>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <FormField
              label="Section code"
              name="tcsSectionCode"
              placeholder="e.g. 206C(1H)"
              defaultValue={defaultValues?.tcsSectionCode}
            />
            <FormField
              label="Rate %"
              name="tcsRatePercent"
              type="number"
              defaultValue={defaultValues?.tcsRatePercent}
            />
            <FormField
              label="TCS amount"
              name="tcsAmountMinor"
              type="number"
              defaultValue={defaultValues?.tcsAmountMinor}
              error={state.fieldErrors?.tcsAmountMinor}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="noteTemplateId">Notes template</FieldLabel>
              <SelectField
                name="noteTemplateId"
                defaultValue={defaultValues?.noteTemplateId}
                placeholder="None"
                options={[{ value: "", label: "None" }, ...noteTemplates.map((t) => ({ value: t.id, label: t.label }))]}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="termTemplateId">Terms template</FieldLabel>
              <SelectField
                name="termTemplateId"
                defaultValue={defaultValues?.termTemplateId}
                placeholder="None"
                options={[{ value: "", label: "None" }, ...termTemplates.map((t) => ({ value: t.id, label: t.label }))]}
              />
            </Field>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="notes">Notes</FieldLabel>
              <Textarea id="notes" name="notes" rows={3} defaultValue={defaultValues?.notes} />
            </Field>
            <Field>
              <FieldLabel htmlFor="terms">Terms</FieldLabel>
              <Textarea id="terms" name="terms" rows={3} defaultValue={defaultValues?.terms} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="bankAccountId">Bank account (shown on invoice)</FieldLabel>
            <SelectField
              name="bankAccountId"
              defaultValue={defaultValues?.bankAccountId}
              placeholder="None"
              options={[{ value: "", label: "None" }, ...bankAccounts.map((a) => ({ value: a.id, label: a.name }))]}
            />
          </Field>
        </CardContent>
      </Card>

      <Card className="bg-accent-pink text-accent-pink-foreground ring-0">
        <CardHeader>
          <CardTitle className="text-accent-pink-foreground">Select Signature</CardTitle>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="signatureId">Signature</FieldLabel>
            <SelectField
              name="signatureId"
              defaultValue={defaultValues?.signatureId}
              placeholder="No signature"
              options={[
                { value: "", label: "No signature" },
                ...signatures.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </Field>
        </CardContent>
      </Card>

      {showPayments ? (
        <Card className="bg-accent-mint text-accent-mint-foreground ring-0">
          <CardHeader>
            <CardTitle className="text-accent-mint-foreground">Add payment</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentSplitsEditor
              bankAccounts={bankAccounts}
              defaultBankAccountId={defaultValues?.bankAccountId}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="sticky bottom-0 z-20 flex items-center gap-3 border-t bg-background/95 py-3 backdrop-blur-sm">
        {canDraft ? <SubmitIntentButton intent="draft">Save as Draft</SubmitIntentButton> : null}
        <SubmitIntentButton intent="finalize_print">Save &amp; Print</SubmitIntentButton>
        <SubmitIntentButton intent="finalize" variant="default">
          {canDraft ? "Save" : "Save changes"}
        </SubmitIntentButton>
      </div>
    </form>
  );
}
