"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { AddressFields, type AddressFieldValues } from "@/components/ui/AddressFields";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { createCustomerAction, updateCustomerAction, type CustomerFormState } from "./actions";

const initialState: CustomerFormState = {};

export function CustomerForm({
  mode,
  customerId,
  groups,
  defaultValues,
}: {
  mode: "create" | "edit";
  customerId?: string;
  groups: Array<{ id: string; name: string }>;
  defaultValues?: {
    displayName: string;
    companyName: string;
    gstin: string;
    email: string;
    phone: string;
    notes: string;
    groupIds: string[];
    billing: AddressFieldValues | null;
    shipping: AddressFieldValues | null;
  };
}) {
  const action = mode === "create" ? createCustomerAction : updateCustomerAction;
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <FormError message={state.error} />
      {customerId ? <input type="hidden" name="customerId" value={customerId} /> : null}

      <Card>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Name"
                name="displayName"
                required
                defaultValue={defaultValues?.displayName}
                error={state.fieldErrors?.displayName}
              />
              <FormField
                label="Company name"
                name="companyName"
                defaultValue={defaultValues?.companyName}
                error={state.fieldErrors?.companyName}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="GSTIN"
                name="gstin"
                defaultValue={defaultValues?.gstin}
                placeholder="22AAAAA0000A1Z5"
                error={state.fieldErrors?.gstin}
              />
              <FormField
                label="Phone"
                name="phone"
                defaultValue={defaultValues?.phone}
                error={state.fieldErrors?.phone}
              />
            </div>
            <FormField
              label="Email"
              name="email"
              type="email"
              defaultValue={defaultValues?.email}
              error={state.fieldErrors?.email}
            />

            {groups.length > 0 ? (
              <FieldSet>
                <FieldLegend variant="label">Groups</FieldLegend>
                <div className="flex flex-wrap gap-4">
                  {groups.map((g) => (
                    <Field key={g.id} orientation="horizontal" className="w-auto">
                      <Checkbox
                        id={`group-${g.id}`}
                        name="groupIds"
                        value={g.id}
                        defaultChecked={defaultValues?.groupIds.includes(g.id)}
                      />
                      <FieldLabel htmlFor={`group-${g.id}`} className="font-normal">
                        {g.name}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              </FieldSet>
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            <AddressFields
              legend="Billing address"
              namePrefix="billing"
              defaultValue={defaultValues?.billing}
            />
            <AddressFields
              legend="Shipping address"
              namePrefix="shipping"
              defaultValue={defaultValues?.shipping}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="notes">Notes</FieldLabel>
            <Textarea id="notes" name="notes" defaultValue={defaultValues?.notes} rows={3} />
          </Field>
        </CardContent>
      </Card>

      <div className="max-w-lg">
        <SubmitButton pendingText="Saving…">
          {mode === "create" ? "Create customer" : "Save changes"}
        </SubmitButton>
      </div>
    </form>
  );
}
