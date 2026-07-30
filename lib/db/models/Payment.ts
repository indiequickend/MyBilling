import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { PAYMENT_MODES } from "@/lib/constants/payments";

/**
 * Minimal Payment shape for Phase 3 (inline payment recording at invoice-save time);
 * formalized further in Phase 7 (Payments Timeline/Journals/Reconciliation). Money movement is
 * voided, never hard-deleted — `voidedAt` is the operative "reversed" marker.
 */
const paymentSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    // Optional: Expense/Indirect Income payments (Phase 4) have no linked Customer/Vendor.
    partyType: { type: String, enum: ["customer", "vendor"] },
    partyId: { type: Schema.Types.ObjectId, index: true },
    direction: { type: String, enum: ["in", "out"], required: true },
    amountMinor: { type: Number, required: true },
    mode: { type: String, enum: PAYMENT_MODES, required: true },
    bankAccountId: { type: Schema.Types.ObjectId, ref: "BankAccount", required: true },
    paymentDate: { type: Date, required: true },
    linkedDocumentType: {
      type: String,
      enum: ["invoice", "purchase", "expense", "indirect_income"],
      required: true,
    },
    linkedDocumentId: { type: Schema.Types.ObjectId, required: true, index: true },
    referenceNote: { type: String, trim: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    voidedAt: { type: Date },
    // "gateway" for Razorpay-collected Payment Link payments (see recordGatewayPayment); "manual"
    // (the default) for every other creation path in this file.
    source: { type: String, enum: ["manual", "gateway"], required: true, default: "manual" },
    // The gateway's own payment id — unique+sparse so a duplicate inbound webhook delivery (which
    // Razorpay's own docs say to expect) can never record the same payment twice.
    gatewayPaymentId: { type: String },
  },
  { timestamps: true },
);

paymentSchema.index({ businessId: 1, linkedDocumentType: 1, linkedDocumentId: 1 });
paymentSchema.index({ businessId: 1, partyType: 1, partyId: 1, paymentDate: -1 });
paymentSchema.index({ businessId: 1, bankAccountId: 1 });
paymentSchema.index({ gatewayPaymentId: 1 }, { unique: true, sparse: true });

export type PaymentDoc = InferSchemaType<typeof paymentSchema>;

export const Payment =
  (mongoose.models.Payment as Model<PaymentDoc>) ?? mongoose.model<PaymentDoc>("Payment", paymentSchema);
