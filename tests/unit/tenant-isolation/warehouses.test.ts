import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import {
  listWarehouses,
  findWarehouseById,
  isOwnedWarehouse,
  createWarehouse,
  setDefaultWarehouse,
  softDeleteWarehouse,
} from "@/lib/db/queries/warehouses";
import { Warehouse } from "@/lib/db/models/Warehouse";

describe("warehouses — tenant isolation", () => {
  let tenants: TwoTenants;
  let warehouseAId: string;
  let warehouseBId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("warehouses");
    const warehouseA = await createWarehouse({
      businessId: tenants.businessAId,
      name: "Main Store",
    });
    const warehouseB = await createWarehouse({
      businessId: tenants.businessBId,
      name: "Main Store",
    });
    warehouseAId = String(warehouseA._id);
    warehouseBId = String(warehouseB._id);
  });

  afterAll(async () => {
    await Warehouse.deleteMany({ businessId: { $in: [tenants.businessAId, tenants.businessBId] } });
    await teardownTwoTenants(tenants);
  });

  it("listWarehouses/findWarehouseById never cross businesses", async () => {
    const warehousesA = await listWarehouses(tenants.businessAId);
    expect(warehousesA.map((w) => String(w._id))).toContain(warehouseAId);
    expect(warehousesA.map((w) => String(w._id))).not.toContain(warehouseBId);
    expect(await findWarehouseById(warehouseBId, tenants.businessAId)).toBeNull();
  });

  it("isOwnedWarehouse rejects a warehouse belonging to another business", async () => {
    expect(await isOwnedWarehouse(warehouseAId, tenants.businessAId)).toBe(true);
    expect(await isOwnedWarehouse(warehouseBId, tenants.businessAId)).toBe(false);
  });

  it("setDefaultWarehouse only affects the targeted business's warehouses", async () => {
    await setDefaultWarehouse(warehouseAId, tenants.businessAId);

    const warehouseA = await findWarehouseById(warehouseAId, tenants.businessAId);
    const warehouseB = await findWarehouseById(warehouseBId, tenants.businessBId);
    expect(warehouseA?.isDefault).toBe(true);
    expect(warehouseB?.isDefault).toBe(false);
  });

  it("soft-deleting a warehouse moves it out of the active list without deleting the document", async () => {
    await softDeleteWarehouse(warehouseBId, tenants.businessBId);

    const activeB = await listWarehouses(tenants.businessBId, "active");
    expect(activeB.map((w) => String(w._id))).not.toContain(warehouseBId);

    const stillExists = await Warehouse.findById(warehouseBId);
    expect(stillExists).not.toBeNull();
  });
});
