import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const membershipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    roleId: { type: Schema.Types.ObjectId, ref: "Role", required: true },
    status: { type: String, enum: ["active", "deactivated"], required: true, default: "active" },
  },
  { timestamps: true },
);

// A user has at most one membership per business.
membershipSchema.index({ userId: 1, businessId: 1 }, { unique: true });

export type MembershipDoc = InferSchemaType<typeof membershipSchema>;

export const Membership =
  (mongoose.models.Membership as Model<MembershipDoc>) ??
  mongoose.model<MembershipDoc>("Membership", membershipSchema);
