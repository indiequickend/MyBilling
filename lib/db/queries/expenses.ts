import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { Expense, type ExpenseStatus } from "@/lib/db/models/Expense";
import { Vendor } from "@/lib/db/models/Vendor";
import { Payment } from "@/lib/db/models/Payment";
import { isOwnedExpenseCategory } from "@/lib/db/queries/expenseCategories";
import { isOwnedBankAccount } from "@/lib/db/queries/bankAccounts";
import { isOwnedProject } from "@/lib/db/queries/projects";
import { createPayment } from "@/lib/db/queries/payments";
import { paginate, escapeRegex } from "@/lib/db/queryHelpers";
import type { PaymentMode } from "@/lib/constants/payments";

export type ExpenseWriteInput = {
  businessId: string;
  categoryId: string;
  amountMinor: number;
  mode: PaymentMode;
  bankAccountId: string;
  vendorId?: string;
  supplierName?: string;
  supplierGstin?: string;
  projectId?: string;
  description?: string;
  expenseDate: Date;
  tdsApplicable?: boolean;
  tdsSectionCode?: string;
  tdsRatePercent?: number;
  tdsAmountMinor?: number;
  tcsApplicable?: boolean;
  tcsSectionCode?: string;
  tcsRatePercent?: number;
  tcsAmountMinor?: number;
};

export type CreateExpenseInput = ExpenseWriteInput & { createdByUserId: string };

export type ExpenseWriteFailureReason =
  | "invalid_category"
  | "invalid_bank_account"
  | "invalid_vendor"
  | "invalid_project"
  | "not_found"
  | "not_editable"
  | "not_cancellable"
  | "not_deletable";

export type ExpenseWriteResult =
  | { ok: true; expense: InstanceType<typeof Expense> }
  | { ok: false; reason: ExpenseWriteFailureReason };

const EDITABLE_STATUSES: ExpenseStatus[] = ["recorded"];
const CANCELLABLE_STATUSES: ExpenseStatus[] = ["recorded"];
const DELETABLE_STATUSES: ExpenseStatus[] = ["cancelled"];

/**
 * Creates the Expense record and its linked Payment (direction "out") together, transactionally,
 * so a partial write (expense recorded but no money-movement trail, or vice versa) can't happen —
 * matters here because, unlike Invoice/Purchase, an Expense has no "draft" state to patch up
 * later; it's recorded or it isn't.
 */
export async function createExpense(input: CreateExpenseInput): Promise<ExpenseWriteResult> {
  await connectToDatabase();

  if (!(await isOwnedExpenseCategory(input.categoryId, input.businessId))) {
    return { ok: false, reason: "invalid_category" };
  }
  if (!(await isOwnedBankAccount(input.bankAccountId, input.businessId))) {
    return { ok: false, reason: "invalid_bank_account" };
  }
  if (input.vendorId) {
    const vendor = await Vendor.findOne({
      _id: input.vendorId,
      businessId: input.businessId,
      deletedAt: { $exists: false },
    });
    if (!vendor) return { ok: false, reason: "invalid_vendor" };
  }
  if (input.projectId && !(await isOwnedProject(input.projectId, input.businessId))) {
    return { ok: false, reason: "invalid_project" };
  }

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: ExpenseWriteResult;
    await session.withTransaction(async () => {
      const [expenseDoc] = await Expense.create(
        [
          {
            businessId: input.businessId,
            categoryId: input.categoryId,
            amountMinor: input.amountMinor,
            mode: input.mode,
            bankAccountId: input.bankAccountId,
            vendorId: input.vendorId,
            supplierName: input.supplierName,
            supplierGstin: input.supplierGstin,
            projectId: input.projectId,
            description: input.description,
            expenseDate: input.expenseDate,
            tdsApplicable: input.tdsApplicable ?? false,
            tdsSectionCode: input.tdsSectionCode,
            tdsRatePercent: input.tdsRatePercent,
            tdsAmountMinor: input.tdsAmountMinor ?? 0,
            tcsApplicable: input.tcsApplicable ?? false,
            tcsSectionCode: input.tcsSectionCode,
            tcsRatePercent: input.tcsRatePercent,
            tcsAmountMinor: input.tcsAmountMinor ?? 0,
            status: "recorded",
            createdByUserId: input.createdByUserId,
          },
        ],
        { session },
      );

      await createPayment(
        {
          businessId: input.businessId,
          partyType: input.vendorId ? "vendor" : undefined,
          partyId: input.vendorId,
          direction: "out",
          amountMinor: input.amountMinor,
          mode: input.mode,
          bankAccountId: input.bankAccountId,
          paymentDate: input.expenseDate,
          linkedDocumentType: "expense",
          linkedDocumentId: String(expenseDoc._id),
          createdByUserId: input.createdByUserId,
        },
        session,
      );

      result = { ok: true, expense: expenseDoc };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * Edits a "recorded" expense's fields, including its linked Payment (created alongside it in
 * createExpense) — the two must be kept in sync, since a Payment's amount/mode/bank account are
 * duplicated onto it from the Expense at creation time (see isPaymentEditable in
 * lib/db/queries/payments.ts, which deliberately routes editing here instead of onto the Payment
 * directly, for exactly this reason). A cancelled expense's payment is already voided and stays
 * that way — not editable. Transactional so the Expense and its Payment always change together.
 */
export async function updateExpense(
  expenseId: string,
  businessId: string,
  input: Omit<ExpenseWriteInput, "businessId">,
): Promise<ExpenseWriteResult> {
  await connectToDatabase();

  if (!(await isOwnedExpenseCategory(input.categoryId, businessId))) {
    return { ok: false, reason: "invalid_category" };
  }
  if (!(await isOwnedBankAccount(input.bankAccountId, businessId))) {
    return { ok: false, reason: "invalid_bank_account" };
  }
  if (input.vendorId) {
    const vendor = await Vendor.findOne({ _id: input.vendorId, businessId, deletedAt: { $exists: false } });
    if (!vendor) return { ok: false, reason: "invalid_vendor" };
  }
  if (input.projectId && !(await isOwnedProject(input.projectId, businessId))) {
    return { ok: false, reason: "invalid_project" };
  }

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result: ExpenseWriteResult = { ok: false, reason: "not_editable" };
    await session.withTransaction(async () => {
      const expense = await Expense.findOne({
        _id: expenseId,
        businessId,
        deletedAt: { $exists: false },
        status: { $in: EDITABLE_STATUSES },
      }).session(session);
      if (!expense) {
        result = { ok: false, reason: "not_editable" };
        return;
      }

      expense.categoryId = new mongoose.Types.ObjectId(input.categoryId);
      expense.amountMinor = input.amountMinor;
      expense.mode = input.mode;
      expense.bankAccountId = new mongoose.Types.ObjectId(input.bankAccountId);
      expense.vendorId = input.vendorId ? new mongoose.Types.ObjectId(input.vendorId) : undefined;
      expense.supplierName = input.supplierName;
      expense.supplierGstin = input.supplierGstin;
      expense.projectId = input.projectId ? new mongoose.Types.ObjectId(input.projectId) : undefined;
      expense.description = input.description;
      expense.expenseDate = input.expenseDate;
      expense.tdsApplicable = input.tdsApplicable ?? false;
      expense.tdsSectionCode = input.tdsSectionCode;
      expense.tdsRatePercent = input.tdsRatePercent;
      expense.tdsAmountMinor = input.tdsAmountMinor ?? 0;
      expense.tcsApplicable = input.tcsApplicable ?? false;
      expense.tcsSectionCode = input.tcsSectionCode;
      expense.tcsRatePercent = input.tcsRatePercent;
      expense.tcsAmountMinor = input.tcsAmountMinor ?? 0;
      await expense.save({ session });

      const paymentSet: Record<string, unknown> = {
        amountMinor: input.amountMinor,
        mode: input.mode,
        bankAccountId: new mongoose.Types.ObjectId(input.bankAccountId),
        paymentDate: input.expenseDate,
      };
      const paymentUnset: Record<string, string> = {};
      if (input.vendorId) {
        paymentSet.partyType = "vendor";
        paymentSet.partyId = new mongoose.Types.ObjectId(input.vendorId);
      } else {
        paymentUnset.partyType = "";
        paymentUnset.partyId = "";
      }
      await Payment.updateOne(
        {
          businessId,
          linkedDocumentType: "expense",
          linkedDocumentId: expense._id,
          voidedAt: { $exists: false },
        },
        {
          $set: paymentSet,
          ...(Object.keys(paymentUnset).length > 0 ? { $unset: paymentUnset } : {}),
        },
        { session },
      );

      result = { ok: true, expense };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * Cancelling an expense also voids its linked Payment (created alongside it in createExpense) —
 * money movement is voided, never hard-deleted, but a cancelled expense whose payment stays live
 * is exactly the bug this closes: the Payments Timeline only filters out voidedAt payments, so an
 * un-voided payment for a cancelled/deleted expense goes on showing up forever as a phantom
 * transaction. Transactional so the status flip and the void always land together.
 */
export async function cancelExpense(expenseId: string, businessId: string): Promise<ExpenseWriteResult> {
  await connectToDatabase();
  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result: ExpenseWriteResult = { ok: false, reason: "not_cancellable" };
    await session.withTransaction(async () => {
      const expense = await Expense.findOne({
        _id: expenseId,
        businessId,
        deletedAt: { $exists: false },
        status: { $in: CANCELLABLE_STATUSES },
      }).session(session);
      if (!expense) {
        result = { ok: false, reason: "not_cancellable" };
        return;
      }

      expense.status = "cancelled";
      await expense.save({ session });

      await Payment.updateMany(
        {
          businessId,
          linkedDocumentType: "expense",
          linkedDocumentId: expense._id,
          voidedAt: { $exists: false },
        },
        { $set: { voidedAt: new Date() } },
        { session },
      );

      result = { ok: true, expense };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function softDeleteExpense(expenseId: string, businessId: string): Promise<ExpenseWriteResult> {
  await connectToDatabase();
  const updated = await Expense.findOneAndUpdate(
    { _id: expenseId, businessId, deletedAt: { $exists: false }, status: { $in: DELETABLE_STATUSES } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_deletable" };
  return { ok: true, expense: updated };
}

export async function attachExpenseReceipt(expenseId: string, businessId: string, attachmentId: string) {
  await connectToDatabase();
  return Expense.findOneAndUpdate(
    { _id: expenseId, businessId },
    { $set: { receiptAttachmentId: attachmentId } },
    { returnDocument: "after" },
  );
}

export async function restoreExpense(expenseId: string, businessId: string) {
  await connectToDatabase();
  return Expense.findOneAndUpdate(
    { _id: expenseId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

export async function findExpenseById(expenseId: string, businessId: string) {
  await connectToDatabase();
  return Expense.findOne({ _id: expenseId, businessId });
}

export type ExpenseListParams = {
  search?: string;
  categoryId?: string;
  projectId?: string;
  tab?: "all" | "recorded" | "cancelled" | "deleted";
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
};

function buildExpenseFilter(
  businessId: string,
  params: Omit<ExpenseListParams, "page" | "pageSize">,
  options: { forAggregate?: boolean } = {},
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    businessId: options.forAggregate ? new mongoose.Types.ObjectId(businessId) : businessId,
    deletedAt: params.tab === "deleted" ? { $exists: true } : { $exists: false },
  };
  if (params.tab && params.tab !== "all" && params.tab !== "deleted") {
    filter.status = params.tab;
  }
  if (params.categoryId) filter.categoryId = params.categoryId;
  if (params.projectId) filter.projectId = params.projectId;
  if (params.search) {
    const pattern = new RegExp(escapeRegex(params.search.trim()), "i");
    filter.$or = [{ supplierName: pattern }, { description: pattern }];
  }
  if (params.dateFrom || params.dateTo) {
    const range: Record<string, Date> = {};
    if (params.dateFrom) range.$gte = params.dateFrom;
    if (params.dateTo) range.$lte = params.dateTo;
    filter.expenseDate = range;
  }
  return filter;
}

export async function listExpenses(businessId: string, params: ExpenseListParams = {}) {
  await connectToDatabase();
  const filter = buildExpenseFilter(businessId, params);
  return paginate(Expense, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { expenseDate: -1, createdAt: -1 },
  });
}

export type ExpenseTotalsSummary = { totalMinor: number };

/** Footer/report total over the WHOLE filtered set — only "recorded" expenses count (cancelled
 * ones never moved money that's still outstanding). Same aggregate shape as sumInvoiceTotals. */
export async function sumExpenseTotals(
  businessId: string,
  params: Omit<ExpenseListParams, "page" | "pageSize" | "tab"> = {},
): Promise<ExpenseTotalsSummary> {
  await connectToDatabase();
  const filter = buildExpenseFilter(businessId, { ...params, tab: "recorded" }, { forAggregate: true });
  const [agg] = await Expense.aggregate([
    { $match: filter },
    { $group: { _id: null, totalMinor: { $sum: "$amountMinor" } } },
  ]);
  return { totalMinor: agg?.totalMinor ?? 0 };
}
