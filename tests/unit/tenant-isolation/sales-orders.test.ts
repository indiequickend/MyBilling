import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createCustomer } from "@/lib/db/queries/customers";
import {
  createSalesOrder,
  updateSalesOrder,
  finalizeSalesOrderDraft,
  cancelSalesOrder,
  softDeleteSalesOrder,
  restoreSalesOrder,
  markSalesOrderClosed,
  findSalesOrderById,
  listSalesOrders,
  type SalesOrderWriteInput,
} from "@/lib/db/queries/salesOrders";
import { SalesOrder } from "@/lib/db/models/SalesOrder";
import { Customer } from "@/lib/db/models/Customer";
import { Business } from "@/lib/db/models/Business";

describe("sales orders — tenant isolation", () => {
  let tenants: TwoTenants;
  let customerAId: string;
  let customerBId: string;

  const baseLineItems = [
    {
      description: "Consulting",
      quantity: 2,
      unitPriceMinor: 50_000,
      discountType: "percentage" as const,
      discountValue: 0,
      taxRatePercent: 18,
    },
  ];

  beforeAll(async () => {
    tenants = await setupTwoTenants("sales-orders");
    await Business.updateOne(
      { _id: tenants.businessAId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );
    await Business.updateOne(
      { _id: tenants.businessBId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );

    const customerA = await createCustomer({ businessId: tenants.businessAId, displayName: "Customer A" });
    const customerB = await createCustomer({ businessId: tenants.businessBId, displayName: "Customer B" });
    if (!customerA.ok || !customerB.ok) throw new Error("setup failed");
    customerAId = String(customerA.customer._id);
    customerBId = String(customerB.customer._id);
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      SalesOrder.deleteMany({ businessId: { $in: businessIds } }),
      Customer.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  function baseInput(businessId: string, customerId: string): SalesOrderWriteInput {
    return {
      businessId,
      customerId,
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

  it("createSalesOrder rejects a customerId belonging to a different business", async () => {
    const result = await createSalesOrder({
      ...baseInput(tenants.businessAId, customerBId),
      createdByUserId: tenants.userAId,
      finalize: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("customer_not_found");
  });

  it("finalizing assigns a docNumber and marks the sales order open", async () => {
    const created = await createSalesOrder({
      ...baseInput(tenants.businessAId, customerAId),
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.salesOrder.docNumber).toMatch(/^SO-/);
    expect(created.salesOrder.status).toBe("open");

    const id = String(created.salesOrder._id);
    expect(await findSalesOrderById(id, tenants.businessAId)).not.toBeNull();
    expect(await findSalesOrderById(id, tenants.businessBId)).toBeNull();
  });

  it("updateSalesOrder cannot modify another business's sales order", async () => {
    const created = await createSalesOrder({
      ...baseInput(tenants.businessBId, customerBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await updateSalesOrder(
      String(created.salesOrder._id),
      tenants.businessAId,
      baseInput(tenants.businessAId, customerAId),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("finalizeSalesOrderDraft cannot finalize another business's draft", async () => {
    const created = await createSalesOrder({
      ...baseInput(tenants.businessBId, customerBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await finalizeSalesOrderDraft(
      String(created.salesOrder._id),
      tenants.businessAId,
      baseInput(tenants.businessAId, customerAId),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("cancelSalesOrder cannot cancel another business's sales order", async () => {
    const created = await createSalesOrder({
      ...baseInput(tenants.businessBId, customerBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await cancelSalesOrder(String(created.salesOrder._id), tenants.businessAId);
    expect(result.ok).toBe(false);
  });

  it("markSalesOrderClosed cannot close another business's sales order", async () => {
    const created = await createSalesOrder({
      ...baseInput(tenants.businessBId, customerBId),
      createdByUserId: tenants.userBId,
      finalize: true,
    });
    if (!created.ok) throw new Error("setup failed");
    const id = String(created.salesOrder._id);

    await markSalesOrderClosed(id, tenants.businessAId);
    const stillOpen = await findSalesOrderById(id, tenants.businessBId);
    expect(stillOpen?.status).toBe("open");

    await markSalesOrderClosed(id, tenants.businessBId);
    const nowClosed = await findSalesOrderById(id, tenants.businessBId);
    expect(nowClosed?.status).toBe("closed");
  });

  it("softDeleteSalesOrder refuses to delete an open sales order but succeeds after cancelling it", async () => {
    const created = await createSalesOrder({
      ...baseInput(tenants.businessAId, customerAId),
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    if (!created.ok) throw new Error("setup failed");
    const id = String(created.salesOrder._id);

    const blocked = await softDeleteSalesOrder(id, tenants.businessAId);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("not_deletable");

    const cancelled = await cancelSalesOrder(id, tenants.businessAId);
    expect(cancelled.ok).toBe(true);

    const deleted = await softDeleteSalesOrder(id, tenants.businessAId);
    expect(deleted.ok).toBe(true);

    const list = await listSalesOrders(tenants.businessAId, { tab: "deleted" });
    expect(list.items.map((so) => String(so._id))).toContain(id);

    await restoreSalesOrder(id, tenants.businessAId);
  });

  it("listSalesOrders never crosses businesses", async () => {
    const list = await listSalesOrders(tenants.businessAId);
    for (const so of list.items) {
      expect(String(so.businessId)).toBe(tenants.businessAId);
    }
  });
});
