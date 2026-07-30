import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createCustomer } from "@/lib/db/queries/customers";
import { createVendor } from "@/lib/db/queries/vendors";
import { createInvoice } from "@/lib/db/queries/invoices";
import { createPurchase } from "@/lib/db/queries/purchases";
import { getItemSalesReport, getItemPurchaseReport } from "@/lib/db/queries/itemReports";
import { getBillWiseItemReport } from "@/lib/db/queries/billWiseItemReport";
import { Invoice } from "@/lib/db/models/Invoice";
import { Purchase } from "@/lib/db/models/Purchase";
import { Customer } from "@/lib/db/models/Customer";
import { Vendor } from "@/lib/db/models/Vendor";
import { Business } from "@/lib/db/models/Business";

describe("item reports and bill-wise item report — tenant isolation", () => {
  let tenants: TwoTenants;
  let customerAId: string;
  let vendorAId: string;
  let customerBId: string;
  let vendorBId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("item-reports");
    await Business.updateOne(
      { _id: tenants.businessAId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );
    await Business.updateOne(
      { _id: tenants.businessBId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );

    const [customerA, customerB, vendorA, vendorB] = await Promise.all([
      createCustomer({ businessId: tenants.businessAId, displayName: "Customer A" }),
      createCustomer({ businessId: tenants.businessBId, displayName: "Customer B" }),
      createVendor({ businessId: tenants.businessAId, displayName: "Vendor A" }),
      createVendor({ businessId: tenants.businessBId, displayName: "Vendor B" }),
    ]);
    if (!customerA.ok || !customerB.ok || !vendorA.ok || !vendorB.ok) throw new Error("setup failed");
    customerAId = String(customerA.customer._id);
    customerBId = String(customerB.customer._id);
    vendorAId = String(vendorA.vendor._id);
    vendorBId = String(vendorB.vendor._id);

    const invoiceA = await createInvoice({
      businessId: tenants.businessAId,
      customerId: customerAId,
      invoiceDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "Widget",
          hsnOrSac: "8501",
          quantity: 3,
          unitPriceMinor: 10_000,
          discountType: "percentage",
          discountValue: 0,
          taxRatePercent: 18,
        },
      ],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    const purchaseA = await createPurchase({
      businessId: tenants.businessAId,
      vendorId: vendorAId,
      purchaseDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "Component",
          hsnOrSac: "8502",
          quantity: 5,
          unitPriceMinor: 4_000,
          discountType: "percentage",
          discountValue: 0,
          taxRatePercent: 18,
        },
      ],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    if (!invoiceA.ok || !purchaseA.ok) throw new Error("setup failed");

    const invoiceB = await createInvoice({
      businessId: tenants.businessBId,
      customerId: customerBId,
      invoiceDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "Other tenant widget",
          hsnOrSac: "9999",
          quantity: 99,
          unitPriceMinor: 500_000,
          discountType: "percentage",
          discountValue: 0,
          taxRatePercent: 18,
        },
      ],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userBId,
      finalize: true,
    });
    if (!invoiceB.ok) throw new Error("setup failed");
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      Invoice.deleteMany({ businessId: { $in: businessIds } }),
      Purchase.deleteMany({ businessId: { $in: businessIds } }),
      Customer.deleteMany({ businessId: { $in: businessIds } }),
      Vendor.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("getItemSalesReport sums quantity/taxable/tax per product, scoped per business", async () => {
    const rowsA = await getItemSalesReport(tenants.businessAId);
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].quantity).toBe(3);
    expect(rowsA[0].taxableAmountMinor).toBe(30_000);
    expect(rowsA[0].taxMinor).toBe(5_400);
    expect(rowsA[0].totalMinor).toBe(35_400);
  });

  it("getItemPurchaseReport sums quantity/taxable/tax per product, scoped per business", async () => {
    const rowsA = await getItemPurchaseReport(tenants.businessAId);
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].quantity).toBe(5);
    expect(rowsA[0].taxableAmountMinor).toBe(20_000);
  });

  it("getBillWiseItemReport flattens per-document line items, scoped per business", async () => {
    const rowsA = await getBillWiseItemReport(tenants.businessAId, "invoice");
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].partyName).toBe("Customer A");
    expect(rowsA[0].quantity).toBe(3);
    expect(rowsA.some((r) => r.partyName === "Customer B")).toBe(false);
  });
});
