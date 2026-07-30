import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "./helpers/twoTenants";
import { createCustomer } from "@/lib/db/queries/customers";
import { createVendor } from "@/lib/db/queries/vendors";
import { createWarehouse } from "@/lib/db/queries/warehouses";
import { createProduct } from "@/lib/db/queries/products";
import { createInvoice, cancelInvoice, type InvoiceWriteInput } from "@/lib/db/queries/invoices";
import { createPurchase, type PurchaseWriteInput } from "@/lib/db/queries/purchases";
import { getCurrentBalance, recordManualStockMovement } from "@/lib/db/queries/stockLedger";
import { Invoice } from "@/lib/db/models/Invoice";
import { Purchase } from "@/lib/db/models/Purchase";
import { Customer } from "@/lib/db/models/Customer";
import { Vendor } from "@/lib/db/models/Vendor";
import { Product } from "@/lib/db/models/Product";
import { Warehouse } from "@/lib/db/models/Warehouse";
import { StockLedgerEntry } from "@/lib/db/models/StockLedgerEntry";
import { Business } from "@/lib/db/models/Business";

describe("stock movements — document integration", () => {
  let tenants: TwoTenants;
  let customerId: string;
  let vendorId: string;
  let warehouseId: string;
  let trackedProductId: string;
  let batchTrackedProductId: string;
  let batchAId: string;
  let batchBId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("stock-movements");
    await Business.updateOne(
      { _id: tenants.businessAId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );

    const customer = await createCustomer({ businessId: tenants.businessAId, displayName: "Customer" });
    const vendor = await createVendor({ businessId: tenants.businessAId, displayName: "Vendor" });
    if (!customer.ok || !vendor.ok) throw new Error("setup failed");
    customerId = String(customer.customer._id);
    vendorId = String(vendor.vendor._id);

    const warehouse = await createWarehouse({ businessId: tenants.businessAId, name: "Main" });
    warehouseId = String(warehouse._id);

    const trackedProduct = await createProduct({
      businessId: tenants.businessAId,
      name: "Tracked Widget",
      type: "product",
      sellingPriceMinor: 50_000,
      purchasePriceMinor: 20_000,
      priceIsTaxInclusive: false,
      taxRatePercent: 0,
      stockTracking: { enabled: true, batchTracked: false, serialTracked: false },
    });
    if (!trackedProduct.ok) throw new Error("setup failed");
    trackedProductId = String(trackedProduct.product._id);

    const batchProduct = await createProduct({
      businessId: tenants.businessAId,
      name: "Batch Widget",
      type: "product",
      sellingPriceMinor: 10_000,
      priceIsTaxInclusive: false,
      taxRatePercent: 0,
      stockTracking: { enabled: true, batchTracked: true, serialTracked: false },
      batches: [{ batchNumber: "BATCH-A" }, { batchNumber: "BATCH-B" }],
    });
    if (!batchProduct.ok) throw new Error("setup failed");
    batchTrackedProductId = String(batchProduct.product._id);
    batchAId = String(batchProduct.product.batches[0]._id);
    batchBId = String(batchProduct.product.batches[1]._id);

    // Opening stock for both tracked products so Invoice/Stock-Out tests have something to consume.
    const openA = await recordManualStockMovement({
      businessId: tenants.businessAId,
      productId: trackedProductId,
      warehouseId,
      direction: "in",
      quantity: 100,
      note: "opening",
      createdByUserId: tenants.userAId,
    });
    const openBatchA = await recordManualStockMovement({
      businessId: tenants.businessAId,
      productId: batchTrackedProductId,
      warehouseId,
      direction: "in",
      quantity: 5,
      batchId: batchAId,
      note: "opening",
      createdByUserId: tenants.userAId,
    });
    const openBatchB = await recordManualStockMovement({
      businessId: tenants.businessAId,
      productId: batchTrackedProductId,
      warehouseId,
      direction: "in",
      quantity: 5,
      batchId: batchBId,
      note: "opening",
      createdByUserId: tenants.userAId,
    });
    if (!openA.ok || !openBatchA.ok || !openBatchB.ok) throw new Error("setup failed");
  });

  afterAll(async () => {
    await Promise.all([
      Invoice.deleteMany({ businessId: tenants.businessAId }),
      Purchase.deleteMany({ businessId: tenants.businessAId }),
      Customer.deleteMany({ businessId: tenants.businessAId }),
      Vendor.deleteMany({ businessId: tenants.businessAId }),
      Product.deleteMany({ businessId: tenants.businessAId }),
      Warehouse.deleteMany({ businessId: tenants.businessAId }),
      StockLedgerEntry.deleteMany({ businessId: tenants.businessAId }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("finalizing an Invoice for a stock-tracked product decrements stock and writes a ledger entry pointing back at the invoice", async () => {
    const before = await getCurrentBalance({ businessId: tenants.businessAId, productId: trackedProductId, warehouseId });

    const input: InvoiceWriteInput = {
      businessId: tenants.businessAId,
      customerId,
      invoiceDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          productId: trackedProductId,
          warehouseId,
          description: "Tracked Widget",
          quantity: 3,
          unitPriceMinor: 50_000,
          discountType: "percentage",
          discountValue: 0,
          taxRatePercent: 0,
        },
      ],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
    };
    const result = await createInvoice({ ...input, createdByUserId: tenants.userAId, finalize: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = await getCurrentBalance({ businessId: tenants.businessAId, productId: trackedProductId, warehouseId });
    expect(after).toBe(before - 3);

    const entry = await StockLedgerEntry.findOne({
      businessId: tenants.businessAId,
      refDocumentType: "invoice",
      refDocumentId: result.invoice._id,
    }).lean();
    expect(entry).not.toBeNull();
    expect(entry?.direction).toBe("out");
    expect(entry?.quantity).toBe(3);

    // Cancelling reverses the decrement.
    const cancelled = await cancelInvoice(String(result.invoice._id), tenants.businessAId);
    expect(cancelled.ok).toBe(true);
    const afterCancel = await getCurrentBalance({
      businessId: tenants.businessAId,
      productId: trackedProductId,
      warehouseId,
    });
    expect(afterCancel).toBe(before);
  });

  it("finalizing a Purchase for a stock-tracked product increments stock", async () => {
    const before = await getCurrentBalance({ businessId: tenants.businessAId, productId: trackedProductId, warehouseId });

    const input: PurchaseWriteInput = {
      businessId: tenants.businessAId,
      vendorId,
      purchaseDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          productId: trackedProductId,
          warehouseId,
          description: "Tracked Widget",
          quantity: 7,
          unitPriceMinor: 20_000,
          discountType: "percentage",
          discountValue: 0,
          taxRatePercent: 0,
        },
      ],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
    };
    const result = await createPurchase({ ...input, createdByUserId: tenants.userAId, finalize: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const after = await getCurrentBalance({ businessId: tenants.businessAId, productId: trackedProductId, warehouseId });
    expect(after).toBe(before + 7);
  });

  it("a manual Stock Out on a batch-tracked product without a batchId is rejected", async () => {
    const result = await recordManualStockMovement({
      businessId: tenants.businessAId,
      productId: batchTrackedProductId,
      warehouseId,
      direction: "out",
      quantity: 1,
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("batch_required");
  });

  it("a manual Stock Out with a batchId reduces only that batch's balance", async () => {
    const result = await recordManualStockMovement({
      businessId: tenants.businessAId,
      productId: batchTrackedProductId,
      warehouseId,
      direction: "out",
      quantity: 2,
      batchId: batchAId,
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(true);

    const balanceA = await getCurrentBalance({
      businessId: tenants.businessAId,
      productId: batchTrackedProductId,
      warehouseId,
      batchId: batchAId,
    });
    const balanceB = await getCurrentBalance({
      businessId: tenants.businessAId,
      productId: batchTrackedProductId,
      warehouseId,
      batchId: batchBId,
    });
    expect(balanceA).toBe(3); // 5 - 2
    expect(balanceB).toBe(5); // untouched
  });

  it("a Stock Out that would take the balance below zero is rejected", async () => {
    const result = await recordManualStockMovement({
      businessId: tenants.businessAId,
      productId: batchTrackedProductId,
      warehouseId,
      direction: "out",
      quantity: 999,
      batchId: batchAId,
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("insufficient_stock");
  });
});
