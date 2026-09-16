"use client";

import { Fragment, useMemo, useState } from "react";
import { X, MessageSquarePlus } from "lucide-react";
import {
  computeLineItem,
  computeDocumentTotals,
  type LineItemCalcInput,
} from "@/lib/documents/calc";
import { minorToRupeesString } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { DiscountTarget } from "@/lib/constants/invoices";

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
  /** Stock fields — only meaningful (and only rendered) when the row's product is stock-tracked.
   * warehouseId/batchId/serialNumbersText are the actual submitted values; the rest are
   * client-only display metadata copied from the product search result, never submitted. */
  warehouseId?: string;
  batchId?: string;
  serialNumbersText?: string;
  stockTrackingEnabled?: boolean;
  batchTracked?: boolean;
  serialTracked?: boolean;
  availableBatches?: Array<{ id: string; label: string }>;
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
  warehouseId: "",
  batchId: "",
  serialNumbersText: "",
  stockTrackingEnabled: false,
  batchTracked: false,
  serialTracked: false,
  availableBatches: [],
};

type ProductSearchResult = {
  id: string;
  variantId: string;
  name: string;
  type: "product" | "service";
  hsnOrSac: string;
  unit: string;
  sellingPriceMinor: number;
  purchasePriceMinor: number;
  priceIsTaxInclusive: boolean;
  taxRatePercent: number;
  barcode: string;
  stockTracking: { enabled: boolean; batchTracked: boolean; serialTracked: boolean };
  batches: Array<{ id: string; label: string }>;
};

const fieldClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Mirrors normalizeDiscountValue's convention (lib/validation/shared.ts): a percentage discount
 * is a raw 0-100 number, an amount discount is a rupee string converted to minor units — same
 * rule for a line's own discount and the document-level one. */
function toLineItemCalcInput(row: LineItemRow): LineItemCalcInput | null {
  const quantity = Number(row.quantity);
  const unitPriceMinor = Math.round(Number(row.unitPriceMinor || "0") * 100);
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPriceMinor)) return null;
  const discountValue =
    row.discountType === "percentage"
      ? Number(row.discountValue || "0")
      : Math.round(Number(row.discountValue || "0") * 100);
  const taxRatePercent = Number(row.taxRatePercent || "0");
  return {
    quantity,
    unitPriceMinor,
    discountType: row.discountType,
    discountValue,
    taxRatePercent,
  };
}

function rowPreviewTotal(
  row: LineItemRow,
  businessState: string,
  placeOfSupplyState: string,
): string {
  const input = toLineItemCalcInput(row);
  if (!input) return "0.00";
  const result = computeLineItem(input, businessState, placeOfSupplyState);
  return minorToRupeesString(result.totalMinor);
}

function productToLineItem(
  product: ProductSearchResult,
  quantity: string,
  defaultWarehouseId?: string,
  usePurchasePrice?: boolean,
): LineItemRow {
  const priceMinor = usePurchasePrice ? product.purchasePriceMinor : product.sellingPriceMinor;
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
        ? Math.round((priceMinor * 100) / (100 + product.taxRatePercent))
        : priceMinor,
    ),
    warehouseId: product.stockTracking.enabled ? (defaultWarehouseId ?? "") : "",
    stockTrackingEnabled: product.stockTracking.enabled,
    batchTracked: product.stockTracking.batchTracked,
    serialTracked: product.stockTracking.serialTracked,
    availableBatches: product.batches,
  };
}

function ProductSearchBox({
  onSelect,
  onQueryChange,
  usePurchasePrice,
}: {
  onSelect: (product: ProductSearchResult) => void;
  onQueryChange: (query: string) => void;
  usePurchasePrice?: boolean;
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
    // The results list is a Radix Popover (portalled to document.body) rather than a plain
    // absolutely-positioned <ul> — this box lives inside a Card, which clips overflow, so a
    // plain absolute dropdown got cropped at the card's edge instead of floating above it.
    <Popover open={open && results.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search product/service, or type a custom item name…"
          className={fieldClass}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="max-h-56 w-(--radix-popper-anchor-width) min-w-72 overflow-auto p-0"
      >
        <ul>
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
                className="hover:bg-muted flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
              >
                <span>
                  {p.name}
                  {p.barcode ? <span className="text-muted-foreground"> · {p.barcode}</span> : null}
                </span>
                <span className="text-muted-foreground shrink-0">
                  ₹{minorToRupeesString(usePurchasePrice ? p.purchasePriceMinor : p.sellingPriceMinor)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function LineItemsEditor({
  defaultRows,
  businessState,
  placeOfSupplyState,
  trackItcEligibility = false,
  usePurchasePrice = false,
  warehouses = [],
  defaultWarehouseId,
  discountType = "percentage",
  discountValue = "0",
  discountTarget = "net_amount",
  roundOff = false,
  tcsApplicable = false,
  tcsAmountMinor = "",
}: {
  defaultRows: LineItemRow[];
  businessState: string;
  placeOfSupplyState: string;
  /** Purchases-only: shows a per-line ITC-eligible checkbox (default checked) when true. */
  trackItcEligibility?: boolean;
  /** Purchases/purchase-orders-only: seeds a newly added line's unit price from the product's
   * purchase price (falling back through the variant override the same way selling price does)
   * instead of its selling price. */
  usePurchasePrice?: boolean;
  /** When empty, no stock-tracked product can be added yet — the business has no warehouse. */
  warehouses?: Array<{ id: string; name: string }>;
  defaultWarehouseId?: string;
  /** Live mirror of the parent form's Discount &amp; round-off / TCS fields, so the totals
   * summary below the table stays in sync as the user types — see FormField's onChange and
   * SelectField/Checkbox's onValueChange/onCheckedChange in the calling form. */
  discountType?: "amount" | "percentage";
  discountValue?: string;
  discountTarget?: DiscountTarget;
  roundOff?: boolean;
  tcsApplicable?: boolean;
  tcsAmountMinor?: string;
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
      ? productToLineItem(
          stagingProduct,
          stagingQuantity || "1",
          defaultWarehouseId,
          usePurchasePrice,
        )
      : { ...BLANK_LINE_ITEM, description: trimmedText, quantity: stagingQuantity || "1" };
    setRows((prev) => [...prev, newRow]);
    setStagingProduct(null);
    setStagingText("");
    setStagingQuantity("1");
    setSearchBoxKey((k) => k + 1);
  }

  const columnCount = 8 + (trackItcEligibility ? 1 : 0);

  const totals = useMemo(() => {
    const lineInputs = rows
      .map(toLineItemCalcInput)
      .filter((input): input is LineItemCalcInput => input !== null);
    const parsedDiscountValue =
      discountType === "percentage"
        ? Number(discountValue || "0")
        : Math.round(Number(discountValue || "0") * 100);
    return computeDocumentTotals(
      lineInputs,
      {
        type: discountType,
        value: Number.isFinite(parsedDiscountValue) ? parsedDiscountValue : 0,
        target: discountTarget,
      },
      roundOff,
      businessState,
      placeOfSupplyState,
    );
  }, [
    rows,
    discountType,
    discountValue,
    discountTarget,
    roundOff,
    businessState,
    placeOfSupplyState,
  ]);

  const parsedTcsAmountMinor = tcsApplicable ? Math.round(Number(tcsAmountMinor || "0") * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="bg-muted/20 grid grid-cols-12 items-end gap-2 rounded-lg border p-3">
        <div className="col-span-12 sm:col-span-6">
          <label className="text-muted-foreground mb-1 block text-xs">Item name</label>
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
            usePurchasePrice={usePurchasePrice}
          />
        </div>
        <div className="col-span-6 sm:col-span-3">
          <label className="text-muted-foreground mb-1 block text-xs">Quantity</label>
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
        <p className="text-muted-foreground text-sm">
          No line items yet — search or type a name above.
        </p>
      ) : (
        <>
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
                        <p className="text-sm font-medium">{row.description}</p>
                        <input
                          type="hidden"
                          name={`lineItem__${i}__description`}
                          value={row.description}
                        />
                        <button
                          type="button"
                          onClick={() => setOpenNotes((prev) => ({ ...prev, [i]: !prev[i] }))}
                          className="text-muted-foreground hover:text-foreground mt-1 flex items-center gap-1 text-xs"
                        >
                          <MessageSquarePlus className="size-3" />
                          {row.notes || openNotes[i] ? "Note" : "Add note"}
                        </button>
                        <input
                          type="hidden"
                          name={`lineItem__${i}__productId`}
                          value={row.productId}
                        />
                        <input
                          type="hidden"
                          name={`lineItem__${i}__variantId`}
                          value={row.variantId}
                        />
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
                              update(i, {
                                discountType: e.target.value as LineItemRow["discountType"],
                              })
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
                            className="border-input size-4 rounded"
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
                        <TableCell colSpan={columnCount} className="bg-muted/20 whitespace-normal">
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
                    {row.stockTrackingEnabled ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={columnCount}
                          className="bg-accent-mint/20 whitespace-normal"
                        >
                          <div className="grid gap-2 sm:grid-cols-3">
                            <div>
                              <label className="text-muted-foreground mb-1 block text-xs">
                                Warehouse
                              </label>
                              <select
                                name={`lineItem__${i}__warehouseId`}
                                value={row.warehouseId}
                                onChange={(e) => update(i, { warehouseId: e.target.value })}
                                required
                                className={fieldClass}
                              >
                                <option value="">Select warehouse…</option>
                                {warehouses.map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {row.batchTracked ? (
                              <div>
                                <label className="text-muted-foreground mb-1 block text-xs">
                                  Batch
                                </label>
                                <select
                                  name={`lineItem__${i}__batchId`}
                                  value={row.batchId}
                                  onChange={(e) => update(i, { batchId: e.target.value })}
                                  required
                                  className={fieldClass}
                                >
                                  <option value="">Select batch…</option>
                                  {(row.availableBatches ?? []).map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <input type="hidden" name={`lineItem__${i}__batchId`} value="" />
                            )}
                            {row.serialTracked ? (
                              <div>
                                <label className="text-muted-foreground mb-1 block text-xs">
                                  Serial numbers (one per line, {row.quantity || 0} needed)
                                </label>
                                <Textarea
                                  name={`lineItem__${i}__serialNumbersText`}
                                  value={row.serialNumbersText}
                                  onChange={(e) => update(i, { serialNumbersText: e.target.value })}
                                  className="min-h-8 text-sm"
                                />
                              </div>
                            ) : (
                              <input
                                type="hidden"
                                name={`lineItem__${i}__serialNumbersText`}
                                value=""
                              />
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <tr className="hidden">
                        <td>
                          <input type="hidden" name={`lineItem__${i}__warehouseId`} value="" />
                          <input type="hidden" name={`lineItem__${i}__batchId`} value="" />
                          <input
                            type="hidden"
                            name={`lineItem__${i}__serialNumbersText`}
                            value=""
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end">
            <div className="bg-muted/20 w-full max-w-xs space-y-1.5 rounded-lg border p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>₹{minorToRupeesString(totals.subtotalMinor)}</span>
              </div>
              {totals.discountAmountMinor > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span>-₹{minorToRupeesString(totals.discountAmountMinor)}</span>
                </div>
              ) : null}
              {totals.totalIgstMinor > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IGST</span>
                  <span>₹{minorToRupeesString(totals.totalIgstMinor)}</span>
                </div>
              ) : null}
              {totals.totalCgstMinor > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CGST</span>
                  <span>₹{minorToRupeesString(totals.totalCgstMinor)}</span>
                </div>
              ) : null}
              {totals.totalSgstMinor > 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SGST</span>
                  <span>₹{minorToRupeesString(totals.totalSgstMinor)}</span>
                </div>
              ) : null}
              {totals.roundOffAmountMinor !== 0 ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Round off</span>
                  <span>
                    {totals.roundOffAmountMinor > 0 ? "+" : "-"}₹
                    {minorToRupeesString(Math.abs(totals.roundOffAmountMinor))}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between border-t pt-1.5 text-base font-semibold">
                <span>Grand total</span>
                <span>₹{minorToRupeesString(totals.grandTotalMinor)}</span>
              </div>
              {parsedTcsAmountMinor > 0 ? (
                <div className="text-muted-foreground flex justify-between pt-1 text-xs">
                  <span>TCS (collected separately)</span>
                  <span>₹{minorToRupeesString(parsedTcsAmountMinor)}</span>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
