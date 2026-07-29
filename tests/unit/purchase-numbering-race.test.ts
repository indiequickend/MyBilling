import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "./helpers/twoTenants";
import { createVendor } from "@/lib/db/queries/vendors";
import { createPurchase } from "@/lib/db/queries/purchases";
import { Purchase } from "@/lib/db/models/Purchase";
import { Vendor } from "@/lib/db/models/Vendor";
import { Business } from "@/lib/db/models/Business";

describe("purchase numbering — concurrency", () => {
  let tenants: TwoTenants;
  let vendorAId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("purchase-numbering-race");
    await Business.updateOne(
      { _id: tenants.businessAId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );
    const vendor = await createVendor({ businessId: tenants.businessAId, displayName: "Race Vendor" });
    if (!vendor.ok) throw new Error("setup failed");
    vendorAId = String(vendor.vendor._id);
  });

  afterAll(async () => {
    await Purchase.deleteMany({ businessId: tenants.businessAId });
    await Vendor.deleteMany({ businessId: tenants.businessAId });
    await teardownTwoTenants(tenants);
  });

  it("N concurrent finalized purchase creations produce unique, gap-free document numbers", async () => {
    const concurrency = 8;
    const results = await Promise.all(
      Array.from({ length: concurrency }, () =>
        createPurchase({
          businessId: tenants.businessAId,
          vendorId: vendorAId,
          purchaseDate: new Date(),
          placeOfSupplyState: "Maharashtra",
          reverseCharge: false,
          lineItems: [
            {
              description: "Item",
              quantity: 1,
              unitPriceMinor: 1_000,
              discountType: "percentage",
              discountValue: 0,
              taxRatePercent: 0,
            },
          ],
          discountType: "percentage",
          discountValue: 0,
          discountTarget: "total",
          roundOff: false,
          createdByUserId: tenants.userAId,
          finalize: true,
        }),
      ),
    );

    const docNumbers = results.map((r) => {
      if (!r.ok) throw new Error(`a concurrent purchase creation failed: ${r.reason}`);
      return r.purchase.docNumber!;
    });

    expect(new Set(docNumbers).size).toBe(concurrency);

    const numbers = docNumbers.map((n) => Number(n.split("-").pop()));
    const sorted = [...numbers].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: concurrency }, (_, i) => i + 1));
  });
});
