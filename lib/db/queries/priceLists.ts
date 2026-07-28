import { connectToDatabase } from "@/lib/db/connect";
import { PriceList } from "@/lib/db/models/PriceList";

export async function listPriceLists(businessId: string, tab: "active" | "deleted" = "active") {
  await connectToDatabase();
  const filter =
    tab === "active"
      ? { businessId, deletedAt: { $exists: false } }
      : { businessId, deletedAt: { $exists: true } };
  return PriceList.find(filter).sort({ name: 1 }).lean();
}

export async function findPriceListById(priceListId: string, businessId: string) {
  await connectToDatabase();
  return PriceList.findOne({ _id: priceListId, businessId });
}

/**
 * Returns the subset of the given ids that actually belong to `businessId` —
 * used to verify ownership of every priceListId a Product submits in its
 * priceOverrides before writing.
 */
export async function findOwnedPriceListIds(
  priceListIds: string[],
  businessId: string,
): Promise<string[]> {
  await connectToDatabase();
  if (priceListIds.length === 0) return [];
  const priceLists = await PriceList.find({
    _id: { $in: priceListIds },
    businessId,
    deletedAt: { $exists: false },
  })
    .select("_id")
    .lean();
  return priceLists.map((p) => String(p._id));
}

export async function createPriceList(input: {
  businessId: string;
  name: string;
  description?: string;
}) {
  await connectToDatabase();
  return PriceList.create(input);
}

export async function updatePriceList(
  priceListId: string,
  businessId: string,
  updates: { name?: string; description?: string },
) {
  await connectToDatabase();
  return PriceList.findOneAndUpdate(
    { _id: priceListId, businessId },
    { $set: updates },
    { returnDocument: "after" },
  );
}

/** Not transactional — acceptable for a low-concurrency settings action. */
export async function setDefaultPriceList(priceListId: string, businessId: string) {
  await connectToDatabase();
  await PriceList.updateMany({ businessId, isDefault: true }, { $set: { isDefault: false } });
  return PriceList.findOneAndUpdate(
    { _id: priceListId, businessId },
    { $set: { isDefault: true } },
    { returnDocument: "after" },
  );
}

export async function softDeletePriceList(priceListId: string, businessId: string) {
  await connectToDatabase();
  return PriceList.findOneAndUpdate(
    { _id: priceListId, businessId, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date(), isDefault: false } },
    { returnDocument: "after" },
  );
}

export async function restorePriceList(priceListId: string, businessId: string) {
  await connectToDatabase();
  return PriceList.findOneAndUpdate(
    { _id: priceListId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}
