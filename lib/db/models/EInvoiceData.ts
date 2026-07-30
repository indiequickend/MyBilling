import mongoose, { Schema, type Model } from "mongoose";

export const E_INVOICE_VALIDATION_STATUSES = ["pending", "success", "failed", "cancelled"] as const;
export type EInvoiceValidationStatus = (typeof E_INVOICE_VALIDATION_STATUSES)[number];

/**
 * One record per Invoice with `eInvoiceFlag: true`. `validationStatus: "success"` means the
 * generated payload (lib/gst/eInvoicePayload.ts) is locally structurally valid and ready for
 * manual IRP upload — it is never a real IRN, since live IRN generation is out of scope
 * (project_spec.md → Out of Scope). "cancelled"/"pending" can also be set as a manual override
 * (e.g. the underlying invoice was cancelled) — "success" is only ever set by re-running
 * validation.
 */
const eInvoiceDataSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true, index: true },
    validationStatus: {
      type: String,
      enum: E_INVOICE_VALIDATION_STATUSES,
      required: true,
      default: "pending",
    },
    validationErrors: { type: [String], default: [] },
    generatedPayload: { type: Schema.Types.Mixed },
    generatedAt: { type: Date },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

eInvoiceDataSchema.index({ businessId: 1, invoiceId: 1 }, { unique: true });
eInvoiceDataSchema.index({ businessId: 1, validationStatus: 1 });

export type EInvoiceDataDoc = {
  businessId: mongoose.Types.ObjectId;
  invoiceId: mongoose.Types.ObjectId;
  validationStatus: EInvoiceValidationStatus;
  validationErrors: string[];
  generatedPayload?: unknown;
  generatedAt?: Date;
  createdByUserId: mongoose.Types.ObjectId;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const EInvoiceData =
  (mongoose.models.EInvoiceData as Model<EInvoiceDataDoc>) ??
  mongoose.model<EInvoiceDataDoc>("EInvoiceData", eInvoiceDataSchema);
