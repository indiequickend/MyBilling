import mongoose, { Schema, type Model } from "mongoose";
import { PAYMENT_MODES, type PaymentMode } from "@/lib/constants/payments";

export const EXPENSE_STATUSES = ["recorded", "cancelled"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

/**
 * Non-document money movement (no line items, no docNumber) — category, amount, mode, and an
 * optional linked Vendor or free-text supplier. Every non-cancelled Expense has exactly one
 * linked Payment (direction "out") created in the same transaction — see
 * lib/db/queries/expenses.ts.
 */
const expenseSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "ExpenseCategory", required: true, index: true },
    amountMinor: { type: Number, required: true },
    mode: { type: String, enum: PAYMENT_MODES, required: true },
    bankAccountId: { type: Schema.Types.ObjectId, ref: "BankAccount", required: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
    supplierName: { type: String, trim: true },
    supplierGstin: { type: String, trim: true, uppercase: true },
    description: { type: String, trim: true },
    expenseDate: { type: Date, required: true },

    // TDS (deducted from this vendor/supplier's payment) and TCS (collected by them on this
    // expense) — both payable-side, mirrors Purchase.ts. Informational/reporting only — never
    // folded into amountMinor or the linked Payment. See lib/db/queries/reports.ts getTdsTcsReport.
    tdsApplicable: { type: Boolean, required: true, default: false },
    tdsSectionCode: { type: String, trim: true },
    tdsRatePercent: { type: Number },
    tdsAmountMinor: { type: Number, required: true, default: 0 },
    tcsApplicable: { type: Boolean, required: true, default: false },
    tcsSectionCode: { type: String, trim: true },
    tcsRatePercent: { type: Number },
    tcsAmountMinor: { type: Number, required: true, default: 0 },

    status: { type: String, enum: EXPENSE_STATUSES, required: true, default: "recorded", index: true },
    receiptAttachmentId: { type: Schema.Types.ObjectId, ref: "Attachment" },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

expenseSchema.index({ businessId: 1, status: 1, expenseDate: -1 });
expenseSchema.index({ businessId: 1, categoryId: 1 });

export type ExpenseDoc = {
  businessId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId;
  amountMinor: number;
  mode: PaymentMode;
  bankAccountId: mongoose.Types.ObjectId;
  vendorId?: mongoose.Types.ObjectId;
  supplierName?: string;
  supplierGstin?: string;
  description?: string;
  expenseDate: Date;
  tdsApplicable: boolean;
  tdsSectionCode?: string;
  tdsRatePercent?: number;
  tdsAmountMinor: number;
  tcsApplicable: boolean;
  tcsSectionCode?: string;
  tcsRatePercent?: number;
  tcsAmountMinor: number;
  status: ExpenseStatus;
  receiptAttachmentId?: mongoose.Types.ObjectId;
  createdByUserId: mongoose.Types.ObjectId;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export const Expense =
  (mongoose.models.Expense as Model<ExpenseDoc>) ?? mongoose.model<ExpenseDoc>("Expense", expenseSchema);
