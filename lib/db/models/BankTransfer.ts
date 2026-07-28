import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/** A single-document insert is inherently atomic — no transaction needed, unlike Invoice numbering. */
const bankTransferSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    fromAccountId: { type: Schema.Types.ObjectId, ref: "BankAccount", required: true },
    toAccountId: { type: Schema.Types.ObjectId, ref: "BankAccount", required: true },
    amountMinor: { type: Number, required: true },
    transferDate: { type: Date, required: true },
    note: { type: String, trim: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

bankTransferSchema.index({ businessId: 1, transferDate: -1 });

export type BankTransferDoc = InferSchemaType<typeof bankTransferSchema>;

export const BankTransfer =
  (mongoose.models.BankTransfer as Model<BankTransferDoc>) ??
  mongoose.model<BankTransferDoc>("BankTransfer", bankTransferSchema);
