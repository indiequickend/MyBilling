import mongoose, { Schema, type Model } from "mongoose";
import { addressSchema, type AddressSubdoc } from "@/lib/db/models/shared/address";
import { documentLineItemSchema, type DocumentLineItemDoc } from "@/lib/db/models/shared/lineItem";
import { DISCOUNT_TARGETS, type DiscountTarget } from "@/lib/constants/invoices";

export const PURCHASE_ORDER_STATUSES = ["draft", "open", "closed", "cancelled"] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

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
 * A pre-purchase commitment document, not a billed one — no payments, no amountPaidMinor. Same
 * header/line-item shape as Purchase; see lib/db/queries/purchaseOrders.ts. "closed" means
 * converted into a Purchase (see markPurchaseOrderClosed).
 */
const purchaseOrderSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
    vendorSnapshot: { type: vendorSnapshotSchema, required: true },

    // Absent while status is "draft" — a document number is reserved only on finalize.
    docNumber: { type: String, trim: true },
    seriesKey: { type: String, trim: true },

    status: { type: String, enum: PURCHASE_ORDER_STATUSES, required: true, default: "draft", index: true },

    orderDate: { type: Date, required: true },
    expectedDeliveryDate: { type: Date },
    referenceNumber: { type: String, trim: true },

    placeOfSupplyState: { type: String, required: true, trim: true },
    reverseCharge: { type: Boolean, required: true, default: false },

    lineItems: {
      type: [documentLineItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "A purchase order needs at least one line item",
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

    customFieldValues: { type: Schema.Types.Mixed, default: {} },

    notes: { type: String, trim: true },
    terms: { type: String, trim: true },
    noteTemplateId: { type: Schema.Types.ObjectId, ref: "NoteTermTemplate" },
    termTemplateId: { type: Schema.Types.ObjectId, ref: "NoteTermTemplate" },
    attachmentIds: { type: [Schema.Types.ObjectId], ref: "Attachment", default: [] },

    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

purchaseOrderSchema.index({ businessId: 1, status: 1, orderDate: -1 });
purchaseOrderSchema.index({ businessId: 1, vendorId: 1 });
purchaseOrderSchema.index(
  { businessId: 1, docNumber: 1 },
  { unique: true, partialFilterExpression: { docNumber: { $type: "string" } } },
);

export type PurchaseOrderLineItemDoc = DocumentLineItemDoc;

export type PurchaseOrderVendorSnapshot = {
  displayName: string;
  gstin?: string;
  billingAddress?: AddressSubdoc;
  shippingAddress?: AddressSubdoc;
};

export type PurchaseOrderDoc = {
  businessId: mongoose.Types.ObjectId;
  vendorId: mongoose.Types.ObjectId;
  vendorSnapshot: PurchaseOrderVendorSnapshot;
  docNumber?: string;
  seriesKey?: string;
  status: PurchaseOrderStatus;
  orderDate: Date;
  expectedDeliveryDate?: Date;
  referenceNumber?: string;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  lineItems: PurchaseOrderLineItemDoc[];
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
  customFieldValues: Record<string, unknown>;
  notes?: string;
  terms?: string;
  noteTemplateId?: mongoose.Types.ObjectId;
  termTemplateId?: mongoose.Types.ObjectId;
  attachmentIds: mongoose.Types.ObjectId[];
  createdByUserId: mongoose.Types.ObjectId;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const PurchaseOrder =
  (mongoose.models.PurchaseOrder as Model<PurchaseOrderDoc>) ??
  mongoose.model<PurchaseOrderDoc>("PurchaseOrder", purchaseOrderSchema);
