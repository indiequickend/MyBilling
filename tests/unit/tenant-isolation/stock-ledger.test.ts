import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createProduct } from "@/lib/db/queries/products";
import { createWarehouse } from "@/lib/db/queries/warehouses";
import {
  getCurrentBalance,
  recordManualStockMovement,
  listStockLedger,
} from "@/lib/db/queries/stockLedger";
import { Product } from "@/lib/db/models/Product";
import { Warehouse } from "@/lib/db/models/Warehouse";
import { StockLedgerEntry } from "@/lib/db/models/StockLedgerEntry";

describe("stock ledger — tenant isolation", () => {
  let tenants: TwoTenants;
  let productAId: string;
  let productBId: string;
  let warehouseAId: string;
  let warehouseBId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("stock-ledger");

    const warehouseA = await createWarehouse({ businessId: tenants.businessAId, name: "Main" });
    const warehouseB = await createWarehouse({ businessId: tenants.businessBId, name: "Main" });
    warehouseAId = String(warehouseA._id);
    warehouseBId = String(warehouseB._id);

    const productA = await createProduct({
      businessId: tenants.businessAId,
      name: "Tracked Widget",
      type: "product",
      sellingPriceMinor: 10_000,
      purchasePriceMinor: 5_000,
      priceIsTaxInclusive: false,
      taxRatePercent: 0,
      stockTracking: { enabled: true, batchTracked: false, serialTracked: false },
    });
    const productB = await createProduct({
      businessId: tenants.businessBId,
      name: "Tracked Widget",
      type: "product",
      sellingPriceMinor: 10_000,
      priceIsTaxInclusive: false,
      taxRatePercent: 0,
      stockTracking: { enabled: true, batchTracked: false, serialTracked: false },
    });
    if (!productA.ok || !productB.ok) throw new Error("setup failed");
    productAId = String(productA.product._id);
    productBId = String(productB.product._id);

    const moveA = await recordManualStockMovement({
      businessId: tenants.businessAId,
      productId: productAId,
      warehouseId: warehouseAId,
      direction: "in",
      quantity: 10,
      note: "opening stock",
      createdByUserId: tenants.userAId,
    });
    const moveB = await recordManualStockMovement({
      businessId: tenants.businessBId,
      productId: productBId,
      warehouseId: warehouseBId,
      direction: "in",
      quantity: 5,
      note: "opening stock",
      createdByUserId: tenants.userBId,
    });
    if (!moveA.ok || !moveB.ok) throw new Error("setup failed");
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      StockLedgerEntry.deleteMany({ businessId: { $in: businessIds } }),
      Product.deleteMany({ businessId: { $in: businessIds } }),
      Warehouse.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("getCurrentBalance is scoped per business's own product/warehouse", async () => {
    const balanceA = await getCurrentBalance({
      businessId: tenants.businessAId,
      productId: productAId,
      warehouseId: warehouseAId,
    });
    expect(balanceA).toBe(10);

    const balanceB = await getCurrentBalance({
      businessId: tenants.businessBId,
      productId: productBId,
      warehouseId: warehouseBId,
    });
    expect(balanceB).toBe(5);
  });

  it("recordManualStockMovement rejects a product belonging to a different business", async () => {
    const result = await recordManualStockMovement({
      businessId: tenants.businessAId,
      productId: productBId,
      warehouseId: warehouseAId,
      direction: "in",
      quantity: 1,
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("product_not_found");
  });

  it("recordManualStockMovement rejects a warehouse belonging to a different business", async () => {
    const result = await recordManualStockMovement({
      businessId: tenants.businessAId,
      productId: productAId,
      warehouseId: warehouseBId,
      direction: "in",
      quantity: 1,
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_warehouse");
  });

  it("listStockLedger never returns another business's entries", async () => {
    const { items } = await listStockLedger(tenants.businessAId);
    for (const entry of items) {
      expect(String(entry.businessId)).toBe(tenants.businessAId);
    }
    expect(items.map((e) => String(e.productId))).not.toContain(productBId);
  });
});
