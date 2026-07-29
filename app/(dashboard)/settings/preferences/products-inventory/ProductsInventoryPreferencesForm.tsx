"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Checkbox } from "@/components/ui/checkbox";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { updateProductsInventoryPreferencesAction, type PreferencesPageState } from "../actions";

const initialState: PreferencesPageState = {};

export function ProductsInventoryPreferencesForm({
  preferences,
  warehouses,
}: {
  preferences: {
    product: {
      defaultItemType: "product" | "service";
      defaultPriceInclusiveOfTax: boolean;
      maxDiscountPercent: number;
      defaultUnit: string;
      defaultTaxRatePercent: number;
    };
    inventory: { trackInventory: boolean; defaultWarehouseId: string };
    batch: { batchTrackingEnabledByDefault: boolean; expiryTrackingEnabledByDefault: boolean };
  };
  warehouses: Array<{ id: string; name: string }>;
}) {
  const [state, formAction] = useActionState(
    updateProductsInventoryPreferencesAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state.error} />
      <FormNotice message={state.success} />

      <FieldSet className="rounded-lg border p-4">
        <FieldLegend variant="label">Product defaults</FieldLegend>
        <FieldGroup className="gap-3">
          <Field className="max-w-xs">
            <FieldLabel htmlFor="product__defaultItemType">Default item type</FieldLabel>
            <SelectField
              name="product__defaultItemType"
              defaultValue={preferences.product.defaultItemType}
              placeholder="Item type"
              options={[
                { value: "product", label: "Product" },
                { value: "service", label: "Service" },
              ]}
            />
          </Field>

          <Field orientation="horizontal">
            <Checkbox
              name="product__defaultPriceInclusiveOfTax"
              defaultChecked={preferences.product.defaultPriceInclusiveOfTax}
            />
            <FieldLabel className="font-normal">Prices are tax-inclusive by default</FieldLabel>
          </Field>

          <div className="grid max-w-md grid-cols-3 gap-3">
            <FormField
              label="Max line discount %"
              name="product__maxDiscountPercent"
              type="number"
              defaultValue={String(preferences.product.maxDiscountPercent)}
            />
            <FormField
              label="Default unit"
              name="product__defaultUnit"
              defaultValue={preferences.product.defaultUnit}
            />
            <FormField
              label="Default tax rate %"
              name="product__defaultTaxRatePercent"
              type="number"
              defaultValue={String(preferences.product.defaultTaxRatePercent)}
            />
          </div>
        </FieldGroup>
      </FieldSet>

      <FieldSet className="rounded-lg border p-4">
        <FieldLegend variant="label">Inventory defaults</FieldLegend>
        <FieldGroup className="gap-3">
          <Field orientation="horizontal">
            <Checkbox
              name="inventory__trackInventory"
              defaultChecked={preferences.inventory.trackInventory}
            />
            <FieldLabel className="font-normal">Track inventory</FieldLabel>
          </Field>

          <Field className="max-w-xs">
            <FieldLabel htmlFor="inventory__defaultWarehouseId">Default warehouse</FieldLabel>
            <SelectField
              name="inventory__defaultWarehouseId"
              defaultValue={preferences.inventory.defaultWarehouseId}
              placeholder="None"
              options={[{ value: "", label: "None" }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
            />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet className="rounded-lg border p-4">
        <FieldLegend variant="label">Batch defaults</FieldLegend>
        <FieldGroup className="gap-3">
          <Field orientation="horizontal">
            <Checkbox
              name="batch__batchTrackingEnabledByDefault"
              defaultChecked={preferences.batch.batchTrackingEnabledByDefault}
            />
            <FieldLabel className="font-normal">Enable batch tracking by default</FieldLabel>
          </Field>

          <Field orientation="horizontal">
            <Checkbox
              name="batch__expiryTrackingEnabledByDefault"
              defaultChecked={preferences.batch.expiryTrackingEnabledByDefault}
            />
            <FieldLabel className="font-normal">Enable expiry tracking by default</FieldLabel>
          </Field>
        </FieldGroup>
      </FieldSet>

      <div className="max-w-xs">
        <SubmitButton pendingText="Saving…">Save product & inventory preferences</SubmitButton>
      </div>
    </form>
  );
}
