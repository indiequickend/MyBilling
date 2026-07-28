import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { addressSchema } from "@/lib/db/models/shared/address";

const customerSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    displayName: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true },
    gstin: { type: String, trim: true, uppercase: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    groupIds: { type: [Schema.Types.ObjectId], ref: "PartyGroup", default: [] },
    billingAddress: { type: addressSchema, default: undefined },
    shippingAddress: { type: addressSchema, default: undefined },
    notes: { type: String, trim: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

customerSchema.index({ businessId: 1, displayName: 1 });

export type CustomerDoc = InferSchemaType<typeof customerSchema>;

export const Customer =
  (mongoose.models.Customer as Model<CustomerDoc>) ??
  mongoose.model<CustomerDoc>("Customer", customerSchema);
