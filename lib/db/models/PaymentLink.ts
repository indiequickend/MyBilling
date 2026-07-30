import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Follows the same signed-opaque-token pattern as Session/VerificationToken/Invitation
 * (lib/auth/tokens.ts): the raw token is only ever in the shareable URL, never stored — only its
 * HMAC-SHA256 is. "Expired" is derived (now > expiresAt) rather than a stored status, so a link
 * never needs a background job to flip state; `revokedAt` is the only stored "stop working early"
 * marker, mirroring how Payment is voided rather than deleted.
 */
const paymentLinkSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    amountMinor: { type: Number, required: true },
    // Optional — "for a specific amount/invoice" (project_spec.md). Online collection via the
    // Payment Gateway (see gatewayPaymentLinkId below) is only offered when this is set — a bare/
    // unlinked link stays a read-only manual-bank-transfer view.
    linkedInvoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },
    note: { type: String, trim: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Set once the payer starts an online (Razorpay) checkout for this link — correlates the
    // gateway's inbound webhook back to this link (see app/api/webhooks/razorpay/route.ts).
    // Online collection is only offered for links with a linkedInvoiceId (see project_spec.md's
    // Payment Gateway wiring — Phase 12 scope decision).
    gatewayPaymentLinkId: { type: String },
  },
  { timestamps: true },
);

paymentLinkSchema.index({ businessId: 1, createdAt: -1 });
paymentLinkSchema.index({ gatewayPaymentLinkId: 1 }, { sparse: true });

export type PaymentLinkDoc = InferSchemaType<typeof paymentLinkSchema>;

export const PaymentLink =
  (mongoose.models.PaymentLink as Model<PaymentLinkDoc>) ??
  mongoose.model<PaymentLinkDoc>("PaymentLink", paymentLinkSchema);
