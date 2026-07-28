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
    partyType: { type: String, enum: ["customer", "vendor"], required: true },
    partyId: { type: Schema.Types.ObjectId, required: true, index: true },
    direction: { type: String, enum: ["in", "out"], required: true },
    amountMinor: { type: Number, required: true },
    mode: { type: String, enum: PAYMENT_MODES, required: true },
    bankAccountId: { type: Schema.Types.ObjectId, ref: "BankAccount", required: true },
    paymentDate: { type: Date, required: true },
    linkedDocumentType: { type: String, enum: ["invoice"], required: true },
    linkedDocumentId: { type: Schema.Types.ObjectId, required: true, index: true },
    referenceNote: { type: String, trim: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    voidedAt: { type: Date },
  },
  { timestamps: true },
);

paymentSchema.index({ businessId: 1, linkedDocumentType: 1, linkedDocumentId: 1 });
paymentSchema.index({ businessId: 1, partyType: 1, partyId: 1, paymentDate: -1 });
paymentSchema.index({ businessId: 1, bankAccountId: 1 });

export type PaymentDoc = InferSchemaType<typeof paymentSchema>;

export const Payment =
  (mongoose.models.Payment as Model<PaymentDoc>) ?? mongoose.model<PaymentDoc>("Payment", paymentSchema);
