import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { findOrCreateCustomerByName } from "@/lib/db/queries/customers";
import { findOrCreateImportBankAccount } from "@/lib/db/queries/bankAccounts";
import { importInvoice } from "@/lib/db/queries/invoices";
import { Customer } from "@/lib/db/models/Customer";
import { BankAccount } from "@/lib/db/models/BankAccount";
import { Invoice } from "@/lib/db/models/Invoice";
import { Payment } from "@/lib/db/models/Payment";

describe("invoice bulk-import — tenant isolation", () => {
  let tenants: TwoTenants;

  beforeAll(async () => {
    tenants = await setupTwoTenants("invoice-import");
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      Customer.deleteMany({ businessId: { $in: businessIds } }),
      BankAccount.deleteMany({ businessId: { $in: businessIds } }),
      Invoice.deleteMany({ businessId: { $in: businessIds } }),
      Payment.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("findOrCreateCustomerByName never resolves to a different business's customer of the same name", async () => {
    const customerB = await findOrCreateCustomerByName(tenants.businessBId, "Shared Name Customer");
    const customerA = await findOrCreateCustomerByName(tenants.businessAId, "Shared Name Customer");

    expect(String(customerA._id)).not.toBe(String(customerB._id));
    expect(String(customerA.businessId)).toBe(tenants.businessAId);

    const customerAAgain = await findOrCreateCustomerByName(tenants.businessAId, "Shared Name Customer");
    expect(String(customerAAgain._id)).toBe(String(customerA._id));
  });

  it("findOrCreateImportBankAccount never resolves to a different business's account", async () => {
    const cashB = await findOrCreateImportBankAccount(tenants.businessBId, { mode: "cash" });
    const cashA = await findOrCreateImportBankAccount(tenants.businessAId, { mode: "cash" });
    expect(String(cashA._id)).not.toBe(String(cashB._id));
    expect(String(cashA.businessId)).toBe(tenants.businessAId);

    const bankB = await findOrCreateImportBankAccount(tenants.businessBId, {
      mode: "bank",
      accountNumber: "SHARED-ACC-123",
    });
    const bankA = await findOrCreateImportBankAccount(tenants.businessAId, {
      mode: "bank",
      accountNumber: "SHARED-ACC-123",
    });
    expect(String(bankA._id)).not.toBe(String(bankB._id));
    expect(String(bankA.businessId)).toBe(tenants.businessAId);
  });

  it("importInvoice scopes the invoice, its customer snapshot, and its payments to the given business", async () => {
    const customer = await findOrCreateCustomerByName(tenants.businessAId, "Import Test Customer");
    const cashAccount = await findOrCreateImportBankAccount(tenants.businessAId, { mode: "cash" });

    const result = await importInvoice({
      businessId: tenants.businessAId,
      customerId: String(customer._id),
      docNumber: "INV/TEST/1",
      invoiceDate: new Date("2026-06-01"),
      placeOfSupplyState: "West Bengal",
      lineItemDescription: "Imported invoice",
      subtotalMinor: 19200_00,
      discountAmountMinor: 160_00,
      totalTaxMinor: 960_00,
      grandTotalMinor: 20000_00,
      payments: [
        {
          amountMinor: 20000_00,
          mode: "cash",
          bankAccountId: String(cashAccount._id),
          paymentDate: new Date("2026-06-01"),
        },
      ],
      createdByUserId: tenants.userAId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(String(result.invoice.businessId)).toBe(tenants.businessAId);
    expect(result.invoice.docNumber).toBe("INV/TEST/1");
    expect(result.invoice.status).toBe("paid");
    expect(result.invoice.grandTotalMinor).toBe(20000_00);
    expect(result.payments).toHaveLength(1);
    expect(String(result.payments[0].businessId)).toBe(tenants.businessAId);

    // Business B can reuse the exact same docNumber — the uniqueness constraint is per-business.
    const customerB = await findOrCreateCustomerByName(tenants.businessBId, "Import Test Customer");
    const resultB = await importInvoice({
      businessId: tenants.businessBId,
      customerId: String(customerB._id),
      docNumber: "INV/TEST/1",
      invoiceDate: new Date("2026-06-01"),
      placeOfSupplyState: "West Bengal",
      lineItemDescription: "Imported invoice",
      subtotalMinor: 1000_00,
      discountAmountMinor: 0,
      totalTaxMinor: 50_00,
      grandTotalMinor: 1050_00,
      payments: [],
      createdByUserId: tenants.userBId,
    });
    expect(resultB.ok).toBe(true);

    // But a second invoice within the SAME business can't reuse that docNumber.
    const dup = await importInvoice({
      businessId: tenants.businessAId,
      customerId: String(customer._id),
      docNumber: "INV/TEST/1",
      invoiceDate: new Date("2026-06-02"),
      placeOfSupplyState: "West Bengal",
      lineItemDescription: "Imported invoice",
      subtotalMinor: 100_00,
      discountAmountMinor: 0,
      totalTaxMinor: 0,
      grandTotalMinor: 100_00,
      payments: [],
      createdByUserId: tenants.userAId,
    });
    expect(dup).toEqual({ ok: false, reason: "duplicate_doc_number" });
  });

  it("importInvoice rejects a customer that belongs to a different business", async () => {
    const customerB = await findOrCreateCustomerByName(tenants.businessBId, "Cross Tenant Customer");

    const result = await importInvoice({
      businessId: tenants.businessAId,
      customerId: String(customerB._id),
      docNumber: "INV/TEST/CROSS",
      invoiceDate: new Date("2026-06-01"),
      placeOfSupplyState: "West Bengal",
      lineItemDescription: "Imported invoice",
      subtotalMinor: 100_00,
      discountAmountMinor: 0,
      totalTaxMinor: 0,
      grandTotalMinor: 100_00,
      payments: [],
      createdByUserId: tenants.userAId,
    });

    expect(result).toEqual({ ok: false, reason: "customer_not_found" });
  });

  it("importInvoice reports a clean failure instead of a raw Mongoose error when placeOfSupplyState is blank", async () => {
    const customer = await findOrCreateCustomerByName(tenants.businessAId, "Blank State Customer");

    const result = await importInvoice({
      businessId: tenants.businessAId,
      customerId: String(customer._id),
      docNumber: "INV/TEST/BLANK-STATE",
      invoiceDate: new Date("2026-06-01"),
      placeOfSupplyState: "",
      lineItemDescription: "Imported invoice",
      subtotalMinor: 100_00,
      discountAmountMinor: 0,
      totalTaxMinor: 0,
      grandTotalMinor: 100_00,
      payments: [],
      createdByUserId: tenants.userAId,
    });

    expect(result).toEqual({ ok: false, reason: "missing_place_of_supply" });
  });
});
