import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhooks/events";

/**
 * A business-configured outbound webhook subscription (project_spec.md's "Integrations & Apps" →
 * API & Webhooks). `secret` is stored in full (not hashed) — unlike Session/ApiKey tokens, this
 * value is never presented back to us for comparison; we need it in full to compute the outbound
 * HMAC signature on every delivery. Same plaintext-storage precedent as BankAccount.accountNumber.
 */
const webhookEndpointSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    url: { type: String, required: true, trim: true },
    secret: { type: String, required: true },
    eventTypes: { type: [String], enum: WEBHOOK_EVENT_TYPES, required: true, default: [] },
    isActive: { type: Boolean, required: true, default: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

webhookEndpointSchema.index({ businessId: 1, createdAt: -1 });

export type WebhookEndpointDoc = InferSchemaType<typeof webhookEndpointSchema>;

export const WebhookEndpoint =
  (mongoose.models.WebhookEndpoint as Model<WebhookEndpointDoc>) ??
  mongoose.model<WebhookEndpointDoc>("WebhookEndpoint", webhookEndpointSchema);
