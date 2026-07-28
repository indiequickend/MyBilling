import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const verificationTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, enum: ["email_verify", "password_reset"], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: true },
);

export type VerificationTokenDoc = InferSchemaType<typeof verificationTokenSchema>;

export const VerificationToken =
  (mongoose.models.VerificationToken as Model<VerificationTokenDoc>) ??
  mongoose.model<VerificationTokenDoc>("VerificationToken", verificationTokenSchema);
