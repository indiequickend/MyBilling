import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createVendor } from "@/lib/db/queries/vendors";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  finalizePurchaseOrderDraft,
  cancelPurchaseOrder,
  softDeletePurchaseOrder,
  restorePurchaseOrder,
  markPurchaseOrderClosed,
  findPurchaseOrderById,
  listPurchaseOrders,
  type PurchaseOrderWriteInput,
} from "@/lib/db/queries/purchaseOrders";
import { PurchaseOrder } from "@/lib/db/models/PurchaseOrder";
import { Vendor } from "@/lib/db/models/Vendor";
import { Business } from "@/lib/db/models/Business";

describe("purchase orders — tenant isolation", () => {
  let tenants: TwoTenants;
  let vendorAId: string;
  let vendorBId: string;

  const baseLineItems = [
    {
      description: "Raw material",
      quantity: 2,
      unitPriceMinor: 50_000,
      discountType: "percentage" as const,
      discountValue: 0,
      taxRatePercent: 18,
    },
  ];

  beforeAll(async () => {
    tenants = await setupTwoTenants("purchase-orders");
    await Business.updateOne(
      { _id: tenants.businessAId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );
    await Business.updateOne(
      { _id: tenants.businessBId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );

    const vendorA = await createVendor({ businessId: tenants.businessAId, displayName: "Vendor A" });
    const vendorB = await createVendor({ businessId: tenants.businessBId, displayName: "Vendor B" });
    if (!vendorA.ok || !vendorB.ok) throw new Error("setup failed");
    vendorAId = String(vendorA.vendor._id);
    vendorBId = String(vendorB.vendor._id);
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      PurchaseOrder.deleteMany({ businessId: { $in: businessIds } }),
      Vendor.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  function baseInput(businessId: string, vendorId: string): PurchaseOrderWriteInput {
    return {
      businessId,
      vendorId,
      orderDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: baseLineItems,
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
    };
  }

  it("createPurchaseOrder rejects a vendorId belonging to a different business", async () => {
    const result = await createPurchaseOrder({
      ...baseInput(tenants.businessAId, vendorBId),
      createdByUserId: tenants.userAId,
      finalize: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("vendor_not_found");
  });

  it("finalizing assigns a docNumber and marks the order open", async () => {
    const created = await createPurchaseOrder({
      ...baseInput(tenants.businessAId, vendorAId),
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.purchaseOrder.docNumber).toMatch(/^PO-/);
    expect(created.purchaseOrder.status).toBe("open");

    const id = String(created.purchaseOrder._id);
    expect(await findPurchaseOrderById(id, tenants.businessAId)).not.toBeNull();
    expect(await findPurchaseOrderById(id, tenants.businessBId)).toBeNull();
  });

  it("updatePurchaseOrder cannot modify another business's order", async () => {
    const created = await createPurchaseOrder({
      ...baseInput(tenants.businessBId, vendorBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await updatePurchaseOrder(
      String(created.purchaseOrder._id),
      tenants.businessAId,
      baseInput(tenants.businessAId, vendorAId),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("finalizePurchaseOrderDraft cannot finalize another business's draft", async () => {
    const created = await createPurchaseOrder({
      ...baseInput(tenants.businessBId, vendorBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await finalizePurchaseOrderDraft(
      String(created.purchaseOrder._id),
      tenants.businessAId,
      baseInput(tenants.businessAId, vendorAId),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("cancelPurchaseOrder cannot cancel another business's order", async () => {
    const created = await createPurchaseOrder({
      ...baseInput(tenants.businessBId, vendorBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await cancelPurchaseOrder(String(created.purchaseOrder._id), tenants.businessAId);
    expect(result.ok).toBe(false);
  });

  it("markPurchaseOrderClosed cannot close another business's order", async () => {
    const created = await createPurchaseOrder({
      ...baseInput(tenants.businessBId, vendorBId),
      createdByUserId: tenants.userBId,
      finalize: true,
    });
    if (!created.ok) throw new Error("setup failed");
    const id = String(created.purchaseOrder._id);

    await markPurchaseOrderClosed(id, tenants.businessAId);
    const stillOpen = await findPurchaseOrderById(id, tenants.businessBId);
    expect(stillOpen?.status).toBe("open");

    await markPurchaseOrderClosed(id, tenants.businessBId);
    const nowClosed = await findPurchaseOrderById(id, tenants.businessBId);
    expect(nowClosed?.status).toBe("closed");
  });

  it("softDeletePurchaseOrder refuses to delete an open order but succeeds after cancelling it", async () => {
    const created = await createPurchaseOrder({
      ...baseInput(tenants.businessAId, vendorAId),
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    if (!created.ok) throw new Error("setup failed");
    const id = String(created.purchaseOrder._id);

    const blocked = await softDeletePurchaseOrder(id, tenants.businessAId);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("not_deletable");

    const cancelled = await cancelPurchaseOrder(id, tenants.businessAId);
    expect(cancelled.ok).toBe(true);

    const deleted = await softDeletePurchaseOrder(id, tenants.businessAId);
    expect(deleted.ok).toBe(true);

    const list = await listPurchaseOrders(tenants.businessAId, { tab: "deleted" });
    expect(list.items.map((p) => String(p._id))).toContain(id);

    await restorePurchaseOrder(id, tenants.businessAId);
  });

  it("listPurchaseOrders never crosses businesses", async () => {
    const list = await listPurchaseOrders(tenants.businessAId);
    for (const po of list.items) {
      expect(String(po.businessId)).toBe(tenants.businessAId);
    }
  });
});
