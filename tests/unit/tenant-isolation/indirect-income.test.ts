import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createBankAccount } from "@/lib/db/queries/bankAccounts";
import { createExpenseCategory } from "@/lib/db/queries/expenseCategories";
import {
  createIndirectIncome,
  updateIndirectIncome,
  cancelIndirectIncome,
  softDeleteIndirectIncome,
  restoreIndirectIncome,
  findIndirectIncomeById,
  listIndirectIncome,
  sumIndirectIncomeTotals,
} from "@/lib/db/queries/indirectIncome";
import { listPaymentsForDocument } from "@/lib/db/queries/payments";
import { IndirectIncome } from "@/lib/db/models/IndirectIncome";
import { Payment } from "@/lib/db/models/Payment";
import { ExpenseCategory } from "@/lib/db/models/ExpenseCategory";
import { BankAccount } from "@/lib/db/models/BankAccount";

describe("indirect income — tenant isolation", () => {
  let tenants: TwoTenants;
  let categoryAId: string;
  let categoryBId: string;
  let bankAId: string;
  let bankBId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("indirect-income");

    const categoryA = await createExpenseCategory({ businessId: tenants.businessAId, name: "Interest" });
    const categoryB = await createExpenseCategory({ businessId: tenants.businessBId, name: "Interest" });
    categoryAId = String(categoryA._id);
    categoryBId = String(categoryB._id);

    const bankA = await createBankAccount({ businessId: tenants.businessAId, type: "cash", name: "Cash" });
    const bankB = await createBankAccount({ businessId: tenants.businessBId, type: "cash", name: "Cash" });
    bankAId = String(bankA._id);
    bankBId = String(bankB._id);
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      IndirectIncome.deleteMany({ businessId: { $in: businessIds } }),
      Payment.deleteMany({ businessId: { $in: businessIds } }),
      ExpenseCategory.deleteMany({ businessId: { $in: businessIds } }),
      BankAccount.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("createIndirectIncome rejects a categoryId belonging to a different business", async () => {
    const result = await createIndirectIncome({
      businessId: tenants.businessAId,
      categoryId: categoryBId,
      amountMinor: 10_000,
      mode: "cash",
      bankAccountId: bankAId,
      incomeDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_category");
  });

  it("creates an entry with a linked in-payment, findable only within its own business", async () => {
    const result = await createIndirectIncome({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 15_000,
      mode: "cash",
      bankAccountId: bankAId,
      incomeDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const id = String(result.indirectIncome._id);
    expect(await findIndirectIncomeById(id, tenants.businessAId)).not.toBeNull();
    expect(await findIndirectIncomeById(id, tenants.businessBId)).toBeNull();

    const payments = await listPaymentsForDocument("indirect_income", id, tenants.businessAId);
    expect(payments).toHaveLength(1);
    expect(payments[0].direction).toBe("in");
  });

  it("cancelIndirectIncome cannot cancel another business's entry", async () => {
    const created = await createIndirectIncome({
      businessId: tenants.businessBId,
      categoryId: categoryBId,
      amountMinor: 5_000,
      mode: "cash",
      bankAccountId: bankBId,
      incomeDate: new Date(),
      createdByUserId: tenants.userBId,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await cancelIndirectIncome(String(created.indirectIncome._id), tenants.businessAId);
    expect(result.ok).toBe(false);
  });

  it("softDeleteIndirectIncome refuses to delete a recorded entry but succeeds after cancelling it", async () => {
    const created = await createIndirectIncome({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 1_000,
      mode: "cash",
      bankAccountId: bankAId,
      incomeDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    if (!created.ok) throw new Error("setup failed");
    const id = String(created.indirectIncome._id);

    const blocked = await softDeleteIndirectIncome(id, tenants.businessAId);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("not_deletable");

    const cancelled = await cancelIndirectIncome(id, tenants.businessAId);
    expect(cancelled.ok).toBe(true);

    const deleted = await softDeleteIndirectIncome(id, tenants.businessAId);
    expect(deleted.ok).toBe(true);

    const list = await listIndirectIncome(tenants.businessAId, { tab: "deleted" });
    expect(list.items.map((e) => String(e._id))).toContain(id);

    await restoreIndirectIncome(id, tenants.businessAId);
  });

  it("updateIndirectIncome edits the entry and keeps its linked payment in sync, but never touches another business's entry", async () => {
    const secondBankA = await createBankAccount({ businessId: tenants.businessAId, type: "bank", name: "Second Account A" });
    const secondBankAId = String(secondBankA._id);

    const created = await createIndirectIncome({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 10_000,
      mode: "cash",
      bankAccountId: bankAId,
      incomeDate: new Date("2030-05-01"),
      createdByUserId: tenants.userAId,
    });
    if (!created.ok) throw new Error("setup failed");
    const id = String(created.indirectIncome._id);

    const crossTenant = await updateIndirectIncome(id, tenants.businessBId, {
      categoryId: categoryBId,
      amountMinor: 99_999,
      mode: "cash",
      bankAccountId: bankBId,
      incomeDate: new Date("2030-05-02"),
    });
    expect(crossTenant.ok).toBe(false);
    if (!crossTenant.ok) expect(crossTenant.reason).toBe("not_editable");

    const updated = await updateIndirectIncome(id, tenants.businessAId, {
      categoryId: categoryAId,
      amountMinor: 40_000,
      mode: "upi",
      bankAccountId: secondBankAId,
      incomeDate: new Date("2030-05-03"),
      description: "Updated description",
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) {
      expect(updated.indirectIncome.amountMinor).toBe(40_000);
      expect(updated.indirectIncome.mode).toBe("upi");
      expect(String(updated.indirectIncome.bankAccountId)).toBe(secondBankAId);
      expect(updated.indirectIncome.description).toBe("Updated description");
    }

    const payments = await listPaymentsForDocument("indirect_income", id, tenants.businessAId);
    expect(payments).toHaveLength(1);
    expect(payments[0].amountMinor).toBe(40_000);
    expect(payments[0].mode).toBe("upi");
    expect(String(payments[0].bankAccountId)).toBe(secondBankAId);
  });

  it("updateIndirectIncome refuses to edit a cancelled entry", async () => {
    const created = await createIndirectIncome({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 2_000,
      mode: "cash",
      bankAccountId: bankAId,
      incomeDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    if (!created.ok) throw new Error("setup failed");
    const id = String(created.indirectIncome._id);

    const cancelled = await cancelIndirectIncome(id, tenants.businessAId);
    expect(cancelled.ok).toBe(true);

    const result = await updateIndirectIncome(id, tenants.businessAId, {
      categoryId: categoryAId,
      amountMinor: 1,
      mode: "cash",
      bankAccountId: bankAId,
      incomeDate: new Date(),
    });
    expect(result).toEqual({ ok: false, reason: "not_editable" });
  });

  it("cancelIndirectIncome voids its linked payment so it stops showing in the Payments Timeline", async () => {
    const created = await createIndirectIncome({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 179_000,
      mode: "cash",
      bankAccountId: bankAId,
      incomeDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    if (!created.ok) throw new Error("setup failed");
    const id = String(created.indirectIncome._id);

    const before = await listPaymentsForDocument("indirect_income", id, tenants.businessAId);
    expect(before).toHaveLength(1);
    expect(before[0].voidedAt).toBeUndefined();

    const cancelled = await cancelIndirectIncome(id, tenants.businessAId);
    expect(cancelled.ok).toBe(true);

    const after = await listPaymentsForDocument("indirect_income", id, tenants.businessAId);
    expect(after).toHaveLength(1);
    expect(after[0].voidedAt).toBeInstanceOf(Date);
  });

  it("cancelIndirectIncome never voids a different business's payment for a same-shaped entry", async () => {
    const createdA = await createIndirectIncome({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 4_242,
      mode: "cash",
      bankAccountId: bankAId,
      incomeDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    const createdB = await createIndirectIncome({
      businessId: tenants.businessBId,
      categoryId: categoryBId,
      amountMinor: 4_242,
      mode: "cash",
      bankAccountId: bankBId,
      incomeDate: new Date(),
      createdByUserId: tenants.userBId,
    });
    if (!createdA.ok || !createdB.ok) throw new Error("setup failed");

    const cancelled = await cancelIndirectIncome(String(createdA.indirectIncome._id), tenants.businessAId);
    expect(cancelled.ok).toBe(true);

    const paymentsB = await listPaymentsForDocument(
      "indirect_income",
      String(createdB.indirectIncome._id),
      tenants.businessBId,
    );
    expect(paymentsB).toHaveLength(1);
    expect(paymentsB[0].voidedAt).toBeUndefined();
  });

  it("listIndirectIncome never crosses businesses", async () => {
    const list = await listIndirectIncome(tenants.businessAId);
    for (const e of list.items) {
      expect(String(e.businessId)).toBe(tenants.businessAId);
    }
  });

  it("sumIndirectIncomeTotals only sums recorded entries within its own business and date range", async () => {
    const dateFrom = new Date("2030-01-01");
    const dateTo = new Date("2030-01-31");

    const inRange = await createIndirectIncome({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 6_000,
      mode: "cash",
      bankAccountId: bankAId,
      incomeDate: new Date("2030-01-10"),
      createdByUserId: tenants.userAId,
    });
    const outOfRange = await createIndirectIncome({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 8_000,
      mode: "cash",
      bankAccountId: bankAId,
      incomeDate: new Date("2030-03-10"),
      createdByUserId: tenants.userAId,
    });
    const otherBusiness = await createIndirectIncome({
      businessId: tenants.businessBId,
      categoryId: categoryBId,
      amountMinor: 40_000,
      mode: "cash",
      bankAccountId: bankBId,
      incomeDate: new Date("2030-01-10"),
      createdByUserId: tenants.userBId,
    });
    if (!inRange.ok || !outOfRange.ok || !otherBusiness.ok) throw new Error("setup failed");

    const totals = await sumIndirectIncomeTotals(tenants.businessAId, { dateFrom, dateTo });
    expect(totals.totalMinor).toBe(6_000);
  });
});
