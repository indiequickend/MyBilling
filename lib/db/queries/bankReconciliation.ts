import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { BankStatementLine } from "@/lib/db/models/BankStatementLine";
import { Payment } from "@/lib/db/models/Payment";
import { isOwnedBankAccount } from "@/lib/db/queries/bankAccounts";
import { paginate } from "@/lib/db/queryHelpers";

const MATCH_WINDOW_DAYS = 3;

export type BankStatementRowInput = {
  statementDate: Date;
  description?: string;
  amountMinor: number;
  direction: "credit" | "debit";
};

export type ImportBankStatementResult =
  | { ok: true; imported: number; autoMatched: number; importBatchId: string }
  | { ok: false; reason: "invalid_bank_account" };

/**
 * Synchronous, all-or-nothing insert (same "validate everything, then write the whole batch"
 * shape as the Expense bulk upload — see app/(dashboard)/expenses/bulk-upload/actions.ts), followed
 * by a best-effort auto-match pass: a statement line auto-matches an unmatched Payment on the same
 * bank account with the same amount, matching direction, and a paymentDate within
 * ±MATCH_WINDOW_DAYS of the statement date. Everything else is left for manual matching.
 */
export async function importBankStatement(
  businessId: string,
  bankAccountId: string,
  rows: BankStatementRowInput[],
  createdByUserId: string,
): Promise<ImportBankStatementResult> {
  await connectToDatabase();
  if (!(await isOwnedBankAccount(bankAccountId, businessId))) {
    return { ok: false, reason: "invalid_bank_account" };
  }

  const importBatchId = new mongoose.Types.ObjectId();
  const conn = await connectToDatabase();
  const session = await conn.startSession();
  let inserted: InstanceType<typeof BankStatementLine>[] = [];
  try {
    await session.withTransaction(async () => {
      inserted = await BankStatementLine.create(
        rows.map((r) => ({
          businessId,
          bankAccountId,
          importBatchId,
          statementDate: r.statementDate,
          description: r.description,
          amountMinor: r.amountMinor,
          direction: r.direction,
          createdByUserId,
        })),
        { session, ordered: true },
      );
    });
  } finally {
    await session.endSession();
  }

  // Best-effort auto-matching happens outside the insert transaction (a match failing to apply
  // doesn't invalidate the import — the line just stays unmatched for manual review). Track
  // claimed Payment ids in memory across this batch so two similar lines in the same file can't
  // both claim the same Payment; the partial unique index on matchedPaymentId is the real
  // last-line-of-defense guard against a race.
  const alreadyMatched = new Set(
    (
      await BankStatementLine.find({ businessId, bankAccountId, matchedPaymentId: { $exists: true } })
        .select("matchedPaymentId")
        .lean()
    ).map((l) => String(l.matchedPaymentId)),
  );

  let autoMatched = 0;
  for (const line of inserted) {
    const windowStart = new Date(line.statementDate);
    windowStart.setDate(windowStart.getDate() - MATCH_WINDOW_DAYS);
    const windowEnd = new Date(line.statementDate);
    windowEnd.setDate(windowEnd.getDate() + MATCH_WINDOW_DAYS);

    const candidate = await Payment.findOne({
      businessId,
      bankAccountId,
      direction: line.direction === "credit" ? "in" : "out",
      amountMinor: line.amountMinor,
      voidedAt: { $exists: false },
      paymentDate: { $gte: windowStart, $lte: windowEnd },
      _id: { $nin: [...alreadyMatched] },
    }).sort({ paymentDate: 1 });

    if (candidate) {
      line.matchedPaymentId = candidate._id;
      line.matchedAt = new Date();
      await line.save();
      alreadyMatched.add(String(candidate._id));
      autoMatched += 1;
    }
  }

  return { ok: true, imported: inserted.length, autoMatched, importBatchId: String(importBatchId) };
}

export async function listStatementLines(
  businessId: string,
  bankAccountId: string,
  params: { matched?: boolean; page?: number; pageSize?: number } = {},
) {
  await connectToDatabase();
  const filter: Record<string, unknown> = { businessId, bankAccountId };
  if (params.matched === true) filter.matchedPaymentId = { $exists: true };
  if (params.matched === false) filter.matchedPaymentId = { $exists: false };
  return paginate(BankStatementLine, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { statementDate: -1 },
  });
}

export async function listUnmatchedPayments(
  businessId: string,
  bankAccountId: string,
  params: { dateFrom?: Date; dateTo?: Date } = {},
) {
  await connectToDatabase();
  const matchedIds = await BankStatementLine.find({
    businessId,
    bankAccountId,
    matchedPaymentId: { $exists: true },
  })
    .select("matchedPaymentId")
    .lean();

  const filter: Record<string, unknown> = {
    businessId,
    bankAccountId,
    voidedAt: { $exists: false },
    _id: { $nin: matchedIds.map((m) => m.matchedPaymentId) },
  };
  if (params.dateFrom || params.dateTo) {
    const range: Record<string, Date> = {};
    if (params.dateFrom) range.$gte = params.dateFrom;
    if (params.dateTo) range.$lte = params.dateTo;
    filter.paymentDate = range;
  }
  return Payment.find(filter).sort({ paymentDate: -1 }).lean();
}

export type MatchResult = { ok: true } | { ok: false; reason: "not_found" | "already_matched" };

export async function matchStatementLine(
  lineId: string,
  paymentId: string,
  businessId: string,
): Promise<MatchResult> {
  await connectToDatabase();
  const [line, payment] = await Promise.all([
    BankStatementLine.findOne({ _id: lineId, businessId }),
    Payment.findOne({ _id: paymentId, businessId, voidedAt: { $exists: false } }),
  ]);
  if (!line || !payment) return { ok: false, reason: "not_found" };
  if (line.matchedPaymentId) return { ok: false, reason: "already_matched" };

  const alreadyClaimed = await BankStatementLine.exists({ businessId, matchedPaymentId: payment._id });
  if (alreadyClaimed) return { ok: false, reason: "already_matched" };

  line.matchedPaymentId = payment._id;
  line.matchedAt = new Date();
  await line.save();
  return { ok: true };
}

export async function unmatchStatementLine(lineId: string, businessId: string): Promise<MatchResult> {
  await connectToDatabase();
  const updated = await BankStatementLine.findOneAndUpdate(
    { _id: lineId, businessId },
    { $unset: { matchedPaymentId: "", matchedAt: "" } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_found" };
  return { ok: true };
}
