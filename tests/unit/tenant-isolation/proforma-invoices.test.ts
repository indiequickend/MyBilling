import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createCustomer } from "@/lib/db/queries/customers";
import {
  createProformaInvoice,
  updateProformaInvoice,
  finalizeProformaInvoiceDraft,
  cancelProformaInvoice,
  softDeleteProformaInvoice,
  restoreProformaInvoice,
  findProformaInvoiceById,
  listProformaInvoices,
  type ProformaInvoiceWriteInput,
} from "@/lib/db/queries/proformaInvoices";
import { ProformaInvoice } from "@/lib/db/models/ProformaInvoice";
import { Customer } from "@/lib/db/models/Customer";
import { Business } from "@/lib/db/models/Business";

describe("proforma invoices — tenant isolation", () => {
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
    tenants = await setupTwoTenants("proforma-invoices");
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
      ProformaInvoice.deleteMany({ businessId: { $in: businessIds } }),
      Customer.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  function baseInput(businessId: string, customerId: string): ProformaInvoiceWriteInput {
    return {
      businessId,
      customerId,
      proformaDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: baseLineItems,
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
    };
  }

  it("createProformaInvoice rejects a customerId belonging to a different business", async () => {
    const result = await createProformaInvoice({
      ...baseInput(tenants.businessAId, customerBId),
      createdByUserId: tenants.userAId,
      finalize: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("customer_not_found");
  });

  it("finalizing assigns a docNumber and marks the proforma invoice open", async () => {
    const created = await createProformaInvoice({
      ...baseInput(tenants.businessAId, customerAId),
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.proformaInvoice.docNumber).toMatch(/^PI-/);
    expect(created.proformaInvoice.status).toBe("open");

    const id = String(created.proformaInvoice._id);
    expect(await findProformaInvoiceById(id, tenants.businessAId)).not.toBeNull();
    expect(await findProformaInvoiceById(id, tenants.businessBId)).toBeNull();
  });

  it("updateProformaInvoice cannot modify another business's proforma invoice", async () => {
    const created = await createProformaInvoice({
      ...baseInput(tenants.businessBId, customerBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await updateProformaInvoice(
      String(created.proformaInvoice._id),
      tenants.businessAId,
      baseInput(tenants.businessAId, customerAId),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("finalizeProformaInvoiceDraft cannot finalize another business's draft", async () => {
    const created = await createProformaInvoice({
      ...baseInput(tenants.businessBId, customerBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await finalizeProformaInvoiceDraft(
      String(created.proformaInvoice._id),
      tenants.businessAId,
      baseInput(tenants.businessAId, customerAId),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("cancelProformaInvoice cannot cancel another business's proforma invoice", async () => {
    const created = await createProformaInvoice({
      ...baseInput(tenants.businessBId, customerBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await cancelProformaInvoice(String(created.proformaInvoice._id), tenants.businessAId);
    expect(result.ok).toBe(false);
  });

  it("softDeleteProformaInvoice refuses to delete an open proforma invoice but succeeds after cancelling it", async () => {
    const created = await createProformaInvoice({
      ...baseInput(tenants.businessAId, customerAId),
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    if (!created.ok) throw new Error("setup failed");
    const id = String(created.proformaInvoice._id);

    const blocked = await softDeleteProformaInvoice(id, tenants.businessAId);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("not_deletable");

    const cancelled = await cancelProformaInvoice(id, tenants.businessAId);
    expect(cancelled.ok).toBe(true);

    const deleted = await softDeleteProformaInvoice(id, tenants.businessAId);
    expect(deleted.ok).toBe(true);

    const list = await listProformaInvoices(tenants.businessAId, { tab: "deleted" });
    expect(list.items.map((pi) => String(pi._id))).toContain(id);

    await restoreProformaInvoice(id, tenants.businessAId);
  });

  it("listProformaInvoices never crosses businesses", async () => {
    const list = await listProformaInvoices(tenants.businessAId);
    for (const pi of list.items) {
      expect(String(pi.businessId)).toBe(tenants.businessAId);
    }
  });
});
