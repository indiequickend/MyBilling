import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const invitationSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    roleId: { type: Schema.Types.ObjectId, ref: "Role", required: true },
    tokenHash: { type: String, required: true, unique: true },
    invitedByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date },
  },
  { timestamps: true },
);

export type InvitationDoc = InferSchemaType<typeof invitationSchema>;

export const Invitation =
  (mongoose.models.Invitation as Model<InvitationDoc>) ??
  mongoose.model<InvitationDoc>("Invitation", invitationSchema);
