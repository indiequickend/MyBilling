"use client";

import { useActionState, useState } from "react";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { FormError } from "@/components/auth/AuthCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [variants, setVariants] = useState<VariantRow[]>(defaultValues?.variants ?? []);

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      <FormError message={state.error} />
      {productId ? <input type="hidden" name="productId" value={productId} /> : null}

      <Card>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Name"
                name="name"
                required
                defaultValue={defaultValues?.name}
                error={state.fieldErrors?.name}
              />
              <Field>
                <FieldLabel htmlFor="type">Type</FieldLabel>
                <SelectField
                  name="type"
                  defaultValue={defaultValues?.type ?? "product"}
                  placeholder="Type"
                  options={[
                    { value: "product", label: "Product" },
                    { value: "service", label: "Service" },
                  ]}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="categoryId">Category</FieldLabel>
                <SelectField
                  name="categoryId"
                  defaultValue={defaultValues?.categoryId}
                  placeholder="None"
                  options={[{ value: "", label: "None" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="groupId">Group</FieldLabel>
                <SelectField
                  name="groupId"
                  defaultValue={defaultValues?.groupId}
                  placeholder="None"
                  options={[{ value: "", label: "None" }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                label={
                  variants.length > 0
                    ? "Selling price (optional — variants below have their own)"
                    : "Selling price"
                }
                name="sellingPriceMinor"
                required={variants.length === 0}
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

            <Field orientation="horizontal">
              <Checkbox
                id="priceIsTaxInclusive"
                name="priceIsTaxInclusive"
                defaultChecked={defaultValues?.priceIsTaxInclusive}
              />
              <FieldLabel htmlFor="priceIsTaxInclusive" className="font-normal">
                Selling price is tax-inclusive
              </FieldLabel>
            </Field>

            <FormField
              label="Barcode"
              name="barcode"
              defaultValue={defaultValues?.barcode}
              error={state.fieldErrors?.barcode}
            />

            <Field>
              <FieldLabel htmlFor="images">Images</FieldLabel>
              {defaultValues?.images.length ? (
                <div className="mb-2 flex gap-2">
                  {defaultValues.images.map((img, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={img.url} alt="" className="h-16 w-16 rounded-lg border object-cover" />
                  ))}
                </div>
              ) : null}
              <input
                id="images"
                type="file"
                name="images"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="text-sm"
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Variants</CardTitle>
        </CardHeader>
        <CardContent>
          <VariantsEditor rows={variants} onChange={setVariants} />
        </CardContent>
      </Card>

      {priceLists.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Price list overrides</CardTitle>
          </CardHeader>
          <CardContent>
            <PriceOverridesEditor
              defaultOverrides={defaultValues?.priceOverrides ?? []}
              priceLists={priceLists}
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="max-w-xs">
        <SubmitButton pendingText="Saving…">
          {mode === "create" ? "Create product" : "Save changes"}
        </SubmitButton>
      </div>
    </form>
  );
}
