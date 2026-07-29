"use client";

import { Fragment, useState } from "react";
import { X, MessageSquarePlus } from "lucide-react";
import { computeLineItem } from "@/lib/documents/calc";
import { minorToRupeesString } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export type LineItemRow = {
  productId: string;
  variantId: string;
  description: string;
  notes: string;
  hsnOrSac: string;
  unit: string;
  quantity: string;
  unitPriceMinor: string;
  discountType: "amount" | "percentage";
  discountValue: string;
  taxRatePercent: string;
  /** Purchases-only, gated by the business's trackItcEligibility preference; unused by Invoice. */
  itcEligible?: boolean;
};

export const BLANK_LINE_ITEM: LineItemRow = {
  productId: "",
  variantId: "",
  description: "",
  notes: "",
  hsnOrSac: "",
  unit: "PCS",
  quantity: "1",
  unitPriceMinor: "",
  discountType: "percentage",
  discountValue: "0",
  taxRatePercent: "0",
  itcEligible: true,
};

type ProductSearchResult = {
  id: string;
  variantId: string;
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

function productToLineItem(product: ProductSearchResult, quantity: string): LineItemRow {
  return {
    ...BLANK_LINE_ITEM,
    productId: product.id,
    variantId: product.variantId,
    description: product.name,
    hsnOrSac: product.hsnOrSac,
    unit: product.unit,
    quantity,
    taxRatePercent: String(product.taxRatePercent),
    unitPriceMinor: minorToRupeesString(
      product.priceIsTaxInclusive
        ? Math.round((product.sellingPriceMinor * 100) / (100 + product.taxRatePercent))
        : product.sellingPriceMinor,
    ),
  };
}

function ProductSearchBox({
  onSelect,
  onQueryChange,
}: {
  onSelect: (product: ProductSearchResult) => void;
  onQueryChange: (query: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [open, setOpen] = useState(false);

  async function search(q: string) {
    setQuery(q);
    onQueryChange(q);
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
        placeholder="Search product/service, or type a custom item name…"
        className={fieldClass}
      />
      {open && results.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-56 w-full min-w-72 overflow-auto rounded-lg border bg-popover text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
          {results.map((p, i) => (
            <li key={`${p.id}__${p.variantId}__${i}`}>
              <button
                type="button"
                onMouseDown={() => {
                  onSelect(p);
                  // Keep the picked name visible inside the search field itself, matching how
                  // the item stays legible while the user still has to set quantity and confirm.
                  setQuery(p.name);
                  setResults([]);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
              >
                <span>
                  {p.name}
                  {p.barcode ? <span className="text-muted-foreground"> · {p.barcode}</span> : null}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  ₹{minorToRupeesString(p.sellingPriceMinor)}
                </span>
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
  trackItcEligibility = false,
}: {
  defaultRows: LineItemRow[];
  businessState: string;
  placeOfSupplyState: string;
  /** Purchases-only: shows a per-line ITC-eligible checkbox (default checked) when true. */
  trackItcEligibility?: boolean;
}) {
  const [rows, setRows] = useState<LineItemRow[]>(defaultRows);
  const [stagingProduct, setStagingProduct] = useState<ProductSearchResult | null>(null);
  const [stagingText, setStagingText] = useState("");
  const [stagingQuantity, setStagingQuantity] = useState("1");
  const [searchBoxKey, setSearchBoxKey] = useState(0);
  const [openNotes, setOpenNotes] = useState<Record<number, boolean>>({});

  function update(index: number, patch: Partial<LineItemRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addToBill() {
    const trimmedText = stagingText.trim();
    if (!stagingProduct && !trimmedText) return;
    const newRow = stagingProduct
      ? productToLineItem(stagingProduct, stagingQuantity || "1")
      : { ...BLANK_LINE_ITEM, description: trimmedText, quantity: stagingQuantity || "1" };
    setRows((prev) => [...prev, newRow]);
    setStagingProduct(null);
    setStagingText("");
    setStagingQuantity("1");
    setSearchBoxKey((k) => k + 1);
  }

  const columnCount = 8 + (trackItcEligibility ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-12 items-end gap-2 rounded-lg border bg-muted/20 p-3">
        <div className="col-span-12 sm:col-span-6">
          <label className="mb-1 block text-xs text-muted-foreground">Item name</label>
          <ProductSearchBox
            key={searchBoxKey}
            onSelect={(p) => {
              setStagingProduct(p);
              setStagingText(p.name);
            }}
            onQueryChange={(q) => {
              setStagingText(q);
              setStagingProduct(null);
            }}
          />
        </div>
        <div className="col-span-6 sm:col-span-3">
          <label className="mb-1 block text-xs text-muted-foreground">Quantity</label>
          <input
            type="number"
            min="0"
            step="any"
            value={stagingQuantity}
            onChange={(e) => setStagingQuantity(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="col-span-6 sm:col-span-3">
          <Button
            type="button"
            onClick={addToBill}
            disabled={!stagingProduct && !stagingText.trim()}
            className="w-full"
          >
            Add to bill
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No line items yet — search or type a name above.</p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-40">Item</TableHead>
                <TableHead className="w-24">HSN/SAC</TableHead>
                <TableHead className="w-28">Qty / Unit</TableHead>
                <TableHead className="w-28">Price</TableHead>
                <TableHead className="w-36">Discount</TableHead>
                <TableHead className="w-20">Tax %</TableHead>
                {trackItcEligibility ? <TableHead className="w-16">ITC</TableHead> : null}
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <Fragment key={i}>
                  <TableRow>
                    <TableCell className="whitespace-normal">
                      <input
                        name={`lineItem__${i}__description`}
                        value={row.description}
                        readOnly
                        aria-label="Item name (set when added, not editable here)"
                        className={`cursor-default bg-muted/50 ${fieldClass}`}
                      />
                      <button
                        type="button"
                        onClick={() => setOpenNotes((prev) => ({ ...prev, [i]: !prev[i] }))}
                        className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <MessageSquarePlus className="size-3" />
                        {row.notes || openNotes[i] ? "Note" : "Add note"}
                      </button>
                      <input type="hidden" name={`lineItem__${i}__productId`} value={row.productId} />
                      <input type="hidden" name={`lineItem__${i}__variantId`} value={row.variantId} />
                    </TableCell>
                    <TableCell>
                      <input
                        name={`lineItem__${i}__hsnOrSac`}
                        value={row.hsnOrSac}
                        onChange={(e) => update(i, { hsnOrSac: e.target.value })}
                        placeholder="HSN/SAC"
                        className={fieldClass}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <input
                          name={`lineItem__${i}__quantity`}
                          type="number"
                          min="0"
                          step="any"
                          value={row.quantity}
                          onChange={(e) => update(i, { quantity: e.target.value })}
                          placeholder="Qty"
                          required
                          className={`w-14 ${fieldClass}`}
                        />
                        <input
                          name={`lineItem__${i}__unit`}
                          value={row.unit}
                          onChange={(e) => update(i, { unit: e.target.value })}
                          placeholder="Unit"
                          className={fieldClass}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <input
                        name={`lineItem__${i}__unitPriceMinor`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.unitPriceMinor}
                        onChange={(e) => update(i, { unitPriceMinor: e.target.value })}
                        placeholder="Unit price"
                        required
                        className={fieldClass}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <select
                          name={`lineItem__${i}__discountType`}
                          value={row.discountType}
                          onChange={(e) =>
                            update(i, { discountType: e.target.value as LineItemRow["discountType"] })
                          }
                          className={fieldClass}
                        >
                          <option value="percentage">%</option>
                          <option value="amount">₹</option>
                        </select>
                        <input
                          name={`lineItem__${i}__discountValue`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.discountValue}
                          onChange={(e) => update(i, { discountValue: e.target.value })}
                          className={`w-16 ${fieldClass}`}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <input
                        name={`lineItem__${i}__taxRatePercent`}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={row.taxRatePercent}
                        onChange={(e) => update(i, { taxRatePercent: e.target.value })}
                        placeholder="Tax %"
                        className={fieldClass}
                      />
                    </TableCell>
                    {trackItcEligibility ? (
                      <TableCell>
                        <input
                          type="checkbox"
                          name={`lineItem__${i}__itcEligible`}
                          checked={row.itcEligible ?? true}
                          onChange={(e) => update(i, { itcEligible: e.target.checked })}
                          className="size-4 rounded border-input"
                        />
                      </TableCell>
                    ) : null}
                    <TableCell className="text-right font-medium">
                      ₹{rowPreviewTotal(row, businessState, placeOfSupplyState)}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setRows((prev) => prev.filter((_, idx) => idx !== i));
                          setOpenNotes((prev) => {
                            const rest = { ...prev };
                            delete rest[i];
                            return rest;
                          });
                        }}
                        aria-label="Remove line item"
                        className="text-destructive hover:text-destructive"
                      >
                        <X />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {row.notes || openNotes[i] ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={columnCount} className="whitespace-normal bg-muted/20">
                        <Textarea
                          name={`lineItem__${i}__notes`}
                          value={row.notes}
                          onChange={(e) => update(i, { notes: e.target.value })}
                          placeholder="Note for this line item (e.g. check-in/check-out dates) — printed on the PDF…"
                          className="min-h-12 text-sm"
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    <tr className="hidden">
                      <td>
                        <input type="hidden" name={`lineItem__${i}__notes`} value={row.notes} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
