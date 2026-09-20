import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { BankAccount } from "@/lib/db/models/BankAccount";
import { BankTransfer } from "@/lib/db/models/BankTransfer";
import { BankStatementLine } from "@/lib/db/models/BankStatementLine";
import { Payment } from "@/lib/db/models/Payment";
import { Expense } from "@/lib/db/models/Expense";
import { IndirectIncome } from "@/lib/db/models/IndirectIncome";
import { ExpenseCategory } from "@/lib/db/models/ExpenseCategory";
import { resolvePaymentTimelineNames } from "@/lib/db/queries/payments";
import type { PaymentMode } from "@/lib/constants/payments";

export type BankLedgerEntry = {
  id: string;
  kind: "payment" | "transfer";
  date: Date;
  /** Money in (payment received / transfer in). Zero for an outgoing entry. */
  inMinor: number;
  /** Money out (payment made / transfer out). Zero for an incoming entry. */
  outMinor: number;
  /** Running balance of this account after this entry, including the opening balance. */
  balanceMinor: number;
  description: string;
  mode?: PaymentMode;
  referenceNote?: string;
  linkedDocumentType?: string;
  linkedDocumentId?: string;
  linkedDocumentNumber?: string;
  /** Payments only: whether an imported bank-statement line has been matched to it. */
  statementMatched?: boolean;
};

export type BankLedger = {
  account: { id: string; name: string; openingBalanceMinor: number; deleted: boolean };
  /** Balance at the start of the requested range (account opening balance + everything before it). */
  openingMinor: number;
  totalInMinor: number;
  totalOutMinor: number;
  closingMinor: number;
  /** Balance as of today over every entry — the figure Settings → Banks shows. */
  currentBalanceMinor: number;
  entries: BankLedgerEntry[];
  unmatchedStatementLines: number;
  /** Recorded expenses / indirect incomes on this account that have no active linked Payment, so
   * they are NOT part of the balance (the balance is derived from Payments). Normally empty. */
  missingPayments: MissingPaymentEntry[];
};

export type MissingPaymentEntry = {
  kind: "expense" | "indirect_income";
  id: string;
  date: Date;
  amountMinor: number;
  label: string;
};

type Raw = Omit<BankLedgerEntry, "balanceMinor"> & { sortAt: number };

/**
 * Statement-style ledger for one bank/cash account: opening balance, then every non-voided
 * Payment and BankTransfer touching the account in date order, each with a running balance.
 * Balances are derived (never cached) from the same three sources as getBankAccountBalance, so the
 * unfiltered closing balance always equals the Settings → Banks balance. `dateFrom`/`dateTo`
 * narrow what's listed; earlier activity is folded into the range's opening balance. `dateTo` is
 * inclusive of the whole day. Returns null when the account doesn't belong to the business.
 */
export async function getBankLedger(
  businessId: string,
  bankAccountId: string,
  range: { dateFrom?: Date; dateTo?: Date } = {},
): Promise<BankLedger | null> {
  await connectToDatabase();
  const businessObjectId = new mongoose.Types.ObjectId(businessId);
  const accountObjectId = new mongoose.Types.ObjectId(bankAccountId);

  const account = await BankAccount.findOne({ _id: bankAccountId, businessId }).lean();
  if (!account) return null;

  const [payments, transfers, matchedLines, unmatchedStatementLines] = await Promise.all([
    Payment.find({ businessId: businessObjectId, bankAccountId: accountObjectId, voidedAt: { $exists: false } })
      .sort({ paymentDate: 1, createdAt: 1 })
      .lean(),
    BankTransfer.find({
      businessId: businessObjectId,
      deletedAt: { $exists: false },
      $or: [{ fromAccountId: accountObjectId }, { toAccountId: accountObjectId }],
    })
      .sort({ transferDate: 1, createdAt: 1 })
      .lean(),
    BankStatementLine.find({
      businessId: businessObjectId,
      bankAccountId: accountObjectId,
      matchedPaymentId: { $exists: true },
    })
      .select("matchedPaymentId")
      .lean(),
    BankStatementLine.countDocuments({
      businessId: businessObjectId,
      bankAccountId: accountObjectId,
      matchedPaymentId: { $exists: false },
    }),
  ]);

  const otherAccountIds = [
    ...new Set(
      transfers.map((t) => String(String(t.fromAccountId) === bankAccountId ? t.toAccountId : t.fromAccountId)),
    ),
  ];
  const expensePaymentIds = payments.filter((p) => p.linkedDocumentType === "expense").map((p) => p.linkedDocumentId);
  const incomePaymentIds = payments
    .filter((p) => p.linkedDocumentType === "indirect_income")
    .map((p) => p.linkedDocumentId);
  const [linkedExpenses, linkedIncomes, accountExpenses, accountIncomes] = await Promise.all([
    expensePaymentIds.length
      ? Expense.find({ businessId: businessObjectId, _id: { $in: expensePaymentIds } })
          .select("categoryId description supplierName")
          .lean()
      : [],
    incomePaymentIds.length
      ? IndirectIncome.find({ businessId: businessObjectId, _id: { $in: incomePaymentIds } })
          .select("categoryId description sourceName")
          .lean()
      : [],
    Expense.find({
      businessId: businessObjectId,
      bankAccountId: accountObjectId,
      status: "recorded",
      deletedAt: { $exists: false },
    })
      .select("categoryId description supplierName amountMinor expenseDate")
      .lean(),
    IndirectIncome.find({
      businessId: businessObjectId,
      bankAccountId: accountObjectId,
      status: "recorded",
      deletedAt: { $exists: false },
    })
      .select("categoryId description sourceName amountMinor incomeDate")
      .lean(),
  ]);
  const categoryIds = [
    ...new Set(
      [...linkedExpenses, ...linkedIncomes, ...accountExpenses, ...accountIncomes].map((d) => String(d.categoryId)),
    ),
  ];
  const categories = categoryIds.length
    ? await ExpenseCategory.find({ businessId: businessObjectId, _id: { $in: categoryIds } })
        .select("name")
        .lean()
    : [];
  const categoryName = new Map(categories.map((c) => [String(c._id), c.name as string]));
  const describeRecord = (d: {
    categoryId: mongoose.Types.ObjectId;
    description?: string | null;
    supplierName?: string | null;
    sourceName?: string | null;
  }) =>
    [
      categoryName.get(String(d.categoryId)),
      d.supplierName ?? d.sourceName ?? undefined,
      d.description ?? undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  const expenseLabel = new Map(linkedExpenses.map((d) => [String(d._id), describeRecord(d)]));
  const incomeLabel = new Map(linkedIncomes.map((d) => [String(d._id), describeRecord(d)]));
  const paidDocIds = new Set(payments.map((p) => String(p.linkedDocumentId)));

  const [named, otherAccounts] = await Promise.all([
    resolvePaymentTimelineNames(payments),
    otherAccountIds.length
      ? BankAccount.find({ _id: { $in: otherAccountIds }, businessId }).select("name").lean()
      : [],
  ]);
  const otherName = new Map(otherAccounts.map((a) => [String(a._id), a.name as string]));
  const matchedPaymentIds = new Set(matchedLines.map((l) => String(l.matchedPaymentId)));

  const raw: Raw[] = [];
  for (const p of named) {
    const isIn = p.direction === "in";
    const doc = p.linkedDocumentNumber ? `${p.linkedDocumentNumber}` : undefined;
    const linkedId = p.linkedDocumentId ? String(p.linkedDocumentId) : "";
    const description =
      p.linkedDocumentType === "expense"
        ? `Expense${expenseLabel.get(linkedId) ? ` — ${expenseLabel.get(linkedId)}` : ""}`
        : p.linkedDocumentType === "indirect_income"
          ? `Indirect income${incomeLabel.get(linkedId) ? ` — ${incomeLabel.get(linkedId)}` : ""}`
          : [
              isIn ? "Received" : "Paid",
              p.partyName ? `${isIn ? "from" : "to"} ${p.partyName}` : undefined,
              doc ? `(${doc})` : undefined,
            ]
              .filter(Boolean)
              .join(" ");
    raw.push({
      id: String(p._id),
      kind: "payment",
      date: p.paymentDate,
      sortAt: p.paymentDate.getTime(),
      inMinor: isIn ? p.amountMinor : 0,
      outMinor: isIn ? 0 : p.amountMinor,
      description,
      mode: p.mode,
      referenceNote: p.referenceNote,
      linkedDocumentType: p.linkedDocumentType,
      linkedDocumentId: p.linkedDocumentId ? String(p.linkedDocumentId) : undefined,
      linkedDocumentNumber: p.linkedDocumentNumber,
      statementMatched: matchedPaymentIds.has(String(p._id)),
    });
  }
  for (const t of transfers) {
    const outgoing = String(t.fromAccountId) === bankAccountId;
    const other = otherName.get(String(outgoing ? t.toAccountId : t.fromAccountId)) ?? "another account";
    raw.push({
      id: String(t._id),
      kind: "transfer",
      date: t.transferDate,
      sortAt: t.transferDate.getTime(),
      inMinor: outgoing ? 0 : t.amountMinor,
      outMinor: outgoing ? t.amountMinor : 0,
      description: outgoing ? `Transfer to ${other}` : `Transfer from ${other}`,
      referenceNote: t.note ?? undefined,
    });
  }
  // Stable: payments were already date/createdAt ordered, transfers likewise; equal dates keep
  // payments-then-transfers order.
  raw.sort((a, b) => a.sortAt - b.sortAt);

  const startMs = range.dateFrom ? range.dateFrom.getTime() : undefined;
  const endMs = range.dateTo ? range.dateTo.getTime() + 24 * 60 * 60 * 1000 - 1 : undefined;

  let running = account.openingBalanceMinor ?? 0;
  let openingMinor = running;
  let totalInMinor = 0;
  let totalOutMinor = 0;
  const entries: BankLedgerEntry[] = [];
  for (const r of raw) {
    const before = startMs !== undefined && r.sortAt < startMs;
    const after = endMs !== undefined && r.sortAt > endMs;
    running += r.inMinor - r.outMinor;
    if (before) {
      openingMinor = running;
      continue;
    }
    if (after) continue;
    totalInMinor += r.inMinor;
    totalOutMinor += r.outMinor;
    const { sortAt: _sortAt, ...entry } = r;
    void _sortAt;
    entries.push({ ...entry, balanceMinor: running });
  }

  const missingPayments: MissingPaymentEntry[] = [
    ...accountExpenses
      .filter((d) => !paidDocIds.has(String(d._id)))
      .map((d) => ({
        kind: "expense" as const,
        id: String(d._id),
        date: d.expenseDate,
        amountMinor: d.amountMinor,
        label: describeRecord(d),
      })),
    ...accountIncomes
      .filter((d) => !paidDocIds.has(String(d._id)))
      .map((d) => ({
        kind: "indirect_income" as const,
        id: String(d._id),
        date: d.incomeDate,
        amountMinor: d.amountMinor,
        label: describeRecord(d),
      })),
  ]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 100);

  const currentBalanceMinor = raw.reduce((sum, r) => sum + r.inMinor - r.outMinor, account.openingBalanceMinor ?? 0);

  return {
    account: {
      id: String(account._id),
      name: account.name,
      openingBalanceMinor: account.openingBalanceMinor ?? 0,
      deleted: Boolean(account.deletedAt),
    },
    openingMinor,
    totalInMinor,
    totalOutMinor,
    closingMinor: openingMinor + totalInMinor - totalOutMinor,
    currentBalanceMinor,
    entries,
    unmatchedStatementLines,
    missingPayments,
  };
}
