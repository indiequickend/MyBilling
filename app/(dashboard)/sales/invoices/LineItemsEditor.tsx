"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { computeLineItem } from "@/lib/invoices/calc";
import { minorToRupeesString } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";

export type LineItemRow = {
  productId: string;
  variantId: string;
  description: string;
  hsnOrSac: string;
  unit: string;
  quantity: string;
  unitPriceMinor: string;
  discountType: "amount" | "percentage";
  discountValue: string;
  taxRatePercent: string;
};

export const BLANK_LINE_ITEM: LineItemRow = {
  productId: "",
  variantId: "",
  description: "",
  hsnOrSac: "",
  unit: "PCS",
  quantity: "1",
  unitPriceMinor: "",
  discountType: "percentage",
  discountValue: "0",
  taxRatePercent: "0",
};

type ProductSearchResult = {
  id: string;
  name: string;
  hsnOrSac: string;
  unit: string;
  sellingPriceMinor: number;
  priceIsTaxInclusive: boolean;
  taxRatePercent: number;
  barcode: string;
};

const fieldClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function rowPreviewTotal(row: LineItemRow, businessState: string, placeOfSupplyState: string): string {
  const quantity = Number(row.quantity);
  const unitPriceMinor = Math.round(Number(row.unitPriceMinor || "0") * 100);
  const discountValue =
    row.discountType === "percentage"
      ? Number(row.discountValue || "0")
      : Math.round(Number(row.discountValue || "0") * 100);
  const taxRatePercent = Number(row.taxRatePercent || "0");
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPriceMinor)) return "0.00";
  const result = computeLineItem(
    { quantity, unitPriceMinor, discountType: row.discountType, discountValue, taxRatePercent },
    businessState,
    placeOfSupplyState,
  );
  return minorToRupeesString(result.totalMinor);
}

function ProductSearchBox({ onSelect }: { onSelect: (product: ProductSearchResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [open, setOpen] = useState(false);

  async function search(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const data = await res.json();
    setResults(data.products ?? []);
    setOpen(true);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => search(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search product or barcode…"
        className={fieldClass}
      />
      {open && results.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-48 w-64 overflow-auto rounded-lg border bg-popover text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={() => {
                  onSelect(p);
                  setQuery("");
                  setResults([]);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left hover:bg-muted"
              >
                {p.name}
                {p.barcode ? <span className="text-muted-foreground"> · {p.barcode}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function LineItemsEditor({
  defaultRows,
  businessState,
  placeOfSupplyState,
}: {
  defaultRows: LineItemRow[];
  businessState: string;
  placeOfSupplyState: string;
}) {
  const [rows, setRows] = useState<LineItemRow[]>(
    defaultRows.length > 0 ? defaultRows : [{ ...BLANK_LINE_ITEM }],
  );

  function update(index: number, patch: Partial<LineItemRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function selectProduct(index: number, product: ProductSearchResult) {
    update(index, {
      productId: product.id,
      description: product.name,
      hsnOrSac: product.hsnOrSac,
      unit: product.unit,
      taxRatePercent: String(product.taxRatePercent),
      unitPriceMinor: minorToRupeesString(
        product.priceIsTaxInclusive
          ? Math.round((product.sellingPriceMinor * 100) / (100 + product.taxRatePercent))
          : product.sellingPriceMinor,
      ),
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-12 sm:col-span-3">
                <ProductSearchBox onSelect={(p) => selectProduct(i, p)} />
              </div>
              <input
                name={`lineItem__${i}__description`}
                value={row.description}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder="Description"
                required
                className={`col-span-6 sm:col-span-3 ${fieldClass}`}
              />
              <input
                name={`lineItem__${i}__hsnOrSac`}
                value={row.hsnOrSac}
                onChange={(e) => update(i, { hsnOrSac: e.target.value })}
                placeholder="HSN/SAC"
                className={`col-span-3 sm:col-span-1 ${fieldClass}`}
              />
              <input
                name={`lineItem__${i}__unit`}
                value={row.unit}
                onChange={(e) => update(i, { unit: e.target.value })}
                placeholder="Unit"
                className={`col-span-3 sm:col-span-1 ${fieldClass}`}
              />
              <input
                name={`lineItem__${i}__quantity`}
                type="number"
                min="0"
                step="any"
                value={row.quantity}
                onChange={(e) => update(i, { quantity: e.target.value })}
                placeholder="Qty"
                required
                className={`col-span-3 sm:col-span-1 ${fieldClass}`}
              />
              <input
                name={`lineItem__${i}__unitPriceMinor`}
                type="number"
                min="0"
                step="0.01"
                value={row.unitPriceMinor}
                onChange={(e) => update(i, { unitPriceMinor: e.target.value })}
                placeholder="Unit price"
                required
                className={`col-span-3 sm:col-span-2 ${fieldClass}`}
              />
              <input type="hidden" name={`lineItem__${i}__productId`} value={row.productId} />
            </div>

            <div className="grid grid-cols-12 items-center gap-2">
              <select
                name={`lineItem__${i}__discountType`}
                value={row.discountType}
                onChange={(e) =>
                  update(i, { discountType: e.target.value as LineItemRow["discountType"] })
                }
                className={`col-span-4 sm:col-span-2 ${fieldClass}`}
              >
                <option value="percentage">Discount %</option>
                <option value="amount">Discount ₹</option>
              </select>
              <input
                name={`lineItem__${i}__discountValue`}
                type="number"
                min="0"
                step="0.01"
                value={row.discountValue}
                onChange={(e) => update(i, { discountValue: e.target.value })}
                className={`col-span-4 sm:col-span-2 ${fieldClass}`}
              />
              <input
                name={`lineItem__${i}__taxRatePercent`}
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={row.taxRatePercent}
                onChange={(e) => update(i, { taxRatePercent: e.target.value })}
                placeholder="Tax %"
                className={`col-span-4 sm:col-span-2 ${fieldClass}`}
              />
              <div className="col-span-8 flex items-center text-sm text-muted-foreground sm:col-span-4">
                Line total: ₹{rowPreviewTotal(row, businessState, placeOfSupplyState)}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                disabled={rows.length === 1}
                className="col-span-4 justify-self-end text-destructive hover:text-destructive sm:col-span-2"
              >
                <X data-icon="inline-start" />
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={() => setRows((prev) => [...prev, { ...BLANK_LINE_ITEM }])}>
        + Add line
      </Button>
    </div>
  );
}
