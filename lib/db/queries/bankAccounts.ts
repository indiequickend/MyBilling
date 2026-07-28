import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { BankAccount } from "@/lib/db/models/BankAccount";
import { BankTransfer } from "@/lib/db/models/BankTransfer";
import { Invoice } from "@/lib/db/models/Invoice";
import { Payment } from "@/lib/db/models/Payment";
import { paginate } from "@/lib/db/queryHelpers";
import type { BankAccountType } from "@/lib/constants/payments";

export async function listBankAccounts(businessId: string, tab: "active" | "deleted" = "active") {
  await connectToDatabase();
  const filter =
    tab === "active"
      ? { businessId, deletedAt: { $exists: false } }
      : { businessId, deletedAt: { $exists: true } };
  return BankAccount.find(filter).sort({ name: 1 }).lean();
}

export async function findBankAccountById(bankAccountId: string, businessId: string) {
  await connectToDatabase();
  return BankAccount.findOne({ _id: bankAccountId, businessId });
}

export async function isOwnedBankAccount(bankAccountId: string, businessId: string): Promise<boolean> {
  await connectToDatabase();
  const count = await BankAccount.countDocuments({
    _id: bankAccountId,
    businessId,
    deletedAt: { $exists: false },
  });
  return count > 0;
}

export type BankAccountInput = {
  businessId: string;
  type: BankAccountType;
  name: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifsc?: string;
  upiId?: string;
  openingBalanceMinor?: number;
};

export async function createBankAccount(input: BankAccountInput) {
  await connectToDatabase();
  return BankAccount.create(input);
}

export async function updateBankAccount(
  bankAccountId: string,
  businessId: string,
  updates: Partial<Omit<BankAccountInput, "businessId">>,
) {
  await connectToDatabase();
  return BankAccount.findOneAndUpdate(
    { _id: bankAccountId, businessId },
    { $set: updates },
    { returnDocument: "after" },
  );
}

/** Not transactional — acceptable for a low-concurrency settings action. */
export async function setDefaultBankAccount(bankAccountId: string, businessId: string) {
  await connectToDatabase();
  await BankAccount.updateMany({ businessId, isDefault: true }, { $set: { isDefault: false } });
  return BankAccount.findOneAndUpdate(
    { _id: bankAccountId, businessId },
    { $set: { isDefault: true } },
    { returnDocument: "after" },
  );
}

export type BankAccountDeleteResult = { ok: true } | { ok: false; reason: "not_found" | "in_use" };

/**
 * Implements project_spec.md's "deleting an account referenced by existing documents is
 * blocked/warned" — an invoice/payment/transfer that references this account would otherwise be
 * left with a dangling/misleading reference.
 */
export async function softDeleteBankAccount(
  bankAccountId: string,
  businessId: string,
): Promise<BankAccountDeleteResult> {
  await connectToDatabase();
  const [invoiceCount, paymentCount, transferCount] = await Promise.all([
    Invoice.countDocuments({ businessId, bankAccountId }),
    Payment.countDocuments({ businessId, bankAccountId }),
    BankTransfer.countDocuments({
      businessId,
      $or: [{ fromAccountId: bankAccountId }, { toAccountId: bankAccountId }],
    }),
  ]);
  if (invoiceCount > 0 || paymentCount > 0 || transferCount > 0) {
    return { ok: false, reason: "in_use" };
  }
  const updated = await BankAccount.findOneAndUpdate(
    { _id: bankAccountId, businessId, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date(), isDefault: false } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, reason: "not_found" };
  return { ok: true };
}

export async function restoreBankAccount(bankAccountId: string, businessId: string) {
  await connectToDatabase();
  return BankAccount.findOneAndUpdate(
    { _id: bankAccountId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

export type TransferFundsInput = {
  businessId: string;
  fromAccountId: string;
  toAccountId: string;
  amountMinor: number;
  transferDate: Date;
  note?: string;
  createdByUserId: string;
};

export type TransferFundsResult =
  | { ok: true; transfer: InstanceType<typeof BankTransfer> }
  | { ok: false; reason: "invalid_accounts" | "same_account" };

/** A single-document insert is inherently atomic — no transaction needed here. */
export async function transferFunds(input: TransferFundsInput): Promise<TransferFundsResult> {
  await connectToDatabase();
  if (input.fromAccountId === input.toAccountId) return { ok: false, reason: "same_account" };
  const [fromOwned, toOwned] = await Promise.all([
    isOwnedBankAccount(input.fromAccountId, input.businessId),
    isOwnedBankAccount(input.toAccountId, input.businessId),
  ]);
  if (!fromOwned || !toOwned) return { ok: false, reason: "invalid_accounts" };
  const transfer = await BankTransfer.create(input);
  return { ok: true, transfer };
}

export async function listBankTransfers(
  businessId: string,
  params: { page?: number; pageSize?: number } = {},
) {
  await connectToDatabase();
  return paginate(BankTransfer, { businessId }, { ...params, sort: { transferDate: -1 } });
}

/**
 * Sum of Payment amounts + BankTransfer legs for this account — balances stay derived, not
 * cached. `aggregate()` (unlike `find()`) does not cast string ids against the schema, so ids
 * are converted to real ObjectId instances before use in `$match`.
 */
export async function getBankAccountBalance(bankAccountId: string, businessId: string): Promise<number> {
  await connectToDatabase();
  const businessObjectId = new mongoose.Types.ObjectId(businessId);
  const accountObjectId = new mongoose.Types.ObjectId(bankAccountId);

  const [account, paymentAgg, transferInAgg, transferOutAgg] = await Promise.all([
    BankAccount.findOne({ _id: bankAccountId, businessId }).select("openingBalanceMinor").lean(),
    Payment.aggregate([
      {
        $match: {
          businessId: businessObjectId,
          bankAccountId: accountObjectId,
          voidedAt: { $exists: false },
        },
      },
      { $group: { _id: "$direction", total: { $sum: "$amountMinor" } } },
    ]),
    BankTransfer.aggregate([
      { $match: { businessId: businessObjectId, toAccountId: accountObjectId } },
      { $group: { _id: null, total: { $sum: "$amountMinor" } } },
    ]),
    BankTransfer.aggregate([
      { $match: { businessId: businessObjectId, fromAccountId: accountObjectId } },
      { $group: { _id: null, total: { $sum: "$amountMinor" } } },
    ]),
  ]);
  if (!account) return 0;
  const paymentsIn = paymentAgg.find((p) => p._id === "in")?.total ?? 0;
  const paymentsOut = paymentAgg.find((p) => p._id === "out")?.total ?? 0;
  const transfersIn = transferInAgg[0]?.total ?? 0;
  const transfersOut = transferOutAgg[0]?.total ?? 0;
  return (account.openingBalanceMinor ?? 0) + paymentsIn - paymentsOut + transfersIn - transfersOut;
}
