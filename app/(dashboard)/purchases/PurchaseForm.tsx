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
import { savePurchaseAction, type PurchaseFormState } from "./actions";

const initialState: PurchaseFormState = {};

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

export type PurchaseFormDefaultValues = {
  vendorId: string;
  purchaseDate: string;
  dueDate: string;
  referenceNumber: string;
  vendorInvoiceNumber: string;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  roundOff: boolean;
  notes: string;
  terms: string;
  noteTemplateId: string;
  termTemplateId: string;
  bankAccountId: string;
  discountType: "amount" | "percentage";
  discountValue: string;
  discountTarget: (typeof DISCOUNT_TARGETS)[number];
  customFieldValues: Record<string, unknown>;
  lineItems: LineItemRow[];
  sourcePurchaseOrderId?: string;
};

export function PurchaseForm({
  mode,
  purchaseId,
  editableStatus,
  vendors,
  bankAccounts,
  noteTemplates,
  termTemplates,
  warehouses,
  defaultWarehouseId,
  customFieldDefs,
  businessState,
  trackItcEligibility,
  defaultValues,
}: {
  mode: "create" | "edit";
  purchaseId?: string;
  editableStatus?: "draft" | "pending" | "partially_paid";
  vendors: Array<{ id: string; label: string }>;
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
  trackItcEligibility: boolean;
  defaultValues?: PurchaseFormDefaultValues;
}) {
  const [state, formAction] = useActionState(savePurchaseAction, initialState);

  const canDraft = mode === "create" || editableStatus === "draft";
  const showPayments = mode === "create" || editableStatus === "draft";
  const placeOfSupplyState = defaultValues?.placeOfSupplyState ?? businessState;

  return (
    <form action={formAction} className="space-y-6">
      <FormError message={state.error} />
      {purchaseId ? <input type="hidden" name="purchaseId" value={purchaseId} /> : null}
      {defaultValues?.sourcePurchaseOrderId ? (
        <input type="hidden" name="sourcePurchaseOrderId" value={defaultValues.sourcePurchaseOrderId} />
      ) : null}

      <Card>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={state.fieldErrors?.vendorId ? true : undefined}>
                <FieldLabel htmlFor="vendorId">Vendor</FieldLabel>
                <SelectField
                  name="vendorId"
                  defaultValue={defaultValues?.vendorId}
                  placeholder="Select a vendor…"
                  options={vendors.map((v) => ({ value: v.id, label: v.label }))}
                  required
                />
                {state.fieldErrors?.vendorId ? (
                  <p className="text-sm text-destructive">{state.fieldErrors.vendorId}</p>
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
                label="Purchase date"
                name="purchaseDate"
                type="date"
                required
                defaultValue={defaultValues?.purchaseDate ?? new Date().toISOString().slice(0, 10)}
                error={state.fieldErrors?.purchaseDate}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Vendor invoice number"
                name="vendorInvoiceNumber"
                defaultValue={defaultValues?.vendorInvoiceNumber}
                error={state.fieldErrors?.vendorInvoiceNumber}
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
            trackItcEligibility={trackItcEligibility}
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
            <FieldLabel htmlFor="bankAccountId">Bank account (shown on purchase)</FieldLabel>
            <SelectField
              name="bankAccountId"
              defaultValue={defaultValues?.bankAccountId}
              placeholder="None"
              options={[{ value: "", label: "None" }, ...bankAccounts.map((a) => ({ value: a.id, label: a.name }))]}
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
