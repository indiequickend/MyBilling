import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createVendor } from "@/lib/db/queries/vendors";
import { createPurchase } from "@/lib/db/queries/purchases";
import {
  createDebitNote,
  cancelDebitNote,
  softDeleteDebitNote,
  restoreDebitNote,
  findDebitNoteById,
  listDebitNotes,
  sumDebitNoteTotals,
} from "@/lib/db/queries/debitNotes";
import { getPartyLedger } from "@/lib/db/queries/payments";
import { DebitNote } from "@/lib/db/models/DebitNote";
import { Purchase } from "@/lib/db/models/Purchase";
import { Vendor } from "@/lib/db/models/Vendor";
import { Business } from "@/lib/db/models/Business";

describe("debit notes — tenant isolation", () => {
  let tenants: TwoTenants;
  let vendorAId: string;
  let vendorBId: string;
  let purchaseAId: string;
  let purchaseBId: string;

  const lineItems = [
    {
      description: "Raw material",
      quantity: 1,
      unitPriceMinor: 100_000,
      discountType: "percentage" as const,
      discountValue: 0,
      taxRatePercent: 0,
    },
  ];

  beforeAll(async () => {
    tenants = await setupTwoTenants("debit-notes");
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

    const purchaseA = await createPurchase({
      businessId: tenants.businessAId,
      vendorId: vendorAId,
      purchaseDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems,
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    const purchaseB = await createPurchase({
      businessId: tenants.businessBId,
      vendorId: vendorBId,
      purchaseDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems,
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userBId,
      finalize: true,
    });
    if (!purchaseA.ok || !purchaseB.ok) throw new Error("setup failed");
    purchaseAId = String(purchaseA.purchase._id);
    purchaseBId = String(purchaseB.purchase._id);
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      DebitNote.deleteMany({ businessId: { $in: businessIds } }),
      Purchase.deleteMany({ businessId: { $in: businessIds } }),
      Vendor.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("createDebitNote rejects a linkedPurchaseId belonging to a different business", async () => {
    const result = await createDebitNote({
      businessId: tenants.businessAId,
      linkedPurchaseId: purchaseBId,
      debitNoteDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      lineItems: [{ ...lineItems[0], unitPriceMinor: 20_000 }],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("purchase_not_found");
  });

  it("creates an issued debit note and reduces the vendor ledger balance (credit)", async () => {
    const result = await createDebitNote({
      businessId: tenants.businessAId,
      linkedPurchaseId: purchaseAId,
      debitNoteDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      lineItems: [{ ...lineItems[0], unitPriceMinor: 20_000 }],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.debitNote.docNumber).toMatch(/^DN-/);
    expect(result.debitNote.status).toBe("issued");

    const id = String(result.debitNote._id);
    expect(await findDebitNoteById(id, tenants.businessAId)).not.toBeNull();
    expect(await findDebitNoteById(id, tenants.businessBId)).toBeNull();

    const ledger = await getPartyLedger("vendor", vendorAId, tenants.businessAId);
    const debitNoteEntry = ledger.items.find((e) => e.type === "debit_note");
    expect(debitNoteEntry).toBeDefined();
    expect(debitNoteEntry?.creditMinor).toBe(20_000);
    expect(debitNoteEntry?.debitMinor).toBe(0);
  });

  it("cancelDebitNote cannot cancel another business's debit note", async () => {
    const created = await createDebitNote({
      businessId: tenants.businessBId,
      linkedPurchaseId: purchaseBId,
      debitNoteDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      lineItems: [{ ...lineItems[0], unitPriceMinor: 10_000 }],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userBId,
      finalize: true,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await cancelDebitNote(String(created.debitNote._id), tenants.businessAId);
    expect(result.ok).toBe(false);
  });

  it("softDeleteDebitNote refuses to delete an issued note but succeeds after cancelling it", async () => {
    const created = await createDebitNote({
      businessId: tenants.businessAId,
      linkedPurchaseId: purchaseAId,
      debitNoteDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      lineItems: [{ ...lineItems[0], unitPriceMinor: 5_000 }],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    if (!created.ok) throw new Error("setup failed");
    const id = String(created.debitNote._id);

    const blocked = await softDeleteDebitNote(id, tenants.businessAId);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("not_deletable");

    const cancelled = await cancelDebitNote(id, tenants.businessAId);
    expect(cancelled.ok).toBe(true);

    const deleted = await softDeleteDebitNote(id, tenants.businessAId);
    expect(deleted.ok).toBe(true);

    const list = await listDebitNotes(tenants.businessAId, { tab: "deleted" });
    expect(list.items.map((dn) => String(dn._id))).toContain(id);

    await restoreDebitNote(id, tenants.businessAId);
  });

  it("listDebitNotes never crosses businesses", async () => {
    const list = await listDebitNotes(tenants.businessAId);
    for (const dn of list.items) {
      expect(String(dn.businessId)).toBe(tenants.businessAId);
    }
  });

  it("sumDebitNoteTotals only sums issued debit notes within its own business", async () => {
    const before = await sumDebitNoteTotals(tenants.businessAId);

    const issued = await createDebitNote({
      businessId: tenants.businessAId,
      linkedPurchaseId: purchaseAId,
      debitNoteDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      lineItems: [{ ...lineItems[0], unitPriceMinor: 15_000 }],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    const otherBusiness = await createDebitNote({
      businessId: tenants.businessBId,
      linkedPurchaseId: purchaseBId,
      debitNoteDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      lineItems: [{ ...lineItems[0], unitPriceMinor: 60_000 }],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userBId,
      finalize: true,
    });
    if (!issued.ok || !otherBusiness.ok) throw new Error("setup failed");

    const after = await sumDebitNoteTotals(tenants.businessAId);
    expect(after.totalMinor - before.totalMinor).toBe(15_000);
  });
});
