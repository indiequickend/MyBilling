"use client";

import { useState } from "react";

export type VariantRow = {
  name: string;
  sku: string;
  barcode: string;
  sellingPriceOverrideMinor: string;
  purchasePriceOverrideMinor: string;
  hsnOrSacOverride: string;
};

const BLANK_ROW: VariantRow = {
  name: "",
  sku: "",
  barcode: "",
  sellingPriceOverrideMinor: "",
  purchasePriceOverrideMinor: "",
  hsnOrSacOverride: "",
};

const inputClass = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

export function VariantsEditor({ defaultVariants }: { defaultVariants: VariantRow[] }) {
  const [rows, setRows] = useState<VariantRow[]>(defaultVariants);

  function update(index: number, patch: Partial<VariantRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium text-slate-700">Variants</legend>
      <p className="text-xs text-slate-500">
        Each variant is its own stock-tracked SKU under this product (e.g. size/color).
      </p>

      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-6 gap-2 rounded-md border border-slate-200 p-3">
          <input
            name={`variant__${i}__name`}
            value={row.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Name (e.g. Red - L)"
            className={inputClass}
          />
          <input
            name={`variant__${i}__sku`}
            value={row.sku}
            onChange={(e) => update(i, { sku: e.target.value })}
            placeholder="SKU"
            className={inputClass}
          />
          <input
            name={`variant__${i}__barcode`}
            value={row.barcode}
            onChange={(e) => update(i, { barcode: e.target.value })}
            placeholder="Barcode"
            className={inputClass}
          />
          <input
            name={`variant__${i}__sellingPriceOverrideMinor`}
            value={row.sellingPriceOverrideMinor}
            onChange={(e) => update(i, { sellingPriceOverrideMinor: e.target.value })}
            placeholder="Selling price"
            className={inputClass}
          />
          <input
            name={`variant__${i}__purchasePriceOverrideMinor`}
            value={row.purchasePriceOverrideMinor}
            onChange={(e) => update(i, { purchasePriceOverrideMinor: e.target.value })}
            placeholder="Purchase price"
            className={inputClass}
          />
          <div className="flex items-center gap-2">
            <input
              name={`variant__${i}__hsnOrSacOverride`}
              value={row.hsnOrSacOverride}
              onChange={(e) => update(i, { hsnOrSacOverride: e.target.value })}
              placeholder="HSN/SAC"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
              className="shrink-0 text-xs text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, { ...BLANK_ROW }])}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
      >
        + Add variant
      </button>
    </fieldset>
  );
}
