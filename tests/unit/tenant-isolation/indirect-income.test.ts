import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createBankAccount } from "@/lib/db/queries/bankAccounts";
import { createExpenseCategory } from "@/lib/db/queries/expenseCategories";
import {
  createIndirectIncome,
  cancelIndirectIncome,
  softDeleteIndirectIncome,
  restoreIndirectIncome,
  findIndirectIncomeById,
  listIndirectIncome,
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

  it("listIndirectIncome never crosses businesses", async () => {
    const list = await listIndirectIncome(tenants.businessAId);
    for (const e of list.items) {
      expect(String(e.businessId)).toBe(tenants.businessAId);
    }
  });
});
