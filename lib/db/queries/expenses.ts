import { connectToDatabase } from "@/lib/db/connect";
import { Expense, type ExpenseStatus } from "@/lib/db/models/Expense";
import { Vendor } from "@/lib/db/models/Vendor";
import { isOwnedExpenseCategory } from "@/lib/db/queries/expenseCategories";
import { isOwnedBankAccount } from "@/lib/db/queries/bankAccounts";
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
  description?: string;
  expenseDate: Date;
};

export type CreateExpenseInput = ExpenseWriteInput & { createdByUserId: string };

export type ExpenseWriteFailureReason =
  | "invalid_category"
  | "invalid_bank_account"
  | "invalid_vendor"
  | "not_found"
  | "not_cancellable"
  | "not_deletable";

export type ExpenseWriteResult =
  | { ok: true; expense: InstanceType<typeof Expense> }
  | { ok: false; reason: ExpenseWriteFailureReason };

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
            description: input.description,
            expenseDate: input.expenseDate,
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

export async function cancelExpense(expenseId: string, businessId: string): Promise<ExpenseWriteResult> {
  await connectToDatabase();
  const updated = await Expense.findOneAndUpdate(
    { _id: expenseId, businessId, deletedAt: { $exists: false }, status: { $in: CANCELLABLE_STATUSES } },
    { $set: { status: "cancelled" } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_cancellable" };
  return { ok: true, expense: updated };
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
  tab?: "all" | "recorded" | "cancelled" | "deleted";
  page?: number;
  pageSize?: number;
};

export async function listExpenses(businessId: string, params: ExpenseListParams = {}) {
  await connectToDatabase();
  const filter: Record<string, unknown> = {
    businessId,
    deletedAt: params.tab === "deleted" ? { $exists: true } : { $exists: false },
  };
  if (params.tab && params.tab !== "all" && params.tab !== "deleted") {
    filter.status = params.tab;
  }
  if (params.categoryId) filter.categoryId = params.categoryId;
  if (params.search) {
    const pattern = new RegExp(escapeRegex(params.search.trim()), "i");
    filter.$or = [{ supplierName: pattern }, { description: pattern }];
  }
  return paginate(Expense, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { expenseDate: -1, createdAt: -1 },
  });
}
