import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { DOCUMENT_TYPES } from "@/lib/constants/documentTypes";

export const STOCK_LEDGER_REASONS = [
  "opening_stock",
  "manual_in",
  "manual_out",
  "invoice",
  "credit_note",
  "purchase",
  "debit_note",
  "invoice_cancelled",
  "purchase_cancelled",
] as const;
export type StockLedgerReason = (typeof STOCK_LEDGER_REASONS)[number];

/**
 * The single source of truth for stock: current on-hand balance for any (productId, variantId,
 * batchId, warehouseId) scope is derived by reading the most recent entry for that exact scope
 * (see lib/db/queries/stockLedger.ts's getCurrentBalance), not cached elsewhere. Every entry
 * snapshots the resulting balance so a "Timeline" view never has to re-sum history to render.
 */
const stockLedgerEntrySchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    // No ref — variants/batches are Product subdocuments, dereferenced by loading the product
    // (same convention as Product.variants/batches themselves).
    variantId: { type: Schema.Types.ObjectId },
    batchId: { type: Schema.Types.ObjectId },
    warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true, index: true },

    direction: { type: String, enum: ["in", "out"], required: true },
    // Magnitude only — direction carries the sign, so quantity is always positive.
    quantity: { type: Number, required: true, min: 0 },
    // Resulting on-hand quantity for this exact (productId, variantId, batchId, warehouseId)
    // scope after this entry — never negative (enforced in the query layer).
    balanceAfter: { type: Number, required: true },

    // Serial-tracked products only; length must equal `quantity`.
    serialNumbers: { type: [String], default: undefined },

    reason: { type: String, enum: STOCK_LEDGER_REASONS, required: true },
    // Required (by the query layer) for manual_in/manual_out; optional free text otherwise.
    note: { type: String, trim: true },

    // Set only for automatic entries written alongside a document (invoice/purchase/credit_note/
    // debit_note/cancellation reversal) — absent for manual Stock In/Out adjustments.
    refDocumentType: { type: String, enum: DOCUMENT_TYPES },
    refDocumentId: { type: Schema.Types.ObjectId }, // polymorphic — no ref
    refDocumentNumber: { type: String, trim: true }, // snapshot for display without a join

    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

// "Current balance" lookup: findOne({...scope}).sort({createdAt: -1}).
stockLedgerEntrySchema.index({
  businessId: 1,
  productId: 1,
  variantId: 1,
  batchId: 1,
  warehouseId: 1,
  createdAt: -1,
});
// Timeline view, filterable by product/warehouse within a business.
stockLedgerEntrySchema.index({ businessId: 1, createdAt: -1 });
stockLedgerEntrySchema.index({ businessId: 1, warehouseId: 1, createdAt: -1 });
// "Jump to ledger entries from this document" traceability.
stockLedgerEntrySchema.index({ businessId: 1, refDocumentType: 1, refDocumentId: 1 });

export type StockLedgerEntryDoc = InferSchemaType<typeof stockLedgerEntrySchema>;

export const StockLedgerEntry =
  (mongoose.models.StockLedgerEntry as Model<StockLedgerEntryDoc>) ??
  mongoose.model<StockLedgerEntryDoc>("StockLedgerEntry", stockLedgerEntrySchema);
