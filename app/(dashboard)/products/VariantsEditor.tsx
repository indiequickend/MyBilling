"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

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

const fieldClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function VariantsEditor({ defaultVariants }: { defaultVariants: VariantRow[] }) {
  const [rows, setRows] = useState<VariantRow[]>(defaultVariants);

  function update(index: number, patch: Partial<VariantRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Each variant is its own stock-tracked SKU under this product (e.g. size/color).
      </p>

      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-6 gap-2 rounded-lg border bg-muted/30 p-3">
          <input
            name={`variant__${i}__name`}
            value={row.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="Name (e.g. Red - L)"
            className={fieldClass}
          />
          <input
            name={`variant__${i}__sku`}
            value={row.sku}
            onChange={(e) => update(i, { sku: e.target.value })}
            placeholder="SKU"
            className={fieldClass}
          />
          <input
            name={`variant__${i}__barcode`}
            value={row.barcode}
            onChange={(e) => update(i, { barcode: e.target.value })}
            placeholder="Barcode"
            className={fieldClass}
          />
          <input
            name={`variant__${i}__sellingPriceOverrideMinor`}
            value={row.sellingPriceOverrideMinor}
            onChange={(e) => update(i, { sellingPriceOverrideMinor: e.target.value })}
            placeholder="Selling price"
            className={fieldClass}
          />
          <input
            name={`variant__${i}__purchasePriceOverrideMinor`}
            value={row.purchasePriceOverrideMinor}
            onChange={(e) => update(i, { purchasePriceOverrideMinor: e.target.value })}
            placeholder="Purchase price"
            className={fieldClass}
          />
          <div className="flex items-center gap-2">
            <input
              name={`variant__${i}__hsnOrSacOverride`}
              value={row.hsnOrSacOverride}
              onChange={(e) => update(i, { hsnOrSacOverride: e.target.value })}
              placeholder="HSN/SAC"
              className={fieldClass}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
              aria-label="Remove variant"
              className="shrink-0 text-destructive hover:text-destructive"
            >
              <X />
            </Button>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={() => setRows((prev) => [...prev, { ...BLANK_ROW }])}>
        + Add variant
      </Button>
    </div>
  );
}
