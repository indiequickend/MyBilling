import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const partyGroupSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    type: { type: String, enum: ["customer", "vendor"], required: true },
    name: { type: String, required: true, trim: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

// Name must be unique per business+type among non-deleted groups — a deleted
// group's name can be reused (partialFilterExpression excludes it).
partyGroupSchema.index(
  { businessId: 1, type: 1, name: 1 },
  { unique: true, partialFilterExpression: { deletedAt: { $exists: false } } },
);

export type PartyGroupDoc = InferSchemaType<typeof partyGroupSchema>;

export const PartyGroup =
  (mongoose.models.PartyGroup as Model<PartyGroupDoc>) ??
  mongoose.model<PartyGroupDoc>("PartyGroup", partyGroupSchema);
