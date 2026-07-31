import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Immutable action log (project_spec.md's Security requirements: "Immutable audit log for logins,
 * permission changes, deletions, and payment edits"). Only ever created, never updated or deleted
 * by app code — there is deliberately no updateAuditLog/deleteAuditLog query helper.
 *
 * `before`/`after` are Mixed, caller-redacted snapshots (never raw secrets/full bank numbers —
 * pass already-masked values in, same rule as logs elsewhere in this codebase).
 */
const auditLogSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true },
    target: {
      type: { type: String, required: true },
      id: { type: Schema.Types.ObjectId },
      label: { type: String, trim: true },
    },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: false },
);

auditLogSchema.index({ businessId: 1, createdAt: -1 });
auditLogSchema.index({ businessId: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ businessId: 1, userId: 1, createdAt: -1 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema>;

export const AuditLog =
  (mongoose.models.AuditLog as Model<AuditLogDoc>) ??
  mongoose.model<AuditLogDoc>("AuditLog", auditLogSchema);
