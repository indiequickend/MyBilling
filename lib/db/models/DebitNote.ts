import mongoose, { Schema, type Model } from "mongoose";
import { addressSchema, type AddressSubdoc } from "@/lib/db/models/shared/address";
import { documentLineItemSchema, type DocumentLineItemDoc } from "@/lib/db/models/shared/lineItem";
import { DISCOUNT_TARGETS, type DiscountTarget } from "@/lib/constants/invoices";

export const DEBIT_NOTE_STATUSES = ["draft", "issued", "cancelled"] as const;
export type DebitNoteStatus = (typeof DEBIT_NOTE_STATUSES)[number];

const vendorSnapshotSchema = new Schema(
  {
    displayName: { type: String, required: true, trim: true },
    gstin: { type: String, trim: true },
    billingAddress: { type: addressSchema, default: undefined },
    shippingAddress: { type: addressSchema, default: undefined },
  },
  { _id: false },
);

/**
 * A purchase return: reduces what the business owes a vendor, symmetric to how a Payment does
 * (see getPartyLedger's sign-convention comment in lib/db/queries/payments.ts). References the
 * original Purchase for traceability without mutating it — Credit Notes (Phase 5) will mirror
 * this same shape on the receivable side once they exist.
 */
const debitNoteSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
    vendorSnapshot: { type: vendorSnapshotSchema, required: true },
    linkedPurchaseId: { type: Schema.Types.ObjectId, ref: "Purchase", required: true, index: true },

    docNumber: { type: String, trim: true },
    seriesKey: { type: String, trim: true },

    status: { type: String, enum: DEBIT_NOTE_STATUSES, required: true, default: "draft", index: true },

    debitNoteDate: { type: Date, required: true },
    reason: { type: String, trim: true },

    // Opt-in: a debit note doesn't always represent a physical return to the vendor (e.g. a
    // price-only adjustment), so stock is only removed for product line items when this is
    // explicitly on (see lib/db/queries/debitNotes.ts). Off by default.
    restockItems: { type: Boolean, required: true, default: false },

    placeOfSupplyState: { type: String, required: true, trim: true },

    lineItems: {
      type: [documentLineItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "A debit note needs at least one line item",
      },
    },

    discountType: { type: String, enum: ["amount", "percentage"], required: true, default: "percentage" },
    discountValue: { type: Number, required: true, default: 0 },
    discountTarget: { type: String, enum: DISCOUNT_TARGETS, required: true, default: "total" },
    discountAmountMinor: { type: Number, required: true, default: 0 },

    roundOff: { type: Boolean, required: true, default: true },
    roundOffAmountMinor: { type: Number, required: true, default: 0 },

    subtotalMinor: { type: Number, required: true },
    totalTaxMinor: { type: Number, required: true },
    totalCgstMinor: { type: Number, required: true, default: 0 },
    totalSgstMinor: { type: Number, required: true, default: 0 },
    totalIgstMinor: { type: Number, required: true, default: 0 },
    grandTotalMinor: { type: Number, required: true },

    attachmentIds: { type: [Schema.Types.ObjectId], ref: "Attachment", default: [] },

    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

debitNoteSchema.index({ businessId: 1, status: 1, debitNoteDate: -1 });
debitNoteSchema.index({ businessId: 1, vendorId: 1 });
debitNoteSchema.index({ businessId: 1, linkedPurchaseId: 1 });
debitNoteSchema.index(
  { businessId: 1, docNumber: 1 },
  { unique: true, partialFilterExpression: { docNumber: { $type: "string" } } },
);

export type DebitNoteLineItemDoc = DocumentLineItemDoc;

export type DebitNoteVendorSnapshot = {
  displayName: string;
  gstin?: string;
  billingAddress?: AddressSubdoc;
  shippingAddress?: AddressSubdoc;
};

export type DebitNoteDoc = {
  businessId: mongoose.Types.ObjectId;
  vendorId: mongoose.Types.ObjectId;
  vendorSnapshot: DebitNoteVendorSnapshot;
  linkedPurchaseId: mongoose.Types.ObjectId;
  docNumber?: string;
  seriesKey?: string;
  status: DebitNoteStatus;
  debitNoteDate: Date;
  reason?: string;
  restockItems: boolean;
  placeOfSupplyState: string;
  lineItems: DebitNoteLineItemDoc[];
  discountType: "amount" | "percentage";
  discountValue: number;
  discountTarget: DiscountTarget;
  discountAmountMinor: number;
  roundOff: boolean;
  roundOffAmountMinor: number;
  subtotalMinor: number;
  totalTaxMinor: number;
  totalCgstMinor: number;
  totalSgstMinor: number;
  totalIgstMinor: number;
  grandTotalMinor: number;
  attachmentIds: mongoose.Types.ObjectId[];
  createdByUserId: mongoose.Types.ObjectId;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const DebitNote =
  (mongoose.models.DebitNote as Model<DebitNoteDoc>) ??
  mongoose.model<DebitNoteDoc>("DebitNote", debitNoteSchema);
