import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createCustomer } from "@/lib/db/queries/customers";
import {
  createQuotation,
  updateQuotation,
  finalizeQuotationDraft,
  cancelQuotation,
  softDeleteQuotation,
  restoreQuotation,
  markQuotationClosed,
  findQuotationById,
  listQuotations,
  type QuotationWriteInput,
} from "@/lib/db/queries/quotations";
import { Quotation } from "@/lib/db/models/Quotation";
import { Customer } from "@/lib/db/models/Customer";
import { Business } from "@/lib/db/models/Business";

describe("quotations — tenant isolation", () => {
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
    tenants = await setupTwoTenants("quotations");
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
      Quotation.deleteMany({ businessId: { $in: businessIds } }),
      Customer.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  function baseInput(businessId: string, customerId: string): QuotationWriteInput {
    return {
      businessId,
      customerId,
      quotationDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: baseLineItems,
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
    };
  }

  it("createQuotation rejects a customerId belonging to a different business", async () => {
    const result = await createQuotation({
      ...baseInput(tenants.businessAId, customerBId),
      createdByUserId: tenants.userAId,
      finalize: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("customer_not_found");
  });

  it("finalizing assigns a docNumber and marks the quotation open", async () => {
    const created = await createQuotation({
      ...baseInput(tenants.businessAId, customerAId),
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.quotation.docNumber).toMatch(/^QUO-/);
    expect(created.quotation.status).toBe("open");

    const id = String(created.quotation._id);
    expect(await findQuotationById(id, tenants.businessAId)).not.toBeNull();
    expect(await findQuotationById(id, tenants.businessBId)).toBeNull();
  });

  it("updateQuotation cannot modify another business's quotation", async () => {
    const created = await createQuotation({
      ...baseInput(tenants.businessBId, customerBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await updateQuotation(
      String(created.quotation._id),
      tenants.businessAId,
      baseInput(tenants.businessAId, customerAId),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("finalizeQuotationDraft cannot finalize another business's draft", async () => {
    const created = await createQuotation({
      ...baseInput(tenants.businessBId, customerBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await finalizeQuotationDraft(
      String(created.quotation._id),
      tenants.businessAId,
      baseInput(tenants.businessAId, customerAId),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("cancelQuotation cannot cancel another business's quotation", async () => {
    const created = await createQuotation({
      ...baseInput(tenants.businessBId, customerBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await cancelQuotation(String(created.quotation._id), tenants.businessAId);
    expect(result.ok).toBe(false);
  });

  it("markQuotationClosed cannot close another business's quotation", async () => {
    const created = await createQuotation({
      ...baseInput(tenants.businessBId, customerBId),
      createdByUserId: tenants.userBId,
      finalize: true,
    });
    if (!created.ok) throw new Error("setup failed");
    const id = String(created.quotation._id);

    await markQuotationClosed(id, tenants.businessAId);
    const stillOpen = await findQuotationById(id, tenants.businessBId);
    expect(stillOpen?.status).toBe("open");

    await markQuotationClosed(id, tenants.businessBId);
    const nowClosed = await findQuotationById(id, tenants.businessBId);
    expect(nowClosed?.status).toBe("closed");
  });

  it("softDeleteQuotation refuses to delete an open quotation but succeeds after cancelling it", async () => {
    const created = await createQuotation({
      ...baseInput(tenants.businessAId, customerAId),
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    if (!created.ok) throw new Error("setup failed");
    const id = String(created.quotation._id);

    const blocked = await softDeleteQuotation(id, tenants.businessAId);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("not_deletable");

    const cancelled = await cancelQuotation(id, tenants.businessAId);
    expect(cancelled.ok).toBe(true);

    const deleted = await softDeleteQuotation(id, tenants.businessAId);
    expect(deleted.ok).toBe(true);

    const list = await listQuotations(tenants.businessAId, { tab: "deleted" });
    expect(list.items.map((q) => String(q._id))).toContain(id);

    await restoreQuotation(id, tenants.businessAId);
  });

  it("listQuotations never crosses businesses", async () => {
    const list = await listQuotations(tenants.businessAId);
    for (const q of list.items) {
      expect(String(q.businessId)).toBe(tenants.businessAId);
    }
  });
});
