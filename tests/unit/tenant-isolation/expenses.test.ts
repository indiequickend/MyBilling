import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createBankAccount } from "@/lib/db/queries/bankAccounts";
import { createExpenseCategory } from "@/lib/db/queries/expenseCategories";
import {
  createExpense,
  cancelExpense,
  softDeleteExpense,
  restoreExpense,
  findExpenseById,
  listExpenses,
  sumExpenseTotals,
} from "@/lib/db/queries/expenses";
import { listPaymentsForDocument } from "@/lib/db/queries/payments";
import { Expense } from "@/lib/db/models/Expense";
import { Payment } from "@/lib/db/models/Payment";
import { ExpenseCategory } from "@/lib/db/models/ExpenseCategory";
import { BankAccount } from "@/lib/db/models/BankAccount";

describe("expenses — tenant isolation", () => {
  let tenants: TwoTenants;
  let categoryAId: string;
  let categoryBId: string;
  let bankAId: string;
  let bankBId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("expenses");

    const categoryA = await createExpenseCategory({ businessId: tenants.businessAId, name: "Rent" });
    const categoryB = await createExpenseCategory({ businessId: tenants.businessBId, name: "Rent" });
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
      Expense.deleteMany({ businessId: { $in: businessIds } }),
      Payment.deleteMany({ businessId: { $in: businessIds } }),
      ExpenseCategory.deleteMany({ businessId: { $in: businessIds } }),
      BankAccount.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("createExpense rejects a categoryId belonging to a different business", async () => {
    const result = await createExpense({
      businessId: tenants.businessAId,
      categoryId: categoryBId,
      amountMinor: 10_000,
      mode: "cash",
      bankAccountId: bankAId,
      expenseDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_category");
  });

  it("createExpense rejects a bankAccountId belonging to a different business", async () => {
    const result = await createExpense({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 10_000,
      mode: "cash",
      bankAccountId: bankBId,
      expenseDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_bank_account");
  });

  it("creates an expense with a linked out-payment, findable only within its own business", async () => {
    const result = await createExpense({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 25_000,
      mode: "cash",
      bankAccountId: bankAId,
      expenseDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const id = String(result.expense._id);
    expect(await findExpenseById(id, tenants.businessAId)).not.toBeNull();
    expect(await findExpenseById(id, tenants.businessBId)).toBeNull();

    const payments = await listPaymentsForDocument("expense", id, tenants.businessAId);
    expect(payments).toHaveLength(1);
    expect(payments[0].direction).toBe("out");
    expect(payments[0].amountMinor).toBe(25_000);
  });

  it("cancelExpense cannot cancel another business's expense", async () => {
    const created = await createExpense({
      businessId: tenants.businessBId,
      categoryId: categoryBId,
      amountMinor: 5_000,
      mode: "cash",
      bankAccountId: bankBId,
      expenseDate: new Date(),
      createdByUserId: tenants.userBId,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await cancelExpense(String(created.expense._id), tenants.businessAId);
    expect(result.ok).toBe(false);
  });

  it("softDeleteExpense refuses to delete a recorded expense but succeeds after cancelling it", async () => {
    const created = await createExpense({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 1_000,
      mode: "cash",
      bankAccountId: bankAId,
      expenseDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    if (!created.ok) throw new Error("setup failed");
    const id = String(created.expense._id);

    const blocked = await softDeleteExpense(id, tenants.businessAId);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("not_deletable");

    const cancelled = await cancelExpense(id, tenants.businessAId);
    expect(cancelled.ok).toBe(true);

    const deleted = await softDeleteExpense(id, tenants.businessAId);
    expect(deleted.ok).toBe(true);

    const list = await listExpenses(tenants.businessAId, { tab: "deleted" });
    expect(list.items.map((e) => String(e._id))).toContain(id);

    await restoreExpense(id, tenants.businessAId);
  });

  it("listExpenses never crosses businesses", async () => {
    const list = await listExpenses(tenants.businessAId);
    for (const e of list.items) {
      expect(String(e.businessId)).toBe(tenants.businessAId);
    }
  });

  it("sumExpenseTotals only sums recorded expenses within its own business and date range", async () => {
    const dateFrom = new Date("2030-01-01");
    const dateTo = new Date("2030-01-31");

    const inRange = await createExpense({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 7_000,
      mode: "cash",
      bankAccountId: bankAId,
      expenseDate: new Date("2030-01-15"),
      createdByUserId: tenants.userAId,
    });
    const outOfRange = await createExpense({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 9_000,
      mode: "cash",
      bankAccountId: bankAId,
      expenseDate: new Date("2030-02-15"),
      createdByUserId: tenants.userAId,
    });
    const otherBusiness = await createExpense({
      businessId: tenants.businessBId,
      categoryId: categoryBId,
      amountMinor: 50_000,
      mode: "cash",
      bankAccountId: bankBId,
      expenseDate: new Date("2030-01-15"),
      createdByUserId: tenants.userBId,
    });
    if (!inRange.ok || !outOfRange.ok || !otherBusiness.ok) throw new Error("setup failed");

    const totals = await sumExpenseTotals(tenants.businessAId, { dateFrom, dateTo });
    expect(totals.totalMinor).toBe(7_000);

    const cancelled = await cancelExpense(String(inRange.expense._id), tenants.businessAId);
    expect(cancelled.ok).toBe(true);
    const totalsAfterCancel = await sumExpenseTotals(tenants.businessAId, { dateFrom, dateTo });
    expect(totalsAfterCancel.totalMinor).toBe(0);
  });
});
