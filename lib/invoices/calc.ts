import { splitTax, isSameState } from "@/lib/tax/gstSplit";
import type { DiscountTarget, InvoiceStatus } from "@/lib/constants/invoices";

export type LineItemCalcInput = {
  quantity: number;
  unitPriceMinor: number;
  discountType: "amount" | "percentage";
  /** Minor units when discountType is "amount", a raw 0-100 percent when "percentage". */
  discountValue: number;
  taxRatePercent: number;
};

export type LineItemCalcResult = {
  taxableAmountMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalMinor: number;
};

/** Converts a tax-inclusive unit price to the tax-exclusive figure invoice line items store. */
export function exclusiveUnitPriceMinor(
  priceMinor: number,
  taxRatePercent: number,
  isInclusive: boolean,
): number {
  if (!isInclusive || taxRatePercent === 0) return priceMinor;
  return Math.round((priceMinor * 100) / (100 + taxRatePercent));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeLineItem(
  input: LineItemCalcInput,
  businessState: string,
  placeOfSupplyState: string,
): LineItemCalcResult {
  const grossMinor = Math.round(input.quantity * input.unitPriceMinor);
  const rawDiscountMinor =
    input.discountType === "percentage"
      ? Math.round((grossMinor * input.discountValue) / 100)
      : input.discountValue;
  const discountMinor = clamp(rawDiscountMinor, 0, grossMinor);
  const taxableAmountMinor = grossMinor - discountMinor;
  const { cgstMinor, sgstMinor, igstMinor, totalTaxMinor } = splitTax(
    taxableAmountMinor,
    input.taxRatePercent,
    businessState,
    placeOfSupplyState,
  );
  return {
    taxableAmountMinor,
    cgstMinor,
    sgstMinor,
    igstMinor,
    totalMinor: taxableAmountMinor + totalTaxMinor,
  };
}

export type InvoiceDiscount = {
  type: "amount" | "percentage";
  /** Minor units when type is "amount", a raw 0-100 percent when "percentage". */
  value: number;
  target: DiscountTarget;
};

export type InvoiceTotals = {
  subtotalMinor: number;
  totalTaxMinor: number;
  totalCgstMinor: number;
  totalSgstMinor: number;
  totalIgstMinor: number;
  discountAmountMinor: number;
  roundOff: boolean;
  roundOffAmountMinor: number;
  grandTotalMinor: number;
  /** Per-line results, same order as the input — pre-document-discount, for storage on each line item. */
  lineItems: LineItemCalcResult[];
};

/**
 * The four discount targets in project_spec.md collapse to two computational bases:
 * "unit_price"/"net_amount" both discount the pre-tax subtotal (tax is then recomputed
 * proportionally on the reduced base, since GST tax follows taxable value); "price_with_tax"/
 * "total" both discount the final tax-inclusive figure (a post-tax settlement-style reduction
 * that leaves the GST liability itself unchanged). Round-off, when enabled, rounds the final
 * grand total to the nearest whole rupee, applied last.
 */
export function computeInvoiceTotals(
  lineItems: LineItemCalcInput[],
  discount: InvoiceDiscount,
  roundOff: boolean,
  businessState: string,
  placeOfSupplyState: string,
): InvoiceTotals {
  const computedLines = lineItems.map((item) => computeLineItem(item, businessState, placeOfSupplyState));

  const subtotalMinor = computedLines.reduce((sum, l) => sum + l.taxableAmountMinor, 0);
  const totalCgstMinor = computedLines.reduce((sum, l) => sum + l.cgstMinor, 0);
  const totalSgstMinor = computedLines.reduce((sum, l) => sum + l.sgstMinor, 0);
  const totalIgstMinor = computedLines.reduce((sum, l) => sum + l.igstMinor, 0);
  const totalTaxMinor = totalCgstMinor + totalSgstMinor + totalIgstMinor;

  const isPreTaxTarget: (target: DiscountTarget) => boolean = (target) =>
    target === "unit_price" || target === "net_amount";
  const discountBaseMinor = isPreTaxTarget(discount.target) ? subtotalMinor : subtotalMinor + totalTaxMinor;
  const rawDiscountAmountMinor =
    discount.type === "percentage" ? Math.round((discountBaseMinor * discount.value) / 100) : discount.value;
  const discountAmountMinor = clamp(rawDiscountAmountMinor, 0, discountBaseMinor);

  let finalTotalTaxMinor = totalTaxMinor;
  let finalCgstMinor = totalCgstMinor;
  let finalSgstMinor = totalSgstMinor;
  let finalIgstMinor = totalIgstMinor;
  let preRoundGrandTotal: number;

  if (isPreTaxTarget(discount.target)) {
    const netSubtotalMinor = subtotalMinor - discountAmountMinor;
    const scale = subtotalMinor > 0 ? netSubtotalMinor / subtotalMinor : 0;
    finalTotalTaxMinor = Math.round(totalTaxMinor * scale);
    if (isSameState(businessState, placeOfSupplyState)) {
      finalCgstMinor = Math.round(finalTotalTaxMinor / 2);
      finalSgstMinor = finalTotalTaxMinor - finalCgstMinor;
      finalIgstMinor = 0;
    } else {
      finalCgstMinor = 0;
      finalSgstMinor = 0;
      finalIgstMinor = finalTotalTaxMinor;
    }
    preRoundGrandTotal = netSubtotalMinor + finalTotalTaxMinor;
  } else {
    preRoundGrandTotal = subtotalMinor + totalTaxMinor - discountAmountMinor;
  }

  const roundedGrandTotal = roundOff ? Math.round(preRoundGrandTotal / 100) * 100 : preRoundGrandTotal;
  const roundOffAmountMinor = roundedGrandTotal - preRoundGrandTotal;

  return {
    subtotalMinor,
    totalTaxMinor: finalTotalTaxMinor,
    totalCgstMinor: finalCgstMinor,
    totalSgstMinor: finalSgstMinor,
    totalIgstMinor: finalIgstMinor,
    discountAmountMinor,
    roundOff,
    roundOffAmountMinor,
    grandTotalMinor: roundedGrandTotal,
    lineItems: computedLines,
  };
}

/** Never returns "draft" or "cancelled" — those are explicit status transitions, not derived from amounts. */
export function deriveInvoiceStatus(grandTotalMinor: number, amountPaidMinor: number): InvoiceStatus {
  if (amountPaidMinor <= 0) return "pending";
  if (amountPaidMinor >= grandTotalMinor) return "paid";
  return "partially_paid";
}
