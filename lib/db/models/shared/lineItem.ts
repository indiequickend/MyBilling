import { Schema, type InferSchemaType } from "mongoose";

/**
 * Reused by Invoice now; Purchases/Quotations/Sales Orders/Proforma Invoices/Credit & Debit
 * Notes in later phases mirror this same shape (see shared/address.ts for the established
 * shared-subschema convention). Every priced field is a snapshot taken at save time — an
 * invoice must never change retroactively just because the underlying Product's price or tax
 * rate changes later. `productId`/`variantId` are kept only as back-references for reporting.
 * Real subdoc (default `_id: true`) since dynamic-row form editors need a stable id per line
 * across edits, matching Product.variants' precedent.
 */
export const documentLineItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: "Product" },
  variantId: { type: Schema.Types.ObjectId },
  description: { type: String, required: true, trim: true },
  /** Free-text detail shown per line item on the document/PDF — e.g. booking check-in/out dates. */
  notes: { type: String, trim: true },
  hsnOrSac: { type: String, trim: true },
  unit: { type: String, trim: true, default: "PCS" },
  quantity: { type: Number, required: true, min: 0 },
  unitPriceMinor: { type: Number, required: true },
  discountType: { type: String, enum: ["amount", "percentage"], required: true, default: "percentage" },
  // Minor units (paise) when discountType is "amount"; a raw 0-100 percent when "percentage" —
  // see lib/documents/calc.ts for the shared interpretation.
  discountValue: { type: Number, required: true, default: 0 },
  taxRatePercent: { type: Number, required: true, default: 0 },
  cgstMinor: { type: Number, required: true, default: 0 },
  sgstMinor: { type: Number, required: true, default: 0 },
  igstMinor: { type: Number, required: true, default: 0 },
  taxableAmountMinor: { type: Number, required: true },
  totalMinor: { type: Number, required: true },
  // Only meaningful on Purchase line items, and only shown/editable in the UI when the business's
  // trackItcEligibility preference is on (see Business.preferences.document.purchases); Invoice
  // lines simply never read it. Defaults true so a line is ITC-eligible unless marked otherwise.
  itcEligible: { type: Boolean, required: true, default: true },
});

export type DocumentLineItemDoc = InferSchemaType<typeof documentLineItemSchema>;
