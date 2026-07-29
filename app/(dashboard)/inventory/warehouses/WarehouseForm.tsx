"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { AddressFields, type AddressFieldValues } from "@/components/ui/AddressFields";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { Card, CardContent } from "@/components/ui/card";
import { createWarehouseAction, updateWarehouseAction, type WarehouseFormState } from "./actions";

const initialState: WarehouseFormState = {};

export function WarehouseForm({
  mode,
  warehouseId,
  defaultValues,
}: {
  mode: "create" | "edit";
  warehouseId?: string;
  defaultValues?: { name: string; address: AddressFieldValues | null };
}) {
  const action = mode === "create" ? createWarehouseAction : updateWarehouseAction;
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="max-w-lg space-y-6">
      <FormError message={state.error} />
      {warehouseId ? <input type="hidden" name="warehouseId" value={warehouseId} /> : null}

      <Card>
        <CardContent className="space-y-4">
          <FormField
            label="Name"
            name="name"
            required
            defaultValue={defaultValues?.name}
            error={state.fieldErrors?.name}
          />

          <AddressFields legend="Address" namePrefix="address" defaultValue={defaultValues?.address} />
        </CardContent>
      </Card>

      <div className="max-w-xs">
        <SubmitButton pendingText="Saving…">
          {mode === "create" ? "Create warehouse" : "Save changes"}
        </SubmitButton>
      </div>
    </form>
  );
}
