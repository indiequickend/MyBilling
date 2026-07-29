import type { Types } from "mongoose";
import { minorToRupeesString } from "@/lib/utils/money";
import type { LineItemRow } from "@/components/documents/LineItemsEditor";
import type { DiscountTarget } from "@/lib/constants/invoices";

/**
 * Pure, no-I/O helpers shared by every "convert this document into another type" pre-fill page
 * (Quotation -> Invoice, Quotation -> Sales Order, Sales Order -> Invoice, Purchase Order ->
 * Purchase). Conversion in this app is a UI pre-fill, not a persisted clone: the target's own
 * `new/page.tsx` reads the source document server-side, calls these helpers to build the create
 * form's `defaultValues`, and the user can still edit everything before saving — the actual
 * create still goes through the target's normal createX/finalizeXDraft path so numbering stays
 * correct. Once the target document is saved, the caller's save action marks the source closed
 * (markQuotationClosed/markSalesOrderClosed/markPurchaseOrderClosed).
 */

type ConvertibleLineItem = {
  productId?: Types.ObjectId | null;
  variantId?: Types.ObjectId | null;
  description: string;
  notes?: string | null;
  hsnOrSac?: string | null;
  unit?: string | null;
  quantity: number;
  unitPriceMinor: number;
  discountType: "amount" | "percentage";
  discountValue: number;
  taxRatePercent: number;
};

/** Strips computed tax/total fields from a source document's line items and reshapes them into
 * the rupee-string row shape every LineItemsEditor-backed form expects. */
export function mapLineItemsForConversion(lineItems: ConvertibleLineItem[]): LineItemRow[] {
  return lineItems.map((li) => ({
    productId: li.productId ? String(li.productId) : "",
    variantId: li.variantId ? String(li.variantId) : "",
    description: li.description,
    notes: li.notes ?? "",
    hsnOrSac: li.hsnOrSac ?? "",
    unit: li.unit ?? "PCS",
    quantity: String(li.quantity),
    unitPriceMinor: minorToRupeesString(li.unitPriceMinor),
    discountType: li.discountType,
    discountValue:
      li.discountType === "percentage" ? String(li.discountValue) : minorToRupeesString(li.discountValue),
    taxRatePercent: String(li.taxRatePercent),
    itcEligible: true,
  }));
}

type ConvertibleHeaderSource = {
  discountType: "amount" | "percentage";
  discountValue: number;
  discountTarget: DiscountTarget;
  roundOff: boolean;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  notes?: string;
  terms?: string;
  noteTemplateId?: Types.ObjectId;
  termTemplateId?: Types.ObjectId;
  customFieldValues?: Record<string, unknown>;
  referenceNumber?: string;
};

export type ConvertibleHeaderFields = {
  discountType: "amount" | "percentage";
  discountValue: string;
  discountTarget: DiscountTarget;
  roundOff: boolean;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  notes: string;
  terms: string;
  noteTemplateId?: string;
  termTemplateId?: string;
  customFieldValues: Record<string, unknown>;
  referenceNumber: string;
};

/** Pulls the header subset every document type has in common — the part of a form's
 * `defaultValues` that's identical in shape across every conversion pair. Callers still fill in
 * the party/date/other target-specific fields themselves. */
export function extractConvertibleHeader(source: ConvertibleHeaderSource): ConvertibleHeaderFields {
  return {
    discountType: source.discountType,
    discountValue:
      source.discountType === "percentage" ? String(source.discountValue) : minorToRupeesString(source.discountValue),
    discountTarget: source.discountTarget,
    roundOff: source.roundOff,
    placeOfSupplyState: source.placeOfSupplyState,
    reverseCharge: source.reverseCharge,
    notes: source.notes ?? "",
    terms: source.terms ?? "",
    noteTemplateId: source.noteTemplateId ? String(source.noteTemplateId) : undefined,
    termTemplateId: source.termTemplateId ? String(source.termTemplateId) : undefined,
    customFieldValues: source.customFieldValues ?? {},
    referenceNumber: source.referenceNumber ?? "",
  };
}
