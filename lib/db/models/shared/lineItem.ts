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
  hsnOrSac: { type: String, trim: true },
  unit: { type: String, trim: true, default: "PCS" },
  quantity: { type: Number, required: true, min: 0 },
  unitPriceMinor: { type: Number, required: true },
  discountType: { type: String, enum: ["amount", "percentage"], required: true, default: "percentage" },
  // Minor units (paise) when discountType is "amount"; a raw 0-100 percent when "percentage" —
  // see lib/invoices/calc.ts for the shared interpretation.
  discountValue: { type: Number, required: true, default: 0 },
  taxRatePercent: { type: Number, required: true, default: 0 },
  cgstMinor: { type: Number, required: true, default: 0 },
  sgstMinor: { type: Number, required: true, default: 0 },
  igstMinor: { type: Number, required: true, default: 0 },
  taxableAmountMinor: { type: Number, required: true },
  totalMinor: { type: Number, required: true },
});

export type DocumentLineItemDoc = InferSchemaType<typeof documentLineItemSchema>;
