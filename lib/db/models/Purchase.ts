import mongoose, { Schema, type Model } from "mongoose";
import { addressSchema, type AddressSubdoc } from "@/lib/db/models/shared/address";
import { documentLineItemSchema, type DocumentLineItemDoc } from "@/lib/db/models/shared/lineItem";
import { DOCUMENT_STATUSES, type DocumentStatus } from "@/lib/constants/documents";
import { DISCOUNT_TARGETS, type DiscountTarget } from "@/lib/constants/invoices";

export type { DocumentStatus as PurchaseStatus, DiscountTarget };

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
 * Mirrors Invoice.ts (vendor-side instead of customer-side); see lib/db/queries/purchases.ts.
 * No signatureId/QR — project_spec.md excludes customer-facing print concerns from Purchases.
 */
const purchaseSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
    // Snapshotted at save time — a purchase's printed party details must not silently change if
    // the Vendor record is edited afterward.
    vendorSnapshot: { type: vendorSnapshotSchema, required: true },

    // Absent while status is "draft" — a document number is reserved only on finalize (see
    // lib/db/queries/purchases.ts), so abandoned drafts never burn a legal purchase number.
    docNumber: { type: String, trim: true },
    seriesKey: { type: String, trim: true },

    status: { type: String, enum: DOCUMENT_STATUSES, required: true, default: "draft", index: true },

    purchaseDate: { type: Date, required: true },
    dueDate: { type: Date },
    referenceNumber: { type: String, trim: true },
    vendorInvoiceNumber: { type: String, trim: true },

    placeOfSupplyState: { type: String, required: true, trim: true },
    reverseCharge: { type: Boolean, required: true, default: false },

    // Set on the created Purchase when it originates from converting a Purchase Order (see
    // lib/db/queries/purchaseOrders.ts) — traceability only, never required.
    sourcePurchaseOrderId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder" },

    lineItems: {
      type: [documentLineItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "A purchase needs at least one line item",
      },
    },

    discountType: { type: String, enum: ["amount", "percentage"], required: true, default: "percentage" },
    // Minor units (paise) when discountType is "amount"; a raw 0-100 percent when "percentage" —
    // see lib/documents/calc.ts for the shared interpretation.
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
    // Cached, kept in sync only inside the same transaction that writes a Payment against this
    // purchase (see recordPurchasePayment) — never written from anywhere else.
    amountPaidMinor: { type: Number, required: true, default: 0 },

    // Per-document values for this business's per-docType custom header field defs (see
    // Business.documentCustomFieldDefs) — independent per purchase, unlike Business's own single
    // customFieldValues bag.
    customFieldValues: { type: Schema.Types.Mixed, default: {} },

    notes: { type: String, trim: true },
    terms: { type: String, trim: true },
    noteTemplateId: { type: Schema.Types.ObjectId, ref: "NoteTermTemplate" },
    termTemplateId: { type: Schema.Types.ObjectId, ref: "NoteTermTemplate" },
    bankAccountId: { type: Schema.Types.ObjectId, ref: "BankAccount" },
    attachmentIds: { type: [Schema.Types.ObjectId], ref: "Attachment", default: [] },

    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

purchaseSchema.index({ businessId: 1, status: 1, purchaseDate: -1 });
purchaseSchema.index({ businessId: 1, vendorId: 1 });
// Defense-in-depth on top of the transactional counter in documentSequences.ts — only applies
// once a docNumber is actually assigned (drafts have none).
purchaseSchema.index(
  { businessId: 1, docNumber: 1 },
  { unique: true, partialFilterExpression: { docNumber: { $type: "string" } } },
);

export type PurchaseLineItemDoc = DocumentLineItemDoc;

export type PurchaseVendorSnapshot = {
  displayName: string;
  gstin?: string;
  billingAddress?: AddressSubdoc;
  shippingAddress?: AddressSubdoc;
};

export type PurchaseDoc = {
  businessId: mongoose.Types.ObjectId;
  vendorId: mongoose.Types.ObjectId;
  vendorSnapshot: PurchaseVendorSnapshot;
  docNumber?: string;
  seriesKey?: string;
  status: DocumentStatus;
  purchaseDate: Date;
  dueDate?: Date;
  referenceNumber?: string;
  vendorInvoiceNumber?: string;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  sourcePurchaseOrderId?: mongoose.Types.ObjectId;
  lineItems: PurchaseLineItemDoc[];
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
  amountPaidMinor: number;
  customFieldValues: Record<string, unknown>;
  notes?: string;
  terms?: string;
  noteTemplateId?: mongoose.Types.ObjectId;
  termTemplateId?: mongoose.Types.ObjectId;
  bankAccountId?: mongoose.Types.ObjectId;
  attachmentIds: mongoose.Types.ObjectId[];
  createdByUserId: mongoose.Types.ObjectId;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const Purchase =
  (mongoose.models.Purchase as Model<PurchaseDoc>) ??
  mongoose.model<PurchaseDoc>("Purchase", purchaseSchema);
