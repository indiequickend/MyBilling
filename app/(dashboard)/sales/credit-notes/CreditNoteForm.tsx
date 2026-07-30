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
import { DISCOUNT_TARGETS, DISCOUNT_TARGET_LABELS } from "@/lib/constants/invoices";
import { LineItemsEditor, type LineItemRow } from "@/components/documents/LineItemsEditor";
import { saveCreditNoteAction, type CreditNoteFormState } from "./actions";

const initialState: CreditNoteFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      Issue credit note
    </Button>
  );
}

export function CreditNoteForm({
  linkedInvoiceId,
  customerLabel,
  invoiceDocNumber,
  businessState,
  warehouses,
  defaultWarehouseId,
  defaultValues,
}: {
  linkedInvoiceId: string;
  customerLabel: string;
  invoiceDocNumber: string;
  businessState: string;
  warehouses: Array<{ id: string; name: string }>;
  defaultWarehouseId?: string;
  defaultValues: {
    creditNoteDate: string;
    reason: string;
    restockItems: boolean;
    placeOfSupplyState: string;
    roundOff: boolean;
    discountType: "amount" | "percentage";
    discountValue: string;
    discountTarget: (typeof DISCOUNT_TARGETS)[number];
    lineItems: LineItemRow[];
  };
}) {
  const [state, formAction] = useActionState(saveCreditNoteAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <FormError message={state.error} />
      <input type="hidden" name="linkedInvoiceId" value={linkedInvoiceId} />

      <Card>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Customer</FieldLabel>
                <p className="text-sm font-medium">{customerLabel}</p>
              </Field>
              <Field>
                <FieldLabel>Against invoice</FieldLabel>
                <p className="text-sm font-medium">{invoiceDocNumber}</p>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Credit note date"
                name="creditNoteDate"
                type="date"
                required
                defaultValue={defaultValues.creditNoteDate}
                error={state.fieldErrors?.creditNoteDate}
              />
              <FormField
                label="Place of supply (state)"
                name="placeOfSupplyState"
                required
                defaultValue={defaultValues.placeOfSupplyState}
                error={state.fieldErrors?.placeOfSupplyState}
              />
            </div>
            <FormField
              label="Reason"
              name="reason"
              defaultValue={defaultValues.reason}
              error={state.fieldErrors?.reason}
            />
            <Field orientation="horizontal">
              <Checkbox id="restockItems" name="restockItems" defaultChecked={defaultValues.restockItems} />
              <FieldLabel htmlFor="restockItems" className="font-normal">
                Add these items back to inventory (only for a physical return — leave off for a
                price-only adjustment)
              </FieldLabel>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent>
          <LineItemsEditor
            defaultRows={defaultValues.lineItems}
            businessState={businessState}
            placeOfSupplyState={defaultValues.placeOfSupplyState}
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
                defaultValue={defaultValues.discountType}
                placeholder="Type"
                options={[
                  { value: "percentage", label: "Percentage" },
                  { value: "amount", label: "Amount" },
                ]}
              />
            </Field>
            <FormField label="Value" name="discountValue" type="number" defaultValue={defaultValues.discountValue} />
            <Field>
              <FieldLabel htmlFor="discountTarget">Applies to</FieldLabel>
              <SelectField
                name="discountTarget"
                defaultValue={defaultValues.discountTarget}
                placeholder="Applies to"
                options={DISCOUNT_TARGETS.map((t) => ({ value: t, label: DISCOUNT_TARGET_LABELS[t] }))}
              />
            </Field>
            <Field orientation="horizontal" className="pt-6">
              <Checkbox id="roundOff" name="roundOff" defaultChecked={defaultValues.roundOff} />
              <FieldLabel htmlFor="roundOff" className="font-normal">
                Round off total
              </FieldLabel>
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-20 flex items-center gap-3 border-t bg-background/95 py-3 backdrop-blur-sm">
        <SubmitButton />
      </div>
    </form>
  );
}
