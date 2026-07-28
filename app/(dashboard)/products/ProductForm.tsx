"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { VariantsEditor, type VariantRow } from "./VariantsEditor";
import { PriceOverridesEditor, type PriceOverrideRow } from "./PriceOverridesEditor";
import { createProductAction, updateProductAction, type ProductFormState } from "./actions";

const initialState: ProductFormState = {};

export function ProductForm({
  mode,
  productId,
  categories,
  groups,
  priceLists,
  defaultValues,
}: {
  mode: "create" | "edit";
  productId?: string;
  categories: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string }>;
  priceLists: Array<{ id: string; name: string }>;
  defaultValues?: {
    name: string;
    type: "product" | "service";
    hsnOrSac: string;
    unit: string;
    categoryId: string;
    groupId: string;
    purchasePriceMinor: string;
    sellingPriceMinor: string;
    priceIsTaxInclusive: boolean;
    taxRatePercent: string;
    barcode: string;
    variants: VariantRow[];
    priceOverrides: PriceOverrideRow[];
    images: Array<{ url: string }>;
  };
}) {
  const action = mode === "create" ? createProductAction : updateProductAction;
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      <FormError message={state.error} />
      {productId ? <input type="hidden" name="productId" value={productId} /> : null}

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Name"
          name="name"
          required
          defaultValue={defaultValues?.name}
          error={state.fieldErrors?.name}
        />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Type</span>
          <select
            name="type"
            defaultValue={defaultValues?.type ?? "product"}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="HSN/SAC"
          name="hsnOrSac"
          defaultValue={defaultValues?.hsnOrSac}
          error={state.fieldErrors?.hsnOrSac}
        />
        <FormField
          label="Unit"
          name="unit"
          placeholder="PCS"
          defaultValue={defaultValues?.unit}
          error={state.fieldErrors?.unit}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Category</span>
          <select
            name="categoryId"
            defaultValue={defaultValues?.categoryId ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Group</span>
          <select
            name="groupId"
            defaultValue={defaultValues?.groupId ?? ""}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">None</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <FormField
          label="Selling price"
          name="sellingPriceMinor"
          required
          defaultValue={defaultValues?.sellingPriceMinor}
          error={state.fieldErrors?.sellingPriceMinor}
        />
        <FormField
          label="Purchase price"
          name="purchasePriceMinor"
          defaultValue={defaultValues?.purchasePriceMinor}
          error={state.fieldErrors?.purchasePriceMinor}
        />
        <FormField
          label="Tax rate %"
          name="taxRatePercent"
          defaultValue={defaultValues?.taxRatePercent ?? "0"}
          error={state.fieldErrors?.taxRatePercent}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="priceIsTaxInclusive"
          defaultChecked={defaultValues?.priceIsTaxInclusive}
        />
        Selling price is tax-inclusive
      </label>

      <FormField
        label="Barcode"
        name="barcode"
        defaultValue={defaultValues?.barcode}
        error={state.fieldErrors?.barcode}
      />

      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700">Images</span>
        {defaultValues?.images.length ? (
          <div className="mb-2 flex gap-2">
            {defaultValues.images.map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={img.url}
                alt=""
                className="h-16 w-16 rounded-md border border-slate-200 object-cover"
              />
            ))}
          </div>
        ) : null}
        <input
          type="file"
          name="images"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="text-sm"
        />
      </div>

      <VariantsEditor defaultVariants={defaultValues?.variants ?? []} />

      <PriceOverridesEditor
        defaultOverrides={defaultValues?.priceOverrides ?? []}
        priceLists={priceLists}
      />

      <div className="max-w-xs">
        <SubmitButton pendingText="Saving…">
          {mode === "create" ? "Create product" : "Save changes"}
        </SubmitButton>
      </div>
    </form>
  );
}
