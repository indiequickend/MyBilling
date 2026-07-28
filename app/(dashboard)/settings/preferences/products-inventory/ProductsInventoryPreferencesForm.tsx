"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError, FormNotice } from "@/components/auth/AuthCard";
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

      <fieldset className="space-y-3 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-900">Product defaults</legend>

        <label className="block max-w-xs text-sm">
          <span className="mb-1 block font-medium text-slate-700">Default item type</span>
          <select
            name="product__defaultItemType"
            defaultValue={preferences.product.defaultItemType}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="product__defaultPriceInclusiveOfTax"
            defaultChecked={preferences.product.defaultPriceInclusiveOfTax}
          />
          Prices are tax-inclusive by default
        </label>

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
      </fieldset>

      <fieldset className="space-y-3 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-900">Inventory defaults</legend>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="inventory__trackInventory"
            defaultChecked={preferences.inventory.trackInventory}
          />
          Track inventory
        </label>

        <label className="block max-w-xs text-sm">
          <span className="mb-1 block font-medium text-slate-700">Default warehouse</span>
          <select
            name="inventory__defaultWarehouseId"
            defaultValue={preferences.inventory.defaultWarehouseId}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">None</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-900">Batch defaults</legend>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="batch__batchTrackingEnabledByDefault"
            defaultChecked={preferences.batch.batchTrackingEnabledByDefault}
          />
          Enable batch tracking by default
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="batch__expiryTrackingEnabledByDefault"
            defaultChecked={preferences.batch.expiryTrackingEnabledByDefault}
          />
          Enable expiry tracking by default
        </label>
      </fieldset>

      <div className="max-w-xs">
        <SubmitButton pendingText="Saving…">Save product & inventory preferences</SubmitButton>
      </div>
    </form>
  );
}
