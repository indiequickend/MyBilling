import mongoose, { Schema, type Model } from "mongoose";
import { addressSchema, type AddressSubdoc } from "@/lib/db/models/shared/address";
import { documentLineItemSchema, type DocumentLineItemDoc } from "@/lib/db/models/shared/lineItem";
import { DISCOUNT_TARGETS, type DiscountTarget } from "@/lib/constants/invoices";

export const SALES_ORDER_STATUSES = ["draft", "open", "closed", "cancelled"] as const;
export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

const customerSnapshotSchema = new Schema(
  {
    displayName: { type: String, required: true, trim: true },
    gstin: { type: String, trim: true },
    billingAddress: { type: addressSchema, default: undefined },
    shippingAddress: { type: addressSchema, default: undefined },
  },
  { _id: false },
);

/**
 * A confirmed-order document sitting between Quotation and Invoice — no payments, no
 * amountPaidMinor. Same header/line-item shape as Quotation/PurchaseOrder. "closed" means
 * converted into an Invoice (see markSalesOrderClosed in lib/db/queries/salesOrders.ts).
 */
const salesOrderSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    customerSnapshot: { type: customerSnapshotSchema, required: true },
    // Set only when this Sales Order was created via "Convert to Sales Order" from a Quotation —
    // traceability only, mirrors Purchase.sourcePurchaseOrderId.
    sourceQuotationId: { type: Schema.Types.ObjectId, ref: "Quotation" },

    docNumber: { type: String, trim: true },
    seriesKey: { type: String, trim: true },

    status: { type: String, enum: SALES_ORDER_STATUSES, required: true, default: "draft", index: true },

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
        message: "A sales order needs at least one line item",
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

salesOrderSchema.index({ businessId: 1, status: 1, orderDate: -1 });
salesOrderSchema.index({ businessId: 1, customerId: 1 });
salesOrderSchema.index(
  { businessId: 1, docNumber: 1 },
  { unique: true, partialFilterExpression: { docNumber: { $type: "string" } } },
);

export type SalesOrderLineItemDoc = DocumentLineItemDoc;

export type SalesOrderCustomerSnapshot = {
  displayName: string;
  gstin?: string;
  billingAddress?: AddressSubdoc;
  shippingAddress?: AddressSubdoc;
};

export type SalesOrderDoc = {
  businessId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  customerSnapshot: SalesOrderCustomerSnapshot;
  sourceQuotationId?: mongoose.Types.ObjectId;
  docNumber?: string;
  seriesKey?: string;
  status: SalesOrderStatus;
  orderDate: Date;
  expectedDeliveryDate?: Date;
  referenceNumber?: string;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  lineItems: SalesOrderLineItemDoc[];
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

export const SalesOrder =
  (mongoose.models.SalesOrder as Model<SalesOrderDoc>) ??
  mongoose.model<SalesOrderDoc>("SalesOrder", salesOrderSchema);
