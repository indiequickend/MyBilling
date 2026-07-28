import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const productCategorySchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

productCategorySchema.index(
  { businessId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $exists: false } } },
);

export type ProductCategoryDoc = InferSchemaType<typeof productCategorySchema>;

export const ProductCategory =
  (mongoose.models.ProductCategory as Model<ProductCategoryDoc>) ??
  mongoose.model<ProductCategoryDoc>("ProductCategory", productCategorySchema);
