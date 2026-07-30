import { connectToDatabase } from "@/lib/db/connect";
import { Journal, type JournalDoc } from "@/lib/db/models/Journal";
import { Business } from "@/lib/db/models/Business";
import { BankAccount } from "@/lib/db/models/BankAccount";
import { Customer } from "@/lib/db/models/Customer";
import { Vendor } from "@/lib/db/models/Vendor";
import { paginate } from "@/lib/db/queryHelpers";
import { reserveNextDocumentNumber } from "@/lib/db/queries/documentSequences";
import { resolveNumberingConfig, resolveSeriesKey, formatDocumentNumber } from "@/lib/documents/numbering";

export type JournalLineWriteInput = {
  accountType: "bank_account" | "customer" | "vendor" | "other";
  accountRefId?: string;
  accountLabel?: string; // only used (required) when accountType === "other"
  debitMinor: number;
  creditMinor: number;
  note?: string;
};

export type CreateJournalInput = {
  businessId: string;
  journalDate: Date;
  narration: string;
  lines: JournalLineWriteInput[];
  createdByUserId: string;
};

export type JournalWriteFailureReason =
  | "business_not_found"
  | "invalid_line_count"
  | "invalid_account_ref"
  | "unbalanced"
  | "empty_entry";

export type JournalWriteResult =
  | { ok: true; journal: InstanceType<typeof Journal> }
  | { ok: false; reason: JournalWriteFailureReason };

/**
 * Resolves each line's display label server-side from the real record it references (never trusts
 * a client-supplied label for bank_account/customer/vendor, since that label is what every future
 * viewer of this journal sees) and re-validates the debit/credit balance — defense in depth on top
 * of the Zod-layer check, the same "don't trust only one layer" posture as payments_exceed_total
 * elsewhere in this codebase.
 */
async function resolveLine(
  businessId: string,
  line: JournalLineWriteInput,
): Promise<{ accountType: JournalLineWriteInput["accountType"]; accountRefId?: string; accountLabel: string; debitMinor: number; creditMinor: number; note?: string } | null> {
  if (line.accountType === "other") {
    const label = line.accountLabel?.trim();
    if (!label) return null;
    return { accountType: "other", accountLabel: label, debitMinor: line.debitMinor, creditMinor: line.creditMinor, note: line.note };
  }
  if (!line.accountRefId) return null;
  if (line.accountType === "bank_account") {
    const account = await BankAccount.findOne({
      _id: line.accountRefId,
      businessId,
      deletedAt: { $exists: false },
    });
    if (!account) return null;
    return {
      accountType: "bank_account",
      accountRefId: line.accountRefId,
      accountLabel: account.name,
      debitMinor: line.debitMinor,
      creditMinor: line.creditMinor,
      note: line.note,
    };
  }
  if (line.accountType === "customer") {
    const customer = await Customer.findOne({
      _id: line.accountRefId,
      businessId,
      deletedAt: { $exists: false },
    });
    if (!customer) return null;
    return {
      accountType: "customer",
      accountRefId: line.accountRefId,
      accountLabel: customer.displayName,
      debitMinor: line.debitMinor,
      creditMinor: line.creditMinor,
      note: line.note,
    };
  }
  const vendor = await Vendor.findOne({ _id: line.accountRefId, businessId, deletedAt: { $exists: false } });
  if (!vendor) return null;
  return {
    accountType: "vendor",
    accountRefId: line.accountRefId,
    accountLabel: vendor.displayName,
    debitMinor: line.debitMinor,
    creditMinor: line.creditMinor,
    note: line.note,
  };
}

export async function createJournal(input: CreateJournalInput): Promise<JournalWriteResult> {
  await connectToDatabase();

  if (input.lines.length < 2) return { ok: false, reason: "invalid_line_count" };

  const business = await Business.findOne({ _id: input.businessId, deletedAt: { $exists: false } });
  if (!business) return { ok: false, reason: "business_not_found" };

  const resolvedLines: NonNullable<Awaited<ReturnType<typeof resolveLine>>>[] = [];
  for (const line of input.lines) {
    const resolved = await resolveLine(input.businessId, line);
    if (!resolved) return { ok: false, reason: "invalid_account_ref" };
    resolvedLines.push(resolved);
  }

  const totalDebitMinor = resolvedLines.reduce((s, l) => s + l.debitMinor, 0);
  const totalCreditMinor = resolvedLines.reduce((s, l) => s + l.creditMinor, 0);
  if (totalDebitMinor !== totalCreditMinor) return { ok: false, reason: "unbalanced" };
  if (totalDebitMinor === 0) return { ok: false, reason: "empty_entry" };

  const conn = await connectToDatabase();
  const session = await conn.startSession();
  try {
    let result!: JournalWriteResult;
    await session.withTransaction(async () => {
      const numbering = business.preferences?.documentNumbering;
      const config = resolveNumberingConfig(numbering, "journal");
      const seriesKey = resolveSeriesKey(input.journalDate, numbering?.fyStartMonth ?? 4, config.resetPolicy);
      const number = await reserveNextDocumentNumber(input.businessId, "journal", seriesKey, session);
      const docNumber = formatDocumentNumber(config, seriesKey, number);

      const [journalDoc] = await Journal.create(
        [
          {
            businessId: input.businessId,
            docNumber,
            seriesKey,
            journalDate: input.journalDate,
            narration: input.narration,
            lines: resolvedLines,
            totalMinor: totalDebitMinor,
            createdByUserId: input.createdByUserId,
          },
        ],
        { session },
      );
      result = { ok: true, journal: journalDoc };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export type JournalListParams = {
  search?: string;
  tab?: "active" | "deleted";
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
};

export async function listJournals(businessId: string, params: JournalListParams = {}) {
  await connectToDatabase();
  const filter: Record<string, unknown> = {
    businessId,
    deletedAt: params.tab === "deleted" ? { $exists: true } : { $exists: false },
  };
  if (params.search) filter.narration = { $regex: params.search.trim(), $options: "i" };
  if (params.dateFrom || params.dateTo) {
    const range: Record<string, Date> = {};
    if (params.dateFrom) range.$gte = params.dateFrom;
    if (params.dateTo) range.$lte = params.dateTo;
    filter.journalDate = range;
  }
  return paginate(Journal, filter, {
    page: params.page,
    pageSize: params.pageSize,
    sort: { journalDate: -1, createdAt: -1 },
  });
}

export async function findJournalById(journalId: string, businessId: string) {
  await connectToDatabase();
  return Journal.findOne({ _id: journalId, businessId });
}

export async function softDeleteJournal(journalId: string, businessId: string) {
  await connectToDatabase();
  return Journal.findOneAndUpdate(
    { _id: journalId, businessId, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
}

export async function restoreJournal(journalId: string, businessId: string) {
  await connectToDatabase();
  return Journal.findOneAndUpdate(
    { _id: journalId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

export type { JournalDoc };
