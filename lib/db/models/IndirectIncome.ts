import mongoose, { Schema, type Model } from "mongoose";
import { PAYMENT_MODES, type PaymentMode } from "@/lib/constants/payments";

export const INDIRECT_INCOME_STATUSES = ["recorded", "cancelled"] as const;
export type IndirectIncomeStatus = (typeof INDIRECT_INCOME_STATUSES)[number];

/**
 * Same shape as Expense, kept as its own collection per project_spec.md (separate P&L
 * classification for non-sales income like interest or refunds). Every non-cancelled
 * IndirectIncome has exactly one linked Payment (direction "in") created in the same
 * transaction — see lib/db/queries/indirectIncome.ts. Reuses ExpenseCategory rather than a
 * separate category collection — project_spec.md doesn't call for a distinct category set.
 */
const indirectIncomeSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "ExpenseCategory", required: true, index: true },
    amountMinor: { type: Number, required: true },
    mode: { type: String, enum: PAYMENT_MODES, required: true },
    bankAccountId: { type: Schema.Types.ObjectId, ref: "BankAccount", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    sourceName: { type: String, trim: true },
    description: { type: String, trim: true },
    incomeDate: { type: Date, required: true },
    status: { type: String, enum: INDIRECT_INCOME_STATUSES, required: true, default: "recorded", index: true },
    receiptAttachmentId: { type: Schema.Types.ObjectId, ref: "Attachment" },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

indirectIncomeSchema.index({ businessId: 1, status: 1, incomeDate: -1 });
indirectIncomeSchema.index({ businessId: 1, categoryId: 1 });

export type IndirectIncomeDoc = {
  businessId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId;
  amountMinor: number;
  mode: PaymentMode;
  bankAccountId: mongoose.Types.ObjectId;
  customerId?: mongoose.Types.ObjectId;
  sourceName?: string;
  description?: string;
  incomeDate: Date;
  status: IndirectIncomeStatus;
  receiptAttachmentId?: mongoose.Types.ObjectId;
  createdByUserId: mongoose.Types.ObjectId;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const IndirectIncome =
  (mongoose.models.IndirectIncome as Model<IndirectIncomeDoc>) ??
  mongoose.model<IndirectIncomeDoc>("IndirectIncome", indirectIncomeSchema);
