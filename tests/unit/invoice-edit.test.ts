import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "./helpers/twoTenants";
import { createCustomer } from "@/lib/db/queries/customers";
import { createWarehouse } from "@/lib/db/queries/warehouses";
import { createProduct } from "@/lib/db/queries/products";
import { createBankAccount } from "@/lib/db/queries/bankAccounts";
import {
  createInvoice,
  updateInvoice,
  recordInvoicePayment,
  type InvoiceWriteInput,
  type InvoiceLineItemWriteInput,
} from "@/lib/db/queries/invoices";
import { getCurrentBalance, recordManualStockMovement } from "@/lib/db/queries/stockLedger";
import { Invoice } from "@/lib/db/models/Invoice";
import { Customer } from "@/lib/db/models/Customer";
import { Product } from "@/lib/db/models/Product";
import { Warehouse } from "@/lib/db/models/Warehouse";
import { BankAccount } from "@/lib/db/models/BankAccount";
import { Payment } from "@/lib/db/models/Payment";
import { StockLedgerEntry } from "@/lib/db/models/StockLedgerEntry";
import { Business } from "@/lib/db/models/Business";

describe("invoice edit", () => {
  let tenants: TwoTenants;
  let customerId: string;
  let otherCustomerId: string;
  let warehouseId: string;
  let productId: string;
  let bankAccountId: string;

  const balance = () => getCurrentBalance({ businessId: tenants.businessAId, productId, warehouseId });

  function line(quantity: number, unitPriceMinor = 10_000): InvoiceLineItemWriteInput {
    return {
      productId,
      warehouseId,
      description: "Widget",
      quantity,
      unitPriceMinor,
      discountType: "percentage",
      discountValue: 0,
      taxRatePercent: 0,
    };
  }

  function baseInput(overrides: Partial<InvoiceWriteInput> = {}): InvoiceWriteInput {
    return {
      businessId: tenants.businessAId,
      customerId,
      invoiceDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [line(2)],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      ...overrides,
    };
  }

  async function finalized(overrides: Partial<InvoiceWriteInput> = {}) {
    const result = await createInvoice({ ...baseInput(overrides), createdByUserId: tenants.userAId, finalize: true });
    if (!result.ok) throw new Error(`create failed: ${result.reason}`);
    return String(result.invoice._id);
  }

  async function pay(invoiceId: string, amountMinor: number) {
    const result = await recordInvoicePayment(
      invoiceId,
      tenants.businessAId,
      [{ amountMinor, mode: "cash", bankAccountId, paymentDate: new Date() }],
      tenants.userAId,
    );
    if (!result.ok) throw new Error(`payment failed: ${result.reason}`);
  }

  beforeAll(async () => {
    tenants = await setupTwoTenants("invoice-edit");
    await Business.updateOne({ _id: tenants.businessAId }, { $set: { "addresses.billing.state": "Maharashtra" } });

    const c1 = await createCustomer({ businessId: tenants.businessAId, displayName: "Edit Customer" });
    const c2 = await createCustomer({ businessId: tenants.businessAId, displayName: "Other Customer" });
    if (!c1.ok || !c2.ok) throw new Error("setup failed");
    customerId = String(c1.customer._id);
    otherCustomerId = String(c2.customer._id);

    warehouseId = String((await createWarehouse({ businessId: tenants.businessAId, name: "Main" }))._id);
    bankAccountId = String(
      (await createBankAccount({ businessId: tenants.businessAId, type: "cash", name: "Cash" }))._id,
    );

    const product = await createProduct({
      businessId: tenants.businessAId,
      name: "Widget",
      type: "product",
      sellingPriceMinor: 10_000,
      priceIsTaxInclusive: false,
      taxRatePercent: 0,
      stockTracking: { enabled: true, batchTracked: false, serialTracked: false },
    });
    if (!product.ok) throw new Error("setup failed");
    productId = String(product.product._id);

    const open = await recordManualStockMovement({
      businessId: tenants.businessAId,
      productId,
      warehouseId,
      direction: "in",
      quantity: 20,
      note: "opening",
      createdByUserId: tenants.userAId,
    });
    if (!open.ok) throw new Error("setup failed");
  });

  afterAll(async () => {
    await Promise.all([
      Invoice.deleteMany({ businessId: tenants.businessAId }),
      Customer.deleteMany({ businessId: tenants.businessAId }),
      Product.deleteMany({ businessId: tenants.businessAId }),
      Warehouse.deleteMany({ businessId: tenants.businessAId }),
      BankAccount.deleteMany({ businessId: tenants.businessAId }),
      Payment.deleteMany({ businessId: tenants.businessAId }),
      StockLedgerEntry.deleteMany({ businessId: tenants.businessAId }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("editing a finalized invoice's quantity and date re-syncs stock to the new line items", async () => {
    const start = await balance();
    const id = await finalized();
    expect(await balance()).toBe(start - 2);

    const newDate = new Date();
    newDate.setUTCDate(newDate.getUTCDate() - 1);
    const result = await updateInvoice(
      id,
      tenants.businessAId,
      baseInput({ invoiceDate: newDate, lineItems: [line(5)] }),
      tenants.userAId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invoice.lineItems[0].quantity).toBe(5);
    expect(result.invoice.grandTotalMinor).toBe(50_000);
    expect(new Date(result.invoice.invoiceDate).toISOString().slice(0, 10)).toBe(newDate.toISOString().slice(0, 10));
    expect(await balance()).toBe(start - 5);

    // Removing the stocked line entirely returns all of it.
    const removed = await updateInvoice(
      id,
      tenants.businessAId,
      baseInput({ lineItems: [{ ...line(1), productId: undefined, warehouseId: undefined, description: "Service" }] }),
      tenants.userAId,
    );
    expect(removed.ok).toBe(true);
    expect(await balance()).toBe(start);
  });

  it("rejects an edit that needs more stock than is available, leaving stock and the invoice unchanged", async () => {
    const id = await finalized();
    const before = await balance();
    const result = await updateInvoice(id, tenants.businessAId, baseInput({ lineItems: [line(10_000)] }), tenants.userAId);
    expect(result).toEqual({ ok: false, reason: "insufficient_stock" });
    expect(await balance()).toBe(before);
    const reread = await Invoice.findById(id).lean();
    expect(reread?.lineItems[0].quantity).toBe(2);
  });

  it("allows editing a paid invoice; raising the total moves it to partially paid", async () => {
    const id = await finalized();
    await pay(id, 20_000);
    expect((await Invoice.findById(id).lean())?.status).toBe("paid");

    const result = await updateInvoice(id, tenants.businessAId, baseInput({ lineItems: [line(3)] }), tenants.userAId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invoice.status).toBe("partially_paid");
    expect(result.invoice.amountPaidMinor).toBe(20_000);
  });

  it("refuses to drop the total below the amount already paid", async () => {
    const id = await finalized();
    await pay(id, 15_000);
    const before = await balance();
    const result = await updateInvoice(id, tenants.businessAId, baseInput({ lineItems: [line(1)] }), tenants.userAId);
    expect(result).toEqual({ ok: false, reason: "total_below_paid" });
    expect(await balance()).toBe(before);
  });

  it("refuses to change the customer once payments exist", async () => {
    const id = await finalized();
    await pay(id, 5_000);
    const result = await updateInvoice(
      id,
      tenants.businessAId,
      baseInput({ customerId: otherCustomerId }),
      tenants.userAId,
    );
    expect(result).toEqual({ ok: false, reason: "customer_locked_by_payments" });
  });

  it("refuses to move a numbered invoice's date into a different financial year", async () => {
    const id = await finalized();
    const lastYear = new Date();
    lastYear.setUTCFullYear(lastYear.getUTCFullYear() - 2);
    const result = await updateInvoice(id, tenants.businessAId, baseInput({ invoiceDate: lastYear }), tenants.userAId);
    expect(result).toEqual({ ok: false, reason: "date_changes_series" });
  });

  it("does not let another business edit the invoice", async () => {
    const id = await finalized();
    const result = await updateInvoice(
      id,
      tenants.businessBId,
      { ...baseInput(), businessId: tenants.businessBId, lineItems: [line(1)] },
      tenants.userBId,
    );
    expect(result).toEqual({ ok: false, reason: "not_found" });
    const reread = await Invoice.findById(id).lean();
    expect(reread?.lineItems[0].quantity).toBe(2);
  });
});
