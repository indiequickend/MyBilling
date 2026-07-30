import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createBankAccount } from "@/lib/db/queries/bankAccounts";
import { createPayment, listPaymentsTimeline, sumPaymentsTimeline } from "@/lib/db/queries/payments";
import { Payment } from "@/lib/db/models/Payment";
import { BankAccount } from "@/lib/db/models/BankAccount";
import mongoose from "mongoose";

describe("payments timeline — tenant isolation and totals", () => {
  let tenants: TwoTenants;
  let bankAId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("payments-timeline");

    const bankA = await createBankAccount({ businessId: tenants.businessAId, type: "bank", name: "Bank A" });
    bankAId = String(bankA._id);
    const bankB = await createBankAccount({ businessId: tenants.businessBId, type: "bank", name: "Bank B" });

    // Business A: two "in" payments and one "out" payment.
    await createPayment({
      businessId: tenants.businessAId,
      direction: "in",
      amountMinor: 30_000,
      mode: "bank_transfer",
      bankAccountId: bankAId,
      paymentDate: new Date(),
      linkedDocumentType: "expense",
      linkedDocumentId: String(new mongoose.Types.ObjectId()),
      createdByUserId: tenants.userAId,
    });
    await createPayment({
      businessId: tenants.businessAId,
      direction: "in",
      amountMinor: 20_000,
      mode: "cash",
      bankAccountId: bankAId,
      paymentDate: new Date(),
      linkedDocumentType: "expense",
      linkedDocumentId: String(new mongoose.Types.ObjectId()),
      createdByUserId: tenants.userAId,
    });
    await createPayment({
      businessId: tenants.businessAId,
      direction: "out",
      amountMinor: 12_000,
      mode: "cash",
      bankAccountId: bankAId,
      paymentDate: new Date(),
      linkedDocumentType: "expense",
      linkedDocumentId: String(new mongoose.Types.ObjectId()),
      createdByUserId: tenants.userAId,
    });

    // Business B: one large "in" payment that must never leak into A's totals.
    await createPayment({
      businessId: tenants.businessBId,
      direction: "in",
      amountMinor: 999_999,
      mode: "cash",
      bankAccountId: String(bankB._id),
      paymentDate: new Date(),
      linkedDocumentType: "expense",
      linkedDocumentId: String(new mongoose.Types.ObjectId()),
      createdByUserId: tenants.userBId,
    });
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      Payment.deleteMany({ businessId: { $in: businessIds } }),
      BankAccount.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("listPaymentsTimeline never returns another business's payments", async () => {
    const { items } = await listPaymentsTimeline(tenants.businessAId);
    expect(items).toHaveLength(3);
    expect(items.every((p) => p.amountMinor !== 999_999)).toBe(true);
  });

  it("sumPaymentsTimeline matches a hand-tallied total for the filtered set, scoped per business", async () => {
    const totalsA = await sumPaymentsTimeline(tenants.businessAId);
    expect(totalsA.receivedMinor).toBe(50_000); // 30_000 + 20_000
    expect(totalsA.givenMinor).toBe(12_000);
    expect(totalsA.netBalanceMinor).toBe(38_000); // received - given

    const totalsB = await sumPaymentsTimeline(tenants.businessBId);
    expect(totalsB.receivedMinor).toBe(999_999);
    expect(totalsB.givenMinor).toBe(0);
    expect(totalsB.netBalanceMinor).toBe(999_999);
  });

  it("sumPaymentsTimeline respects the direction filter", async () => {
    const receivedOnly = await sumPaymentsTimeline(tenants.businessAId, { direction: "in" });
    expect(receivedOnly.receivedMinor).toBe(50_000);
    expect(receivedOnly.givenMinor).toBe(0);
  });
});
