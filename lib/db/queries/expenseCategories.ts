import { connectToDatabase } from "@/lib/db/connect";
import { ExpenseCategory } from "@/lib/db/models/ExpenseCategory";

export async function listExpenseCategories(businessId: string, tab: "active" | "deleted" = "active") {
  await connectToDatabase();
  const filter =
    tab === "active"
      ? { businessId, deletedAt: { $exists: false } }
      : { businessId, deletedAt: { $exists: true } };
  return ExpenseCategory.find(filter).sort({ name: 1 }).lean();
}

export async function findExpenseCategoryById(categoryId: string, businessId: string) {
  await connectToDatabase();
  return ExpenseCategory.findOne({ _id: categoryId, businessId });
}

/** Ownership check: is `categoryId` a non-deleted category belonging to `businessId`? */
export async function isOwnedExpenseCategory(categoryId: string, businessId: string): Promise<boolean> {
  await connectToDatabase();
  const count = await ExpenseCategory.countDocuments({
    _id: categoryId,
    businessId,
    deletedAt: { $exists: false },
  });
  return count > 0;
}

export async function createExpenseCategory(input: { businessId: string; name: string }) {
  await connectToDatabase();
  return ExpenseCategory.create(input);
}

export async function updateExpenseCategory(
  categoryId: string,
  businessId: string,
  updates: { name: string },
) {
  await connectToDatabase();
  return ExpenseCategory.findOneAndUpdate(
    { _id: categoryId, businessId },
    { $set: updates },
    { returnDocument: "after" },
  );
}

export async function softDeleteExpenseCategory(categoryId: string, businessId: string) {
  await connectToDatabase();
  return ExpenseCategory.findOneAndUpdate(
    { _id: categoryId, businessId, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
}

export async function restoreExpenseCategory(categoryId: string, businessId: string) {
  await connectToDatabase();
  return ExpenseCategory.findOneAndUpdate(
    { _id: categoryId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

/** Finds or creates a category by name — used by the bulk CSV import, which accepts a free-text
 * category column rather than requiring the user to pre-create every category first. */
export async function findOrCreateExpenseCategoryByName(businessId: string, name: string) {
  await connectToDatabase();
  const trimmed = name.trim();
  const existing = await ExpenseCategory.findOne({
    businessId,
    name: trimmed,
    deletedAt: { $exists: false },
  });
  if (existing) return existing;
  return ExpenseCategory.create({ businessId, name: trimmed });
}
