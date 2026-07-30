import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * One row per delivery attempt-set (not per HTTP call) — `attempts` counts how many times
 * lib/webhooks/deliver.ts tried before giving up or succeeding. Immutable audit trail of what was
 * actually sent, since WebhookEndpoint.secret can be rotated later and a past payload's signature
 * needs to remain verifiable against the secret that was actually in effect at send time — payload
 * is stored verbatim for that reason, not just for the deliveries-log UI.
 */
const webhookDeliverySchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    webhookEndpointId: { type: Schema.Types.ObjectId, ref: "WebhookEndpoint", required: true, index: true },
    eventType: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ["success", "failed"], required: true },
    attempts: { type: Number, required: true, default: 0 },
    lastAttemptAt: { type: Date, required: true },
    lastResponseStatus: { type: Number },
    lastError: { type: String },
  },
  { timestamps: true },
);

webhookDeliverySchema.index({ businessId: 1, webhookEndpointId: 1, createdAt: -1 });

export type WebhookDeliveryDoc = InferSchemaType<typeof webhookDeliverySchema>;

export const WebhookDelivery =
  (mongoose.models.WebhookDelivery as Model<WebhookDeliveryDoc>) ??
  mongoose.model<WebhookDeliveryDoc>("WebhookDelivery", webhookDeliverySchema);
