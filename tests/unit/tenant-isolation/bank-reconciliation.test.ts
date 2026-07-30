import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createBankAccount } from "@/lib/db/queries/bankAccounts";
import { createPayment } from "@/lib/db/queries/payments";
import {
  importBankStatement,
  listStatementLines,
  listUnmatchedPayments,
  matchStatementLine,
  unmatchStatementLine,
} from "@/lib/db/queries/bankReconciliation";
import { BankStatementLine } from "@/lib/db/models/BankStatementLine";
import { BankAccount } from "@/lib/db/models/BankAccount";
import { Payment } from "@/lib/db/models/Payment";
import mongoose from "mongoose";

describe("bank reconciliation — tenant isolation", () => {
  let tenants: TwoTenants;
  let bankAId: string;
  let bankBId: string;
  let paymentAId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("bank-reconciliation");

    const bankA = await createBankAccount({ businessId: tenants.businessAId, type: "bank", name: "Bank A" });
    bankAId = String(bankA._id);
    const bankB = await createBankAccount({ businessId: tenants.businessBId, type: "bank", name: "Bank B" });
    bankBId = String(bankB._id);

    const payment = await createPayment({
      businessId: tenants.businessAId,
      direction: "in",
      amountMinor: 15_000,
      mode: "bank_transfer",
      bankAccountId: bankAId,
      paymentDate: new Date(),
      linkedDocumentType: "expense",
      linkedDocumentId: String(new mongoose.Types.ObjectId()),
      createdByUserId: tenants.userAId,
    });
    paymentAId = String(payment._id);
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      BankStatementLine.deleteMany({ businessId: { $in: businessIds } }),
      Payment.deleteMany({ businessId: { $in: businessIds } }),
      BankAccount.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("importBankStatement rejects a bank account belonging to a different business", async () => {
    const result = await importBankStatement(
      tenants.businessAId,
      bankBId,
      [{ statementDate: new Date(), amountMinor: 1_000, direction: "credit" }],
      tenants.userAId,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_bank_account");
  });

  it("importBankStatement auto-matches an exact-amount, same-direction Payment within the date window", async () => {
    const result = await importBankStatement(
      tenants.businessAId,
      bankAId,
      [
        { statementDate: new Date(), amountMinor: 15_000, direction: "credit" },
        { statementDate: new Date(), amountMinor: 99_999, direction: "debit" },
      ],
      tenants.userAId,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.autoMatched).toBe(1);

    const { items: unmatched } = await listStatementLines(tenants.businessAId, bankAId, { matched: false });
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].amountMinor).toBe(99_999);

    const { items: matched } = await listStatementLines(tenants.businessAId, bankAId, { matched: true });
    expect(matched).toHaveLength(1);
    expect(String(matched[0].matchedPaymentId)).toBe(paymentAId);
  });

  it("listStatementLines never returns another business's lines", async () => {
    const crossed = await listStatementLines(tenants.businessBId, bankBId);
    expect(crossed.items).toHaveLength(0);
  });

  it("listUnmatchedPayments never returns another business's payments", async () => {
    const crossed = await listUnmatchedPayments(tenants.businessBId, bankBId);
    expect(crossed).toHaveLength(0);
  });

  it("matchStatementLine cannot pair a line and payment across businesses", async () => {
    const { items: unmatchedLines } = await listStatementLines(tenants.businessAId, bankAId, { matched: false });
    const lineId = String(unmatchedLines[0]._id);

    const result = await matchStatementLine(lineId, paymentAId, tenants.businessBId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("the partial unique index prevents matching one Payment to two statement lines", async () => {
    const { items: matched } = await listStatementLines(tenants.businessAId, bankAId, { matched: true });
    const alreadyMatchedLineId = String(matched[0]._id);

    const secondImport = await importBankStatement(
      tenants.businessAId,
      bankAId,
      [{ statementDate: new Date(), amountMinor: 500, direction: "credit" }],
      tenants.userAId,
    );
    expect(secondImport.ok).toBe(true);
    const { items: freshUnmatched } = await listStatementLines(tenants.businessAId, bankAId, {
      matched: false,
    });
    const otherLineId = String(freshUnmatched.find((l) => l.amountMinor === 500)?._id);

    const attempt = await matchStatementLine(otherLineId, paymentAId, tenants.businessAId);
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.reason).toBe("already_matched");

    // Sanity: the original match is still intact and unaffected.
    const stillMatched = await BankStatementLine.findById(alreadyMatchedLineId);
    expect(String(stillMatched?.matchedPaymentId)).toBe(paymentAId);
  });

  it("unmatchStatementLine frees the payment for a subsequent manual match, scoped to the caller's business", async () => {
    const { items: matched } = await listStatementLines(tenants.businessAId, bankAId, { matched: true });
    const lineId = String(matched[0]._id);

    const crossUnmatch = await unmatchStatementLine(lineId, tenants.businessBId);
    expect(crossUnmatch.ok).toBe(false);

    const result = await unmatchStatementLine(lineId, tenants.businessAId);
    expect(result.ok).toBe(true);

    const unmatchedPayments = await listUnmatchedPayments(tenants.businessAId, bankAId);
    expect(unmatchedPayments.map((p) => String(p._id))).toContain(paymentAId);
  });
});
