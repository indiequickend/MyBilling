import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Business-scoped API key tied to a Role (project_spec.md's "Integrations & Apps" → API &
 * Webhooks) — the same RBAC permission matrix the UI uses applies unchanged to requests
 * authenticated this way (see lib/auth/apiKeyContext.ts). Follows the opaque-token pattern from
 * lib/auth/tokens.ts: only the HMAC hash of the raw key is ever stored.
 */
const apiKeySchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    roleId: { type: Schema.Types.ObjectId, ref: "Role", required: true },
    name: { type: String, required: true, trim: true },
    // First few characters of the raw key (e.g. "mb_live_ab12"), stored only for display in the
    // key list so an admin can tell keys apart without ever seeing the full secret again.
    keyPrefix: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastUsedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: true },
);

apiKeySchema.index({ businessId: 1, createdAt: -1 });

export type ApiKeyDoc = InferSchemaType<typeof apiKeySchema>;

export const ApiKey =
  (mongoose.models.ApiKey as Model<ApiKeyDoc>) ?? mongoose.model<ApiKeyDoc>("ApiKey", apiKeySchema);
