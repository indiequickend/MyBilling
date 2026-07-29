import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

// Variants are Mongoose subdocuments (own `_id`), not a separate collection —
// always read/written with their parent product, and nothing in this phase
// queries a variant independently of it. Phase 6's StockLedgerEntry will store
// { productId, variantId } as plain ObjectIds (refs only resolve top-level
// collections), so it dereferences by loading the product.
const productVariantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true },
    barcode: { type: String, trim: true },
    sellingPriceOverrideMinor: { type: Number },
    purchasePriceOverrideMinor: { type: Number },
  },
  { timestamps: true },
);

// Price-list overrides are scoped to the parent product only (not per-variant)
// this phase — PriceList itself is just a named registry.
const priceOverrideSchema = new Schema(
  {
    priceListId: { type: Schema.Types.ObjectId, ref: "PriceList", required: true },
    priceMinor: { type: Number, required: true },
  },
  { _id: false },
);

const productImageSchema = new Schema(
  {
    publicId: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false },
);

const productSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["product", "service"], required: true, default: "product" },
    hsnOrSac: { type: String, trim: true },
    unit: { type: String, trim: true, default: "PCS" },
    categoryId: { type: Schema.Types.ObjectId, ref: "ProductCategory" },
    groupId: { type: Schema.Types.ObjectId, ref: "ProductGroup" },
    // All prices are integer paise (CLAUDE.md rule 7), never floats.
    purchasePriceMinor: { type: Number },
    // Required unless the product has variants — each variant then carries its own
    // sellingPriceOverrideMinor (see productVariantSchema above).
    sellingPriceMinor: { type: Number },
    priceIsTaxInclusive: { type: Boolean, required: true, default: false },
    taxRatePercent: { type: Number, required: true, default: 0 },
    barcode: { type: String, trim: true },
    images: { type: [productImageSchema], default: [] },
    variants: { type: [productVariantSchema], default: [] },
    priceOverrides: { type: [priceOverrideSchema], default: [] },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

productSchema.index({ businessId: 1, name: 1 });
productSchema.index({ businessId: 1, barcode: 1 });

export type ProductDoc = InferSchemaType<typeof productSchema>;
export type ProductVariantDoc = ProductDoc["variants"][number];
export type ProductPriceOverrideDoc = ProductDoc["priceOverrides"][number];

export const Product =
  (mongoose.models.Product as Model<ProductDoc>) ??
  mongoose.model<ProductDoc>("Product", productSchema);
