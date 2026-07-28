"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { AddressFields, type AddressFieldValues } from "@/components/ui/AddressFields";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
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

      <div className="grid grid-cols-2 gap-4">
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

      <div className="grid grid-cols-2 gap-4">
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
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-slate-700">Groups</legend>
          <div className="flex flex-wrap gap-3">
            {groups.map((g) => (
              <label key={g.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="groupIds"
                  value={g.id}
                  defaultChecked={defaultValues?.groupIds.includes(g.id)}
                />
                {g.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="grid grid-cols-2 gap-6">
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

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Notes</span>
        <textarea
          name="notes"
          defaultValue={defaultValues?.notes}
          rows={3}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
        />
      </label>

      <div className="max-w-xs">
        <SubmitButton pendingText="Saving…">
          {mode === "create" ? "Create customer" : "Save changes"}
        </SubmitButton>
      </div>
    </form>
  );
}
