import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createCustomer } from "@/lib/db/queries/customers";
import { createVendor } from "@/lib/db/queries/vendors";
import { createBankAccount } from "@/lib/db/queries/bankAccounts";
import { createInvoice, findInvoiceById } from "@/lib/db/queries/invoices";
import { createPurchase } from "@/lib/db/queries/purchases";
import {
  voidPayment,
  getPartyLedger,
  getBillWiseForParty,
  listPaymentsForDocument,
} from "@/lib/db/queries/payments";
import { Invoice } from "@/lib/db/models/Invoice";
import { Purchase } from "@/lib/db/models/Purchase";
import { Payment } from "@/lib/db/models/Payment";
import { Customer } from "@/lib/db/models/Customer";
import { Vendor } from "@/lib/db/models/Vendor";
import { BankAccount } from "@/lib/db/models/BankAccount";
import { Business } from "@/lib/db/models/Business";

describe("payments — tenant isolation", () => {
  let tenants: TwoTenants;
  let customerAId: string;
  let bankAId: string;
  let invoiceAId: string;
  let paymentAId: string;

  const lineItems = [
    {
      description: "Widget",
      quantity: 1,
      unitPriceMinor: 100_000,
      discountType: "percentage" as const,
      discountValue: 0,
      taxRatePercent: 0,
    },
  ];

  beforeAll(async () => {
    tenants = await setupTwoTenants("payments");
    await Business.updateOne(
      { _id: tenants.businessAId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );

    const customerA = await createCustomer({ businessId: tenants.businessAId, displayName: "Customer A" });
    if (!customerA.ok) throw new Error("setup failed");
    customerAId = String(customerA.customer._id);

    const bankA = await createBankAccount({ businessId: tenants.businessAId, type: "cash", name: "Cash" });
    bankAId = String(bankA._id);

    const created = await createInvoice({
      businessId: tenants.businessAId,
      customerId: customerAId,
      invoiceDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems,
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userAId,
      finalize: true,
      payments: [{ amountMinor: 40_000, mode: "cash", bankAccountId: bankAId, paymentDate: new Date() }],
    });
    if (!created.ok) throw new Error("setup failed");
    invoiceAId = String(created.invoice._id);
    paymentAId = String(created.payments[0]._id);
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      Invoice.deleteMany({ businessId: { $in: businessIds } }),
      Payment.deleteMany({ businessId: { $in: businessIds } }),
      Customer.deleteMany({ businessId: { $in: businessIds } }),
      BankAccount.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("listPaymentsForDocument scoped by businessId only returns the caller's own payments", async () => {
    const items = await listPaymentsForDocument("invoice", invoiceAId, tenants.businessAId);
    expect(items).toHaveLength(1);
    expect(String(items[0]._id)).toBe(paymentAId);

    const crossed = await listPaymentsForDocument("invoice", invoiceAId, tenants.businessBId);
    expect(crossed).toHaveLength(0);
  });

  it("voidPayment cannot void another business's payment", async () => {
    const result = await voidPayment(paymentAId, tenants.businessBId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");

    const invoice = await findInvoiceById(invoiceAId, tenants.businessAId);
    expect(invoice?.amountPaidMinor).toBe(40_000);
  });

  it("voidPayment decrements the linked invoice's amountPaidMinor and re-derives status", async () => {
    const result = await voidPayment(paymentAId, tenants.businessAId);
    expect(result.ok).toBe(true);

    const invoice = await findInvoiceById(invoiceAId, tenants.businessAId);
    expect(invoice?.amountPaidMinor).toBe(0);
    expect(invoice?.status).toBe("pending");
  });

  it("voidPayment rejects voiding an already-voided payment", async () => {
    const result = await voidPayment(paymentAId, tenants.businessAId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("already_voided");
  });

  it("getPartyLedger never leaks another business's entries", async () => {
    const ledgerA = await getPartyLedger("customer", customerAId, tenants.businessAId);
    expect(ledgerA.items.length).toBeGreaterThan(0);

    const ledgerCrossed = await getPartyLedger("customer", customerAId, tenants.businessBId);
    expect(ledgerCrossed.items).toHaveLength(0);
  });

  it("getBillWiseForParty never leaks another business's invoices", async () => {
    const billWiseA = await getBillWiseForParty("customer", customerAId, tenants.businessAId);
    expect(billWiseA.map((b) => b.documentId)).toContain(invoiceAId);

    const billWiseCrossed = await getBillWiseForParty("customer", customerAId, tenants.businessBId);
    expect(billWiseCrossed).toHaveLength(0);
  });
});

describe("vendor ledger — sign convention", () => {
  let tenants: TwoTenants;
  let vendorAId: string;
  let bankAId: string;

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
    tenants = await setupTwoTenants("vendor-ledger-sign");
    await Business.updateOne(
      { _id: tenants.businessAId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );
    const vendorA = await createVendor({ businessId: tenants.businessAId, displayName: "Vendor A" });
    if (!vendorA.ok) throw new Error("setup failed");
    vendorAId = String(vendorA.vendor._id);

    const bankA = await createBankAccount({ businessId: tenants.businessAId, type: "cash", name: "Cash" });
    bankAId = String(bankA._id);
  });

  afterAll(async () => {
    await Promise.all([
      Purchase.deleteMany({ businessId: tenants.businessAId }),
      Payment.deleteMany({ businessId: tenants.businessAId }),
      Vendor.deleteMany({ businessId: tenants.businessAId }),
      BankAccount.deleteMany({ businessId: tenants.businessAId }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("a Purchase debits the vendor ledger and a payment against it credits (reduces) the balance", async () => {
    const created = await createPurchase({
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
      payments: [{ amountMinor: 40_000, mode: "cash", bankAccountId: bankAId, paymentDate: new Date() }],
    });
    if (!created.ok) throw new Error("setup failed");

    const ledger = await getPartyLedger("vendor", vendorAId, tenants.businessAId);
    expect(ledger.items).toHaveLength(2);

    const [purchaseEntry, paymentEntry] = ledger.items;
    expect(purchaseEntry.type).toBe("purchase");
    expect(purchaseEntry.debitMinor).toBe(100_000);
    expect(purchaseEntry.creditMinor).toBe(0);

    expect(paymentEntry.type).toBe("payment");
    expect(paymentEntry.debitMinor).toBe(0);
    expect(paymentEntry.creditMinor).toBe(40_000);

    // Balance = what we owe the vendor: 100_000 debit - 40_000 credit = 60_000 still payable.
    expect(paymentEntry.balanceMinor).toBe(60_000);
  });
});
