import { connectToDatabase } from "@/lib/db/connect";
import { Warehouse } from "@/lib/db/models/Warehouse";
import type { AddressInput } from "@/lib/validation/shared";

export async function listWarehouses(businessId: string, tab: "active" | "deleted" = "active") {
  await connectToDatabase();
  const filter =
    tab === "active"
      ? { businessId, deletedAt: { $exists: false } }
      : { businessId, deletedAt: { $exists: true } };
  return Warehouse.find(filter).sort({ name: 1 }).lean();
}

export async function findWarehouseById(warehouseId: string, businessId: string) {
  await connectToDatabase();
  return Warehouse.findOne({ _id: warehouseId, businessId });
}

/** Ownership check: is `warehouseId` a non-deleted warehouse belonging to `businessId`? */
export async function isOwnedWarehouse(warehouseId: string, businessId: string): Promise<boolean> {
  await connectToDatabase();
  const count = await Warehouse.countDocuments({
    _id: warehouseId,
    businessId,
    deletedAt: { $exists: false },
  });
  return count > 0;
}

export async function createWarehouse(input: {
  businessId: string;
  name: string;
  address?: AddressInput;
}) {
  await connectToDatabase();
  return Warehouse.create(input);
}

export async function updateWarehouse(
  warehouseId: string,
  businessId: string,
  updates: { name?: string; address?: AddressInput },
) {
  await connectToDatabase();
  return Warehouse.findOneAndUpdate(
    { _id: warehouseId, businessId },
    { $set: updates },
    { returnDocument: "after" },
  );
}

/** Not transactional — acceptable for a low-concurrency settings action. */
export async function setDefaultWarehouse(warehouseId: string, businessId: string) {
  await connectToDatabase();
  await Warehouse.updateMany({ businessId, isDefault: true }, { $set: { isDefault: false } });
  return Warehouse.findOneAndUpdate(
    { _id: warehouseId, businessId },
    { $set: { isDefault: true } },
    { returnDocument: "after" },
  );
}

export async function softDeleteWarehouse(warehouseId: string, businessId: string) {
  await connectToDatabase();
  return Warehouse.findOneAndUpdate(
    { _id: warehouseId, businessId, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date(), isDefault: false } },
    { returnDocument: "after" },
  );
}

export async function restoreWarehouse(warehouseId: string, businessId: string) {
  await connectToDatabase();
  return Warehouse.findOneAndUpdate(
    { _id: warehouseId, businessId },
    { $unset: { deletedAt: "" } },
    { returnDocument: "after" },
  );
}
