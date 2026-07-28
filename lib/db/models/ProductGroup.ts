import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const productGroupSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

productGroupSchema.index(
  { businessId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $exists: false } } },
);

export type ProductGroupDoc = InferSchemaType<typeof productGroupSchema>;

export const ProductGroup =
  (mongoose.models.ProductGroup as Model<ProductGroupDoc>) ??
  mongoose.model<ProductGroupDoc>("ProductGroup", productGroupSchema);
