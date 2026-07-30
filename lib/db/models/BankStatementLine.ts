import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * One row per imported bank-statement line (CSV, synchronous — see the Expense bulk-upload
 * precedent in app/(dashboard)/expenses/bulk-upload/). `importBatchId` groups every line from the
 * same upload so a review screen can be scoped to "this import." `matchedPaymentId` is set either
 * by the automatic exact-amount/±3-day matcher at import time or by a manual match action — the
 * partial unique index below is what guarantees a single Payment is never matched to two lines.
 */
const bankStatementLineSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    bankAccountId: { type: Schema.Types.ObjectId, ref: "BankAccount", required: true, index: true },
    importBatchId: { type: Schema.Types.ObjectId, required: true, index: true },
    statementDate: { type: Date, required: true },
    description: { type: String, trim: true },
    amountMinor: { type: Number, required: true, min: 0 },
    direction: { type: String, enum: ["credit", "debit"], required: true },
    matchedPaymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    matchedAt: { type: Date },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

bankStatementLineSchema.index({ businessId: 1, bankAccountId: 1, statementDate: -1 });
bankStatementLineSchema.index(
  { matchedPaymentId: 1 },
  { unique: true, partialFilterExpression: { matchedPaymentId: { $exists: true } } },
);

export type BankStatementLineDoc = InferSchemaType<typeof bankStatementLineSchema>;

export const BankStatementLine =
  (mongoose.models.BankStatementLine as Model<BankStatementLineDoc>) ??
  mongoose.model<BankStatementLineDoc>("BankStatementLine", bankStatementLineSchema);
