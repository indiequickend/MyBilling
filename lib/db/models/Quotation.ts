import mongoose, { Schema, type Model } from "mongoose";
import { addressSchema, type AddressSubdoc } from "@/lib/db/models/shared/address";
import { documentLineItemSchema, type DocumentLineItemDoc } from "@/lib/db/models/shared/lineItem";
import { DISCOUNT_TARGETS, type DiscountTarget } from "@/lib/constants/invoices";

// "partial" means partially converted (multiple documents raised against one quotation) — the
// enum value is kept because build_phases.md names it explicitly, but no code produces it yet:
// conversion in this phase is one-shot/full-amount, moving a quotation straight to "closed".
export const QUOTATION_STATUSES = ["draft", "open", "partial", "closed", "cancelled"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

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
 * A pre-sale document, not a billed one — no payments, no amountPaidMinor. Same header/line-item
 * shape as PurchaseOrder, customer-side. "closed" means converted into an Invoice or Sales Order
 * (see markQuotationClosed in lib/db/queries/quotations.ts).
 */
const quotationSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    customerSnapshot: { type: customerSnapshotSchema, required: true },

    // Absent while status is "draft" — a document number is reserved only on finalize.
    docNumber: { type: String, trim: true },
    seriesKey: { type: String, trim: true },

    status: { type: String, enum: QUOTATION_STATUSES, required: true, default: "draft", index: true },

    quotationDate: { type: Date, required: true },
    validUntil: { type: Date },
    referenceNumber: { type: String, trim: true },

    placeOfSupplyState: { type: String, required: true, trim: true },
    reverseCharge: { type: Boolean, required: true, default: false },

    lineItems: {
      type: [documentLineItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "A quotation needs at least one line item",
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

quotationSchema.index({ businessId: 1, status: 1, quotationDate: -1 });
quotationSchema.index({ businessId: 1, customerId: 1 });
quotationSchema.index(
  { businessId: 1, docNumber: 1 },
  { unique: true, partialFilterExpression: { docNumber: { $type: "string" } } },
);

export type QuotationLineItemDoc = DocumentLineItemDoc;

export type QuotationCustomerSnapshot = {
  displayName: string;
  gstin?: string;
  billingAddress?: AddressSubdoc;
  shippingAddress?: AddressSubdoc;
};

export type QuotationDoc = {
  businessId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  customerSnapshot: QuotationCustomerSnapshot;
  docNumber?: string;
  seriesKey?: string;
  status: QuotationStatus;
  quotationDate: Date;
  validUntil?: Date;
  referenceNumber?: string;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  lineItems: QuotationLineItemDoc[];
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

export const Quotation =
  (mongoose.models.Quotation as Model<QuotationDoc>) ??
  mongoose.model<QuotationDoc>("Quotation", quotationSchema);
