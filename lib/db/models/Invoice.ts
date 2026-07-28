import mongoose, { Schema, type Model } from "mongoose";
import { addressSchema, type AddressSubdoc } from "@/lib/db/models/shared/address";
import { documentLineItemSchema, type DocumentLineItemDoc } from "@/lib/db/models/shared/lineItem";
import { INVOICE_STATUSES, DISCOUNT_TARGETS, type InvoiceStatus, type DiscountTarget } from "@/lib/constants/invoices";

export type { InvoiceStatus, DiscountTarget };

const customerSnapshotSchema = new Schema(
  {
    displayName: { type: String, required: true, trim: true },
    gstin: { type: String, trim: true },
    billingAddress: { type: addressSchema, default: undefined },
    shippingAddress: { type: addressSchema, default: undefined },
  },
  { _id: false },
);

const invoiceSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    // Snapshotted at save time — an invoice's printed party details must not silently change if
    // the Customer record is edited afterward.
    customerSnapshot: { type: customerSnapshotSchema, required: true },

    // Absent while status is "draft" — a document number is reserved only on finalize (see
    // lib/db/queries/invoices.ts), so abandoned drafts never burn a legal invoice number.
    docNumber: { type: String, trim: true },
    seriesKey: { type: String, trim: true },

    status: { type: String, enum: INVOICE_STATUSES, required: true, default: "draft", index: true },

    invoiceDate: { type: Date, required: true },
    dueDate: { type: Date },
    referenceNumber: { type: String, trim: true },

    placeOfSupplyState: { type: String, required: true, trim: true },
    reverseCharge: { type: Boolean, required: true, default: false },
    eWayBillFlag: { type: Boolean, required: true, default: false },
    eInvoiceFlag: { type: Boolean, required: true, default: false },

    lineItems: {
      type: [documentLineItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "An invoice needs at least one line item",
      },
    },

    discountType: { type: String, enum: ["amount", "percentage"], required: true, default: "percentage" },
    // Minor units (paise) when discountType is "amount"; a raw 0-100 percent when "percentage" —
    // see lib/invoices/calc.ts for the shared interpretation.
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
    // invoice (see recordInvoicePayment) — never written from anywhere else.
    amountPaidMinor: { type: Number, required: true, default: 0 },

    // Per-document values for this business's per-docType custom header field defs (see
    // Business.documentCustomFieldDefs) — independent per invoice, unlike Business's own single
    // customFieldValues bag.
    customFieldValues: { type: Schema.Types.Mixed, default: {} },

    notes: { type: String, trim: true },
    terms: { type: String, trim: true },
    noteTemplateId: { type: Schema.Types.ObjectId, ref: "NoteTermTemplate" },
    termTemplateId: { type: Schema.Types.ObjectId, ref: "NoteTermTemplate" },
    signatureId: { type: Schema.Types.ObjectId, ref: "Signature" },
    bankAccountId: { type: Schema.Types.ObjectId, ref: "BankAccount" },
    attachmentIds: { type: [Schema.Types.ObjectId], ref: "Attachment", default: [] },

    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

invoiceSchema.index({ businessId: 1, status: 1, invoiceDate: -1 });
invoiceSchema.index({ businessId: 1, customerId: 1 });
// Defense-in-depth on top of the transactional counter in documentSequences.ts — only applies
// once a docNumber is actually assigned (drafts have none).
invoiceSchema.index(
  { businessId: 1, docNumber: 1 },
  { unique: true, partialFilterExpression: { docNumber: { $type: "string" } } },
);

export type InvoiceLineItemDoc = DocumentLineItemDoc;

export type InvoiceCustomerSnapshot = {
  displayName: string;
  gstin?: string;
  billingAddress?: AddressSubdoc;
  shippingAddress?: AddressSubdoc;
};

export type InvoiceDoc = {
  businessId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  customerSnapshot: InvoiceCustomerSnapshot;
  docNumber?: string;
  seriesKey?: string;
  status: InvoiceStatus;
  invoiceDate: Date;
  dueDate?: Date;
  referenceNumber?: string;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  eWayBillFlag: boolean;
  eInvoiceFlag: boolean;
  lineItems: InvoiceLineItemDoc[];
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
  signatureId?: mongoose.Types.ObjectId;
  bankAccountId?: mongoose.Types.ObjectId;
  attachmentIds: mongoose.Types.ObjectId[];
  createdByUserId: mongoose.Types.ObjectId;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const Invoice =
  (mongoose.models.Invoice as Model<InvoiceDoc>) ?? mongoose.model<InvoiceDoc>("Invoice", invoiceSchema);
