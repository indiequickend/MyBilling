import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { BANK_ACCOUNT_TYPES } from "@/lib/constants/payments";

const bankAccountSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    type: { type: String, enum: BANK_ACCOUNT_TYPES, required: true },
    name: { type: String, required: true, trim: true },
    accountHolderName: { type: String, trim: true },
    // Stored in full, masked only at the UI/log edge (same pattern as GSTIN/PAN elsewhere in
    // this codebase) — field-level encryption at rest is a Phase 14 hardening item.
    accountNumber: { type: String, trim: true },
    ifsc: { type: String, trim: true, uppercase: true },
    upiId: { type: String, trim: true },
    openingBalanceMinor: { type: Number, required: true, default: 0 },
    isDefault: { type: Boolean, required: true, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

bankAccountSchema.index({ businessId: 1, name: 1 });

export type BankAccountDoc = InferSchemaType<typeof bankAccountSchema>;

export const BankAccount =
  (mongoose.models.BankAccount as Model<BankAccountDoc>) ??
  mongoose.model<BankAccountDoc>("BankAccount", bankAccountSchema);
