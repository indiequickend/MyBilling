import mongoose, { Schema, type Model } from "mongoose";
import { addressSchema, type AddressSubdoc } from "@/lib/db/models/shared/address";
import { documentLineItemSchema, type DocumentLineItemDoc } from "@/lib/db/models/shared/lineItem";
import { DISCOUNT_TARGETS, type DiscountTarget } from "@/lib/constants/invoices";

export const CREDIT_NOTE_STATUSES = ["draft", "issued", "cancelled"] as const;
export type CreditNoteStatus = (typeof CREDIT_NOTE_STATUSES)[number];

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
 * A sales return: reduces what a customer owes the business, symmetric to how a Payment does
 * (see getPartyLedger's sign-convention comment in lib/db/queries/payments.ts). References the
 * original Invoice for traceability without mutating it — mirrors DebitNote's shape field-for-
 * field on the receivable side, per DebitNote.ts's own forward-looking doc comment.
 */
const creditNoteSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    customerSnapshot: { type: customerSnapshotSchema, required: true },
    linkedInvoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true, index: true },

    docNumber: { type: String, trim: true },
    seriesKey: { type: String, trim: true },

    status: { type: String, enum: CREDIT_NOTE_STATUSES, required: true, default: "draft", index: true },

    creditNoteDate: { type: Date, required: true },
    reason: { type: String, trim: true },

    // Opt-in: a credit note doesn't always represent a physical return (e.g. a price-only
    // adjustment), so stock is only restocked for product line items when this is explicitly on
    // (see lib/db/queries/creditNotes.ts). Off by default to avoid silently corrupting stock counts.
    restockItems: { type: Boolean, required: true, default: false },

    placeOfSupplyState: { type: String, required: true, trim: true },

    lineItems: {
      type: [documentLineItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "A credit note needs at least one line item",
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

creditNoteSchema.index({ businessId: 1, status: 1, creditNoteDate: -1 });
creditNoteSchema.index({ businessId: 1, customerId: 1 });
creditNoteSchema.index({ businessId: 1, linkedInvoiceId: 1 });
creditNoteSchema.index(
  { businessId: 1, docNumber: 1 },
  { unique: true, partialFilterExpression: { docNumber: { $type: "string" } } },
);

export type CreditNoteLineItemDoc = DocumentLineItemDoc;

export type CreditNoteCustomerSnapshot = {
  displayName: string;
  gstin?: string;
  billingAddress?: AddressSubdoc;
  shippingAddress?: AddressSubdoc;
};

export type CreditNoteDoc = {
  businessId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  customerSnapshot: CreditNoteCustomerSnapshot;
  linkedInvoiceId: mongoose.Types.ObjectId;
  docNumber?: string;
  seriesKey?: string;
  status: CreditNoteStatus;
  creditNoteDate: Date;
  reason?: string;
  restockItems: boolean;
  placeOfSupplyState: string;
  lineItems: CreditNoteLineItemDoc[];
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

export const CreditNote =
  (mongoose.models.CreditNote as Model<CreditNoteDoc>) ??
  mongoose.model<CreditNoteDoc>("CreditNote", creditNoteSchema);
