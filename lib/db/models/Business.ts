import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const businessSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

export type BusinessDoc = InferSchemaType<typeof businessSchema>;

export const Business =
  (mongoose.models.Business as Model<BusinessDoc>) ??
  mongoose.model<BusinessDoc>("Business", businessSchema);
