import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const priceListSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    isDefault: { type: Boolean, required: true, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

priceListSchema.index(
  { businessId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $exists: false } } },
);

export type PriceListDoc = InferSchemaType<typeof priceListSchema>;

export const PriceList =
  (mongoose.models.PriceList as Model<PriceListDoc>) ??
  mongoose.model<PriceListDoc>("PriceList", priceListSchema);
