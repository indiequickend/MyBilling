import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createVendor } from "@/lib/db/queries/vendors";
import { createBankAccount } from "@/lib/db/queries/bankAccounts";
import {
  createPurchase,
  updatePurchase,
  finalizePurchaseDraft,
  recordPurchasePayment,
  cancelPurchase,
  softDeletePurchase,
  restorePurchase,
  findPurchaseById,
  listPurchases,
  sumPurchaseTotals,
  type PurchaseWriteInput,
} from "@/lib/db/queries/purchases";
import { Purchase } from "@/lib/db/models/Purchase";
import { Payment } from "@/lib/db/models/Payment";
import { Vendor } from "@/lib/db/models/Vendor";
import { BankAccount } from "@/lib/db/models/BankAccount";
import { Business } from "@/lib/db/models/Business";

describe("purchases — tenant isolation", () => {
  let tenants: TwoTenants;
  let vendorAId: string;
  let vendorBId: string;
  let bankAId: string;
  let bankBId: string;

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
    tenants = await setupTwoTenants("purchases");
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

    const bankA = await createBankAccount({ businessId: tenants.businessAId, type: "cash", name: "Cash" });
    const bankB = await createBankAccount({ businessId: tenants.businessBId, type: "cash", name: "Cash" });
    bankAId = String(bankA._id);
    bankBId = String(bankB._id);
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      Purchase.deleteMany({ businessId: { $in: businessIds } }),
      Payment.deleteMany({ businessId: { $in: businessIds } }),
      Vendor.deleteMany({ businessId: { $in: businessIds } }),
      BankAccount.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  function baseInput(businessId: string, vendorId: string): PurchaseWriteInput {
    return {
      businessId,
      vendorId,
      purchaseDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: baseLineItems,
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
    };
  }

  it("createPurchase rejects a vendorId belonging to a different business", async () => {
    const result = await createPurchase({
      ...baseInput(tenants.businessAId, vendorBId),
      createdByUserId: tenants.userAId,
      finalize: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("vendor_not_found");
  });

  it("createPurchase rejects a bankAccountId belonging to a different business", async () => {
    const result = await createPurchase({
      ...baseInput(tenants.businessAId, vendorAId),
      bankAccountId: bankBId,
      createdByUserId: tenants.userAId,
      finalize: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_bank_account");
  });

  it("creates a draft purchase with no docNumber", async () => {
    const result = await createPurchase({
      ...baseInput(tenants.businessAId, vendorAId),
      createdByUserId: tenants.userAId,
      finalize: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.purchase.status).toBe("draft");
      expect(result.purchase.docNumber).toBeUndefined();
      expect(result.purchase.grandTotalMinor).toBe(118_000); // 2 x 500.00 @ 18% intra-state
    }
  });

  it("finalizing assigns a docNumber and the purchase is findable only within its own business", async () => {
    const created = await createPurchase({
      ...baseInput(tenants.businessAId, vendorAId),
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.purchase.docNumber).toMatch(/^PUR-/);
    expect(created.purchase.status).toBe("pending");

    const purchaseId = String(created.purchase._id);
    expect(await findPurchaseById(purchaseId, tenants.businessAId)).not.toBeNull();
    expect(await findPurchaseById(purchaseId, tenants.businessBId)).toBeNull();
  });

  it("finalize with an inline split payment marks the purchase partially_paid", async () => {
    const created = await createPurchase({
      ...baseInput(tenants.businessAId, vendorAId),
      createdByUserId: tenants.userAId,
      finalize: true,
      payments: [{ amountMinor: 50_000, mode: "cash", bankAccountId: bankAId, paymentDate: new Date() }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.purchase.status).toBe("partially_paid");
    expect(created.purchase.amountPaidMinor).toBe(50_000);
    expect(created.payments).toHaveLength(1);
    expect(created.payments[0].direction).toBe("out");
    expect(created.payments[0].partyType).toBe("vendor");
  });

  it("createPurchase rejects inline payments that exceed the grand total", async () => {
    const result = await createPurchase({
      ...baseInput(tenants.businessAId, vendorAId),
      createdByUserId: tenants.userAId,
      finalize: true,
      payments: [{ amountMinor: 999_999, mode: "cash", bankAccountId: bankAId, paymentDate: new Date() }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("payments_exceed_total");
  });

  it("updatePurchase cannot modify another business's purchase", async () => {
    const created = await createPurchase({
      ...baseInput(tenants.businessBId, vendorBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await updatePurchase(
      String(created.purchase._id),
      tenants.businessAId,
      baseInput(tenants.businessAId, vendorAId),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("a paid purchase cannot be edited", async () => {
    const created = await createPurchase({
      ...baseInput(tenants.businessAId, vendorAId),
      createdByUserId: tenants.userAId,
      finalize: true,
      payments: [{ amountMinor: 118_000, mode: "cash", bankAccountId: bankAId, paymentDate: new Date() }],
    });
    if (!created.ok) throw new Error("setup failed");
    expect(created.purchase.status).toBe("paid");

    const result = await updatePurchase(
      String(created.purchase._id),
      tenants.businessAId,
      baseInput(tenants.businessAId, vendorAId),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_editable");
  });

  it("finalizePurchaseDraft cannot finalize another business's draft", async () => {
    const created = await createPurchase({
      ...baseInput(tenants.businessBId, vendorBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await finalizePurchaseDraft(
      String(created.purchase._id),
      tenants.businessAId,
      baseInput(tenants.businessAId, vendorAId),
      undefined,
      tenants.userAId,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("recordPurchasePayment tops up a pending purchase to paid", async () => {
    const created = await createPurchase({
      ...baseInput(tenants.businessAId, vendorAId),
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await recordPurchasePayment(
      String(created.purchase._id),
      tenants.businessAId,
      [{ amountMinor: 118_000, mode: "cash", bankAccountId: bankAId, paymentDate: new Date() }],
      tenants.userAId,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.purchase.status).toBe("paid");
      expect(result.purchase.amountPaidMinor).toBe(118_000);
    }
  });

  it("cancelPurchase cannot cancel another business's purchase", async () => {
    const created = await createPurchase({
      ...baseInput(tenants.businessBId, vendorBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await cancelPurchase(String(created.purchase._id), tenants.businessAId);
    expect(result.ok).toBe(false);
  });

  it("softDeletePurchase refuses to delete a pending purchase but succeeds after cancelling it", async () => {
    const created = await createPurchase({
      ...baseInput(tenants.businessAId, vendorAId),
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    if (!created.ok) throw new Error("setup failed");
    const purchaseId = String(created.purchase._id);

    const blocked = await softDeletePurchase(purchaseId, tenants.businessAId);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("not_deletable");

    const cancelled = await cancelPurchase(purchaseId, tenants.businessAId);
    expect(cancelled.ok).toBe(true);

    const deleted = await softDeletePurchase(purchaseId, tenants.businessAId);
    expect(deleted.ok).toBe(true);

    const list = await listPurchases(tenants.businessAId, { tab: "deleted" });
    expect(list.items.map((p) => String(p._id))).toContain(purchaseId);

    await restorePurchase(purchaseId, tenants.businessAId);
  });

  it("listPurchases and sumPurchaseTotals never cross businesses", async () => {
    const list = await listPurchases(tenants.businessAId);
    for (const p of list.items) {
      expect(String(p.businessId)).toBe(tenants.businessAId);
    }

    const summaryA = await sumPurchaseTotals(tenants.businessAId);
    expect(summaryA.totalMinor).toBeGreaterThan(0);
    expect(summaryA.pendingMinor).toBe(summaryA.totalMinor - summaryA.paidMinor);
  });

  it("itcEligible on a line item defaults false when trackItcEligibility is off", async () => {
    const created = await createPurchase({
      ...baseInput(tenants.businessAId, vendorAId),
      createdByUserId: tenants.userAId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    expect(created.purchase.lineItems[0].itcEligible).toBe(false);
  });

  it("itcEligible on a line item defaults true when trackItcEligibility is on", async () => {
    await Business.updateOne(
      { _id: tenants.businessAId },
      { $set: { "preferences.document.purchases.trackItcEligibility": true } },
    );
    const created = await createPurchase({
      ...baseInput(tenants.businessAId, vendorAId),
      createdByUserId: tenants.userAId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    expect(created.purchase.lineItems[0].itcEligible).toBe(true);
    await Business.updateOne(
      { _id: tenants.businessAId },
      { $set: { "preferences.document.purchases.trackItcEligibility": false } },
    );
  });
});
