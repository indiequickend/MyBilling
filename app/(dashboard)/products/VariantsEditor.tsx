"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type VariantRow = {
  name: string;
  sku: string;
  barcode: string;
  sellingPriceOverrideMinor: string;
  purchasePriceOverrideMinor: string;
};

const BLANK_ROW: VariantRow = {
  name: "",
  sku: "",
  barcode: "",
  sellingPriceOverrideMinor: "",
  purchasePriceOverrideMinor: "",
};

const fieldClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function VariantsEditor({
  rows,
  onChange,
}: {
  rows: VariantRow[];
  onChange: (rows: VariantRow[]) => void;
}) {
  function update(index: number, patch: Partial<VariantRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Each variant is its own stock-tracked SKU under this product (e.g. size/color). HSN/SAC is
        shared from the product above — variants don&apos;t need their own.
      </p>

      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-5">
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
          <div className="flex items-center gap-2">
            <input
              name={`variant__${i}__purchasePriceOverrideMinor`}
              value={row.purchasePriceOverrideMinor}
              onChange={(e) => update(i, { purchasePriceOverrideMinor: e.target.value })}
              placeholder="Purchase price"
              className={fieldClass}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              aria-label="Remove variant"
              className="shrink-0 text-destructive hover:text-destructive"
            >
              <X />
            </Button>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={() => onChange([...rows, { ...BLANK_ROW }])}>
        + Add variant
      </Button>
    </div>
  );
}
