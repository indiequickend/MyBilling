import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { IndirectIncome, type IndirectIncomeStatus } from "@/lib/db/models/IndirectIncome";
import { Customer } from "@/lib/db/models/Customer";
import { isOwnedExpenseCategory } from "@/lib/db/queries/expenseCategories";
import { isOwnedBankAccount } from "@/lib/db/queries/bankAccounts";
import { createPayment } from "@/lib/db/queries/payments";
import { paginate, escapeRegex } from "@/lib/db/queryHelpers";
import type { PaymentMode } from "@/lib/constants/payments";

export type IndirectIncomeWriteInput = {
  businessId: string;
  categoryId: string;
  amountMinor: number;
  mode: PaymentMode;
  bankAccountId: string;
  customerId?: string;
  sourceName?: string;
  description?: string;
  incomeDate: Date;
};

export type CreateIndirectIncomeInput = IndirectIncomeWriteInput & { createdByUserId: string };

export type IndirectIncomeWriteFailureReason =
  | "invalid_category"
  | "invalid_bank_account"
  | "invalid_customer"
  | "not_found"
  | "not_cancellable"
  | "not_deletable";

export type IndirectIncomeWriteResult =
  | { ok: true; indirectIncome: InstanceType<typeof IndirectIncome> }
  | { ok: false; reason: IndirectIncomeWriteFailureReason };

const CANCELLABLE_STATUSES: IndirectIncomeStatus[] = ["recorded"];
const DELETABLE_STATUSES: IndirectIncomeStatus[] = ["cancelled"];

/** Mirrors createExpense — creates the record and its linked Payment (direction "in") together,
 * transactionally. See createExpense's comment for why this must be one transaction. */
export async function createIndirectIncome(
  input: CreateIndirectIncomeInput,
): Promise<IndirectIncomeWriteResult> {
  await connectToDatabase();

  if (!(await isOwnedExpenseCategory(input.categoryId, input.businessId))) {
    return { ok: false, reason: "invalid_category" };
  }
  if (!(await isOwnedBankAccount(input.bankAccountId, input.businessId))) {
    return { ok: false, reason: "invalid_bank_account" };
  }
  if (input.customerId) {
    const customer = await Customer.findOne({
      _id: input.customerId,
      businessId: input.businessId,
      deletedAt: { $exists: false },
    });
    if (!customer) return { ok: false, reason: "invalid_customer" };
  }

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: IndirectIncomeWriteResult;
    await session.withTransaction(async () => {
      const [incomeDoc] = await IndirectIncome.create(
        [
          {
            businessId: input.businessId,
            categoryId: input.categoryId,
            amountMinor: input.amountMinor,
            mode: input.mode,
            bankAccountId: input.bankAccountId,
            customerId: input.customerId,
            sourceName: input.sourceName,
            description: input.description,
            incomeDate: input.incomeDate,
            status: "recorded",
            createdByUserId: input.createdByUserId,
          },
        ],
        { session },
      );

      await createPayment(
        {
          businessId: input.businessId,
          partyType: input.customerId ? "customer" : undefined,
          partyId: input.customerId,
          direction: "in",
          amountMinor: input.amountMinor,
          mode: input.mode,
          bankAccountId: input.bankAccountId,
          paymentDate: input.incomeDate,
          linkedDocumentType: "indirect_income",
          linkedDocumentId: String(incomeDoc._id),
          createdByUserId: input.createdByUserId,
        },
        session,
      );

      result = { ok: true, indirectIncome: incomeDoc };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function cancelIndirectIncome(
  indirectIncomeId: string,
  businessId: string,
): Promise<IndirectIncomeWriteResult> {
  await connectToDatabase();
  const updated = await IndirectIncome.findOneAndUpdate(
    {
      _id: indirectIncomeId,
      businessId,
      deletedAt: { $exists: false },
      status: { $in: CANCELLABLE_STATUSES },
    },
    { $set: { status: "cancelled" } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_cancellable" };
  return { ok: true, indirectIncome: updated };
}

export async function softDeleteIndirectIncome(
  indirectIncomeId: string,
  businessId: string,
): Promise<IndirectIncomeWriteResult> {
  await connectToDatabase();
  const updated = await IndirectIncome.findOneAndUpdate(
    { _id: indirectIncomeId, businessId, deletedAt: { $exists: false }, status: { $in: DELETABLE_STATUSES } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_deletable" };
  return { ok: true, indirectIncome: updated };
}

export async function restoreIndirectIncome(indirectIncomeId: string, businessId: string) {
  await connectToDatabase();
  return IndirectIncome.findOneAndUpdate(
    { _id: indirectIncomeId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

export async function findIndirectIncomeById(indirectIncomeId: string, businessId: string) {
  await connectToDatabase();
  return IndirectIncome.findOne({ _id: indirectIncomeId, businessId });
}

export type IndirectIncomeListParams = {
  search?: string;
  categoryId?: string;
  tab?: "all" | "recorded" | "cancelled" | "deleted";
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
};

function buildIndirectIncomeFilter(
  businessId: string,
  params: Omit<IndirectIncomeListParams, "page" | "pageSize">,
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
  if (params.search) {
    const pattern = new RegExp(escapeRegex(params.search.trim()), "i");
    filter.$or = [{ sourceName: pattern }, { description: pattern }];
  }
  if (params.dateFrom || params.dateTo) {
    const range: Record<string, Date> = {};
    if (params.dateFrom) range.$gte = params.dateFrom;
    if (params.dateTo) range.$lte = params.dateTo;
    filter.incomeDate = range;
  }
  return filter;
}

export async function listIndirectIncome(businessId: string, params: IndirectIncomeListParams = {}) {
  await connectToDatabase();
  const filter = buildIndirectIncomeFilter(businessId, params);
  return paginate(IndirectIncome, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { incomeDate: -1, createdAt: -1 },
  });
}

export type IndirectIncomeTotalsSummary = { totalMinor: number };

/** Footer/report total over the WHOLE filtered set — only "recorded" income counts. Same
 * aggregate shape as sumExpenseTotals. */
export async function sumIndirectIncomeTotals(
  businessId: string,
  params: Omit<IndirectIncomeListParams, "page" | "pageSize" | "tab"> = {},
): Promise<IndirectIncomeTotalsSummary> {
  await connectToDatabase();
  const filter = buildIndirectIncomeFilter(businessId, { ...params, tab: "recorded" }, { forAggregate: true });
  const [agg] = await IndirectIncome.aggregate([
    { $match: filter },
    { $group: { _id: null, totalMinor: { $sum: "$amountMinor" } } },
  ]);
  return { totalMinor: agg?.totalMinor ?? 0 };
}
