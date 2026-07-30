import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "./helpers/twoTenants";
import { createCustomer } from "@/lib/db/queries/customers";
import { createBankAccount } from "@/lib/db/queries/bankAccounts";
import { createInvoice, findInvoiceById, recordGatewayPayment } from "@/lib/db/queries/invoices";
import { Invoice } from "@/lib/db/models/Invoice";
import { Payment } from "@/lib/db/models/Payment";
import { Customer } from "@/lib/db/models/Customer";
import { BankAccount } from "@/lib/db/models/BankAccount";
import { Business } from "@/lib/db/models/Business";

describe("recordGatewayPayment — idempotency", () => {
  let tenants: TwoTenants;
  let customerId: string;
  let settlementBankAccountId: string;
  let invoiceId: string;

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
    tenants = await setupTwoTenants("gateway-payment-idempotency");
    await Business.updateOne(
      { _id: tenants.businessAId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );

    const customer = await createCustomer({ businessId: tenants.businessAId, displayName: "Customer A" });
    if (!customer.ok) throw new Error("setup failed");
    customerId = String(customer.customer._id);

    const bank = await createBankAccount({ businessId: tenants.businessAId, type: "bank", name: "Razorpay settlement" });
    settlementBankAccountId = String(bank._id);

    const invoice = await createInvoice({
      businessId: tenants.businessAId,
      customerId,
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
    });
    if (!invoice.ok) throw new Error("setup failed");
    invoiceId = String(invoice.invoice._id);
  });

  afterAll(async () => {
    await Promise.all([
      Invoice.deleteMany({ businessId: tenants.businessAId }),
      Payment.deleteMany({ businessId: tenants.businessAId }),
      Customer.deleteMany({ businessId: tenants.businessAId }),
      BankAccount.deleteMany({ businessId: tenants.businessAId }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("records the payment and marks the invoice paid on the first call", async () => {
    const result = await recordGatewayPayment({
      invoiceId,
      businessId: tenants.businessAId,
      amountMinor: 100_000,
      bankAccountId: settlementBankAccountId,
      gatewayPaymentId: "pay_test_replay_123",
      paymentDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.alreadyRecorded).toBe(false);

    const invoice = await findInvoiceById(invoiceId, tenants.businessAId);
    expect(invoice?.status).toBe("paid");
    expect(invoice?.amountPaidMinor).toBe(100_000);

    const payments = await Payment.find({ businessId: tenants.businessAId, linkedDocumentId: invoiceId });
    expect(payments).toHaveLength(1);
    expect(payments[0].source).toBe("gateway");
    expect(payments[0].gatewayPaymentId).toBe("pay_test_replay_123");
  });

  it("replaying the same gatewayPaymentId does not create a second Payment", async () => {
    const result = await recordGatewayPayment({
      invoiceId,
      businessId: tenants.businessAId,
      amountMinor: 100_000,
      bankAccountId: settlementBankAccountId,
      gatewayPaymentId: "pay_test_replay_123",
      paymentDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.alreadyRecorded).toBe(true);

    const payments = await Payment.find({ businessId: tenants.businessAId, linkedDocumentId: invoiceId });
    expect(payments).toHaveLength(1);

    const invoice = await findInvoiceById(invoiceId, tenants.businessAId);
    expect(invoice?.amountPaidMinor).toBe(100_000);
  });

  it("rejects a gateway payment against another business's invoice", async () => {
    const result = await recordGatewayPayment({
      invoiceId,
      businessId: tenants.businessBId,
      amountMinor: 100_000,
      bankAccountId: settlementBankAccountId,
      gatewayPaymentId: "pay_test_cross_tenant",
      paymentDate: new Date(),
      createdByUserId: tenants.userBId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });
});
