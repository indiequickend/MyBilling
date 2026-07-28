import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createCustomer } from "@/lib/db/queries/customers";
import { createBankAccount } from "@/lib/db/queries/bankAccounts";
import { createInvoice, findInvoiceById } from "@/lib/db/queries/invoices";
import {
  voidPayment,
  getPartyLedger,
  getBillWiseForParty,
  listPaymentsForDocument,
} from "@/lib/db/queries/payments";
import { Invoice } from "@/lib/db/models/Invoice";
import { Payment } from "@/lib/db/models/Payment";
import { Customer } from "@/lib/db/models/Customer";
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
    expect(billWiseA.map((b) => b.invoiceId)).toContain(invoiceAId);

    const billWiseCrossed = await getBillWiseForParty("customer", customerAId, tenants.businessBId);
    expect(billWiseCrossed).toHaveLength(0);
  });
});
