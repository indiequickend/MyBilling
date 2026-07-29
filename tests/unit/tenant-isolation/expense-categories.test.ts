import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import {
  createExpenseCategory,
  updateExpenseCategory,
  softDeleteExpenseCategory,
  restoreExpenseCategory,
  isOwnedExpenseCategory,
  listExpenseCategories,
  findOrCreateExpenseCategoryByName,
} from "@/lib/db/queries/expenseCategories";
import { ExpenseCategory } from "@/lib/db/models/ExpenseCategory";

describe("expense categories — tenant isolation", () => {
  let tenants: TwoTenants;

  beforeAll(async () => {
    tenants = await setupTwoTenants("expense-categories");
  });

  afterAll(async () => {
    await ExpenseCategory.deleteMany({ businessId: { $in: [tenants.businessAId, tenants.businessBId] } });
    await teardownTwoTenants(tenants);
  });

  it("isOwnedExpenseCategory returns false for a category belonging to a different business", async () => {
    const category = await createExpenseCategory({ businessId: tenants.businessAId, name: "Travel" });
    expect(await isOwnedExpenseCategory(String(category._id), tenants.businessAId)).toBe(true);
    expect(await isOwnedExpenseCategory(String(category._id), tenants.businessBId)).toBe(false);
  });

  it("updateExpenseCategory cannot modify another business's category", async () => {
    const category = await createExpenseCategory({ businessId: tenants.businessAId, name: "Utilities" });
    const result = await updateExpenseCategory(String(category._id), tenants.businessBId, {
      name: "Hijacked",
    });
    expect(result).toBeNull();
  });

  it("softDeleteExpenseCategory/restoreExpenseCategory never cross businesses", async () => {
    const category = await createExpenseCategory({ businessId: tenants.businessAId, name: "Supplies" });
    const id = String(category._id);

    expect(await softDeleteExpenseCategory(id, tenants.businessBId)).toBeNull();
    const stillActive = await listExpenseCategories(tenants.businessAId, "active");
    expect(stillActive.map((c) => String(c._id))).toContain(id);

    await softDeleteExpenseCategory(id, tenants.businessAId);
    expect(await restoreExpenseCategory(id, tenants.businessBId)).toBeNull();
    const restored = await restoreExpenseCategory(id, tenants.businessAId);
    expect(restored?.deletedAt).toBeUndefined();
  });

  it("findOrCreateExpenseCategoryByName is scoped per business and reuses an existing match", async () => {
    const first = await findOrCreateExpenseCategoryByName(tenants.businessAId, "Marketing");
    const second = await findOrCreateExpenseCategoryByName(tenants.businessAId, "Marketing");
    expect(String(first._id)).toBe(String(second._id));

    const otherBusiness = await findOrCreateExpenseCategoryByName(tenants.businessBId, "Marketing");
    expect(String(otherBusiness._id)).not.toBe(String(first._id));
  });

  it("listExpenseCategories never crosses businesses", async () => {
    const list = await listExpenseCategories(tenants.businessAId, "active");
    for (const c of list) {
      expect(String(c.businessId)).toBe(tenants.businessAId);
    }
  });
});
