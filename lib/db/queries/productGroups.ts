import { connectToDatabase } from "@/lib/db/connect";
import { ProductGroup } from "@/lib/db/models/ProductGroup";

export async function listProductGroups(businessId: string, tab: "active" | "deleted" = "active") {
  await connectToDatabase();
  const filter =
    tab === "active"
      ? { businessId, deletedAt: { $exists: false } }
      : { businessId, deletedAt: { $exists: true } };
  return ProductGroup.find(filter).sort({ name: 1 }).lean();
}

export async function findProductGroupById(groupId: string, businessId: string) {
  await connectToDatabase();
  return ProductGroup.findOne({ _id: groupId, businessId });
}

/** Ownership check: is `groupId` a non-deleted group belonging to `businessId`? */
export async function isOwnedProductGroup(groupId: string, businessId: string): Promise<boolean> {
  await connectToDatabase();
  const count = await ProductGroup.countDocuments({
    _id: groupId,
    businessId,
    deletedAt: { $exists: false },
  });
  return count > 0;
}

export async function createProductGroup(input: { businessId: string; name: string }) {
  await connectToDatabase();
  return ProductGroup.create(input);
}

export async function updateProductGroup(
  groupId: string,
  businessId: string,
  updates: { name: string },
) {
  await connectToDatabase();
  return ProductGroup.findOneAndUpdate(
    { _id: groupId, businessId },
    { $set: updates },
    { returnDocument: "after" },
  );
}

export async function softDeleteProductGroup(groupId: string, businessId: string) {
  await connectToDatabase();
  return ProductGroup.findOneAndUpdate(
    { _id: groupId, businessId, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" },
  );
}

export async function restoreProductGroup(groupId: string, businessId: string) {
  await connectToDatabase();
  return ProductGroup.findOneAndUpdate(
    { _id: groupId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}

/** Finds or creates a group by name — used by the bulk CSV import, which accepts a free-text
 * group column rather than requiring the user to pre-create every group first. */
export async function findOrCreateProductGroupByName(businessId: string, name: string) {
  await connectToDatabase();
  const trimmed = name.trim();
  const existing = await ProductGroup.findOne({
    businessId,
    name: trimmed,
    deletedAt: { $exists: false },
  });
  if (existing) return existing;
  return ProductGroup.create({ businessId, name: trimmed });
}
