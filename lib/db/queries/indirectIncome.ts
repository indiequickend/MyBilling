import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { IndirectIncome, type IndirectIncomeStatus } from "@/lib/db/models/IndirectIncome";
import { Customer } from "@/lib/db/models/Customer";
import { Payment } from "@/lib/db/models/Payment";
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
  | "not_editable"
  | "not_cancellable"
  | "not_deletable";

export type IndirectIncomeWriteResult =
  | { ok: true; indirectIncome: InstanceType<typeof IndirectIncome> }
  | { ok: false; reason: IndirectIncomeWriteFailureReason };

const EDITABLE_STATUSES: IndirectIncomeStatus[] = ["recorded"];
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

/**
 * Edits a "recorded" indirect income entry's fields, including its linked Payment (created
 * alongside it in createIndirectIncome) — mirrors updateExpense in lib/db/queries/expenses.ts:
 * the Payment's amount/mode/bank account are duplicated from this record at creation time (see
 * isPaymentEditable in lib/db/queries/payments.ts), so they must be kept in sync rather than
 * edited independently. A cancelled entry's payment is already voided and stays that way — not
 * editable. Transactional so the record and its Payment always change together.
 */
export async function updateIndirectIncome(
  indirectIncomeId: string,
  businessId: string,
  input: Omit<IndirectIncomeWriteInput, "businessId">,
): Promise<IndirectIncomeWriteResult> {
  await connectToDatabase();

  if (!(await isOwnedExpenseCategory(input.categoryId, businessId))) {
    return { ok: false, reason: "invalid_category" };
  }
  if (!(await isOwnedBankAccount(input.bankAccountId, businessId))) {
    return { ok: false, reason: "invalid_bank_account" };
  }
  if (input.customerId) {
    const customer = await Customer.findOne({
      _id: input.customerId,
      businessId,
      deletedAt: { $exists: false },
    });
    if (!customer) return { ok: false, reason: "invalid_customer" };
  }

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result: IndirectIncomeWriteResult = { ok: false, reason: "not_editable" };
    await session.withTransaction(async () => {
      const indirectIncome = await IndirectIncome.findOne({
        _id: indirectIncomeId,
        businessId,
        deletedAt: { $exists: false },
        status: { $in: EDITABLE_STATUSES },
      }).session(session);
      if (!indirectIncome) {
        result = { ok: false, reason: "not_editable" };
        return;
      }

      indirectIncome.categoryId = new mongoose.Types.ObjectId(input.categoryId);
      indirectIncome.amountMinor = input.amountMinor;
      indirectIncome.mode = input.mode;
      indirectIncome.bankAccountId = new mongoose.Types.ObjectId(input.bankAccountId);
      indirectIncome.customerId = input.customerId ? new mongoose.Types.ObjectId(input.customerId) : undefined;
      indirectIncome.sourceName = input.sourceName;
      indirectIncome.description = input.description;
      indirectIncome.incomeDate = input.incomeDate;
      await indirectIncome.save({ session });

      const paymentSet: Record<string, unknown> = {
        amountMinor: input.amountMinor,
        mode: input.mode,
        bankAccountId: new mongoose.Types.ObjectId(input.bankAccountId),
        paymentDate: input.incomeDate,
      };
      const paymentUnset: Record<string, string> = {};
      if (input.customerId) {
        paymentSet.partyType = "customer";
        paymentSet.partyId = new mongoose.Types.ObjectId(input.customerId);
      } else {
        paymentUnset.partyType = "";
        paymentUnset.partyId = "";
      }
      await Payment.updateOne(
        {
          businessId,
          linkedDocumentType: "indirect_income",
          linkedDocumentId: indirectIncome._id,
          voidedAt: { $exists: false },
        },
        {
          $set: paymentSet,
          ...(Object.keys(paymentUnset).length > 0 ? { $unset: paymentUnset } : {}),
        },
        { session },
      );

      result = { ok: true, indirectIncome };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/**
 * Cancelling an indirect income also voids its linked Payment (created alongside it in
 * createIndirectIncome) — mirrors cancelExpense's fix in lib/db/queries/expenses.ts: money
 * movement is voided, never hard-deleted, and a cancelled/deleted record whose payment stays live
 * would otherwise go on showing up forever in the Payments Timeline as a phantom transaction.
 * Transactional so the status flip and the void always land together.
 */
export async function cancelIndirectIncome(
  indirectIncomeId: string,
  businessId: string,
): Promise<IndirectIncomeWriteResult> {
  await connectToDatabase();
  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result: IndirectIncomeWriteResult = { ok: false, reason: "not_cancellable" };
    await session.withTransaction(async () => {
      const indirectIncome = await IndirectIncome.findOne({
        _id: indirectIncomeId,
        businessId,
        deletedAt: { $exists: false },
        status: { $in: CANCELLABLE_STATUSES },
      }).session(session);
      if (!indirectIncome) {
        result = { ok: false, reason: "not_cancellable" };
        return;
      }

      indirectIncome.status = "cancelled";
      await indirectIncome.save({ session });

      await Payment.updateMany(
        {
          businessId,
          linkedDocumentType: "indirect_income",
          linkedDocumentId: indirectIncome._id,
          voidedAt: { $exists: false },
        },
        { $set: { voidedAt: new Date() } },
        { session },
      );

      result = { ok: true, indirectIncome };
    });
    return result;
  } finally {
    await session.endSession();
  }
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
