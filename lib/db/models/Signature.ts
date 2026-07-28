import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const signatureSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true },
    imagePublicId: { type: String, required: true },
    imageUrl: { type: String, required: true },
    isDefault: { type: Boolean, required: true, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

signatureSchema.index({ businessId: 1, name: 1 });

export type SignatureDoc = InferSchemaType<typeof signatureSchema>;

export const Signature =
  (mongoose.models.Signature as Model<SignatureDoc>) ??
  mongoose.model<SignatureDoc>("Signature", signatureSchema);
