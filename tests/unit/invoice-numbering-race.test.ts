import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "./helpers/twoTenants";
import { createCustomer } from "@/lib/db/queries/customers";
import { createInvoice } from "@/lib/db/queries/invoices";
import { Invoice } from "@/lib/db/models/Invoice";
import { Customer } from "@/lib/db/models/Customer";
import { Business } from "@/lib/db/models/Business";

describe("invoice numbering — concurrency", () => {
  let tenants: TwoTenants;
  let customerAId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("invoice-numbering-race");
    await Business.updateOne(
      { _id: tenants.businessAId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );
    const customer = await createCustomer({ businessId: tenants.businessAId, displayName: "Race Customer" });
    if (!customer.ok) throw new Error("setup failed");
    customerAId = String(customer.customer._id);
  });

  afterAll(async () => {
    await Invoice.deleteMany({ businessId: tenants.businessAId });
    await Customer.deleteMany({ businessId: tenants.businessAId });
    await teardownTwoTenants(tenants);
  });

  it("N concurrent finalized invoice creations produce unique, gap-free document numbers", async () => {
    const concurrency = 8;
    const results = await Promise.all(
      Array.from({ length: concurrency }, () =>
        createInvoice({
          businessId: tenants.businessAId,
          customerId: customerAId,
          invoiceDate: new Date(),
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
      if (!r.ok) throw new Error(`a concurrent invoice creation failed: ${r.reason}`);
      return r.invoice.docNumber!;
    });

    expect(new Set(docNumbers).size).toBe(concurrency);

    const numbers = docNumbers.map((n) => Number(n.split("-").pop()));
    const sorted = [...numbers].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: concurrency }, (_, i) => i + 1));
  });
});
