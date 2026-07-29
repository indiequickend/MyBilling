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
import { saveDebitNoteAction, type DebitNoteFormState } from "./actions";

const initialState: DebitNoteFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : null}
      Issue debit note
    </Button>
  );
}

export function DebitNoteForm({
  linkedPurchaseId,
  vendorLabel,
  purchaseDocNumber,
  businessState,
  defaultValues,
}: {
  linkedPurchaseId: string;
  vendorLabel: string;
  purchaseDocNumber: string;
  businessState: string;
  defaultValues: {
    debitNoteDate: string;
    reason: string;
    placeOfSupplyState: string;
    roundOff: boolean;
    discountType: "amount" | "percentage";
    discountValue: string;
    discountTarget: (typeof DISCOUNT_TARGETS)[number];
    lineItems: LineItemRow[];
  };
}) {
  const [state, formAction] = useActionState(saveDebitNoteAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <FormError message={state.error} />
      <input type="hidden" name="linkedPurchaseId" value={linkedPurchaseId} />

      <Card>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Vendor</FieldLabel>
                <p className="text-sm font-medium">{vendorLabel}</p>
              </Field>
              <Field>
                <FieldLabel>Against purchase</FieldLabel>
                <p className="text-sm font-medium">{purchaseDocNumber}</p>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Debit note date"
                name="debitNoteDate"
                type="date"
                required
                defaultValue={defaultValues.debitNoteDate}
                error={state.fieldErrors?.debitNoteDate}
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
