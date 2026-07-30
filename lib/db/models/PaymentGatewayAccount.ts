import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * A business's own connected Razorpay-style sub-account (project_spec.md: "connect a
 * payment-gateway sub-account ... Razorpay-style connected-account model"). One per business.
 * `keySecret`/`webhookSecret` stored in full — same plaintext-storage precedent as
 * BankAccount.accountNumber (masked at the UI/log edge only; encryption at rest is a Phase 14 item).
 */
const paymentGatewayAccountSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, unique: true },
    provider: { type: String, enum: ["razorpay"], required: true, default: "razorpay" },
    keyId: { type: String, required: true, trim: true },
    keySecret: { type: String, required: true },
    // Verifies Razorpay's inbound webhook signature — a distinct secret from keySecret, configured
    // separately in the Razorpay dashboard.
    webhookSecret: { type: String, required: true },
    accountId: { type: String, trim: true },
    isEnabled: { type: Boolean, required: true, default: false },
    activationStatus: { type: String, enum: ["pending", "active", "disabled"], required: true, default: "pending" },
    // Which local account gateway-collected payments are recorded against.
    settlementBankAccountId: { type: Schema.Types.ObjectId, ref: "BankAccount", required: true },
  },
  { timestamps: true },
);

export type PaymentGatewayAccountDoc = InferSchemaType<typeof paymentGatewayAccountSchema>;

export const PaymentGatewayAccount =
  (mongoose.models.PaymentGatewayAccount as Model<PaymentGatewayAccountDoc>) ??
  mongoose.model<PaymentGatewayAccountDoc>("PaymentGatewayAccount", paymentGatewayAccountSchema);
