import mongoose, { Schema, type Model } from "mongoose";
import { addressSchema, type AddressSubdoc } from "@/lib/db/models/shared/address";
import { documentLineItemSchema, type DocumentLineItemDoc } from "@/lib/db/models/shared/lineItem";
import { DISCOUNT_TARGETS, type DiscountTarget } from "@/lib/constants/invoices";

export const PROFORMA_INVOICE_STATUSES = ["draft", "open", "cancelled"] as const;
export type ProformaInvoiceStatus = (typeof PROFORMA_INVOICE_STATUSES)[number];

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
 * A non-legal preview invoice — same header/line-item/custom-field/signature/bank shape as
 * Invoice, but no payments (no amountPaidMinor, no linked Payment records) and no
 * eWayBillFlag/eInvoiceFlag (those only apply to a real, billable Invoice). Standalone document
 * this phase: no "convert to Invoice" action (see build_phases.md Phase 5 decision).
 */
const proformaInvoiceSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    customerSnapshot: { type: customerSnapshotSchema, required: true },

    docNumber: { type: String, trim: true },
    seriesKey: { type: String, trim: true },

    status: { type: String, enum: PROFORMA_INVOICE_STATUSES, required: true, default: "draft", index: true },

    proformaDate: { type: Date, required: true },
    dueDate: { type: Date },
    referenceNumber: { type: String, trim: true },

    placeOfSupplyState: { type: String, required: true, trim: true },
    reverseCharge: { type: Boolean, required: true, default: false },

    lineItems: {
      type: [documentLineItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "A proforma invoice needs at least one line item",
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
    signatureId: { type: Schema.Types.ObjectId, ref: "Signature" },
    bankAccountId: { type: Schema.Types.ObjectId, ref: "BankAccount" },
    attachmentIds: { type: [Schema.Types.ObjectId], ref: "Attachment", default: [] },

    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

proformaInvoiceSchema.index({ businessId: 1, status: 1, proformaDate: -1 });
proformaInvoiceSchema.index({ businessId: 1, customerId: 1 });
proformaInvoiceSchema.index(
  { businessId: 1, docNumber: 1 },
  { unique: true, partialFilterExpression: { docNumber: { $type: "string" } } },
);

export type ProformaInvoiceLineItemDoc = DocumentLineItemDoc;

export type ProformaInvoiceCustomerSnapshot = {
  displayName: string;
  gstin?: string;
  billingAddress?: AddressSubdoc;
  shippingAddress?: AddressSubdoc;
};

export type ProformaInvoiceDoc = {
  businessId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  customerSnapshot: ProformaInvoiceCustomerSnapshot;
  docNumber?: string;
  seriesKey?: string;
  status: ProformaInvoiceStatus;
  proformaDate: Date;
  dueDate?: Date;
  referenceNumber?: string;
  placeOfSupplyState: string;
  reverseCharge: boolean;
  lineItems: ProformaInvoiceLineItemDoc[];
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
  signatureId?: mongoose.Types.ObjectId;
  bankAccountId?: mongoose.Types.ObjectId;
  attachmentIds: mongoose.Types.ObjectId[];
  createdByUserId: mongoose.Types.ObjectId;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const ProformaInvoice =
  (mongoose.models.ProformaInvoice as Model<ProformaInvoiceDoc>) ??
  mongoose.model<ProformaInvoiceDoc>("ProformaInvoice", proformaInvoiceSchema);
