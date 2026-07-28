import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { addressSchema } from "@/lib/db/models/shared/address";

const warehouseSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: addressSchema, default: undefined },
    isDefault: { type: Boolean, required: true, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

warehouseSchema.index(
  { businessId: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $exists: false } } },
);

export type WarehouseDoc = InferSchemaType<typeof warehouseSchema>;

export const Warehouse =
  (mongoose.models.Warehouse as Model<WarehouseDoc>) ??
  mongoose.model<WarehouseDoc>("Warehouse", warehouseSchema);
