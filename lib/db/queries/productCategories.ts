import { connectToDatabase } from "@/lib/db/connect";
import { ProductCategory } from "@/lib/db/models/ProductCategory";

export async function listProductCategories(
  businessId: string,
  tab: "active" | "deleted" = "active",
) {
  await connectToDatabase();
  const filter =
    tab === "active"
      ? { businessId, deletedAt: { $exists: false } }
      : { businessId, deletedAt: { $exists: true } };
  return ProductCategory.find(filter).sort({ name: 1 }).lean();
}

export async function findProductCategoryById(categoryId: string, businessId: string) {
  await connectToDatabase();
  return ProductCategory.findOne({ _id: categoryId, businessId });
}

/** Ownership check: is `categoryId` a non-deleted category belonging to `businessId`? */
export async function isOwnedProductCategory(
  categoryId: string,
  businessId: string,
): Promise<boolean> {
  await connectToDatabase();
  const count = await ProductCategory.countDocuments({
    _id: categoryId,
    businessId,
    deletedAt: { $exists: false },
  });
  return count > 0;
}

export async function createProductCategory(input: { businessId: string; name: string }) {
  await connectToDatabase();
  return ProductCategory.create(input);
}

export async function updateProductCategory(
  categoryId: string,
  businessId: string,
  updates: { name: string },
) {
  await connectToDatabase();
  return ProductCategory.findOneAndUpdate(
    { _id: categoryId, businessId },
    { $set: updates },
    { returnDocument: "after" },
  );
}

export async function softDeleteProductCategory(categoryId: string, businessId: string) {
  await connectToDatabase();
  return ProductCategory.findOneAndUpdate(
    { _id: categoryId, businessId, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
}

export async function restoreProductCategory(categoryId: string, businessId: string) {
  await connectToDatabase();
  return ProductCategory.findOneAndUpdate(
    { _id: categoryId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}
