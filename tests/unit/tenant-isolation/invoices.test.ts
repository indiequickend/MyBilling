import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createCustomer } from "@/lib/db/queries/customers";
import { createBankAccount } from "@/lib/db/queries/bankAccounts";
import {
  createInvoice,
  updateInvoice,
  finalizeInvoiceDraft,
  recordInvoicePayment,
  cancelInvoice,
  softDeleteInvoice,
  restoreInvoice,
  findInvoiceById,
  listInvoices,
  sumInvoiceTotals,
  type InvoiceWriteInput,
} from "@/lib/db/queries/invoices";
import { Invoice } from "@/lib/db/models/Invoice";
import { Payment } from "@/lib/db/models/Payment";
import { Customer } from "@/lib/db/models/Customer";
import { BankAccount } from "@/lib/db/models/BankAccount";
import { Business } from "@/lib/db/models/Business";

describe("invoices — tenant isolation", () => {
  let tenants: TwoTenants;
  let customerAId: string;
  let customerBId: string;
  let bankAId: string;
  let bankBId: string;

  const baseLineItems = [
    {
      description: "Widget",
      quantity: 2,
      unitPriceMinor: 50_000,
      discountType: "percentage" as const,
      discountValue: 0,
      taxRatePercent: 18,
    },
  ];

  beforeAll(async () => {
    tenants = await setupTwoTenants("invoices");
    await Business.updateOne(
      { _id: tenants.businessAId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );
    await Business.updateOne(
      { _id: tenants.businessBId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );

    const customerA = await createCustomer({ businessId: tenants.businessAId, displayName: "Customer A" });
    const customerB = await createCustomer({ businessId: tenants.businessBId, displayName: "Customer B" });
    if (!customerA.ok || !customerB.ok) throw new Error("setup failed");
    customerAId = String(customerA.customer._id);
    customerBId = String(customerB.customer._id);

    const bankA = await createBankAccount({ businessId: tenants.businessAId, type: "cash", name: "Cash" });
    const bankB = await createBankAccount({ businessId: tenants.businessBId, type: "cash", name: "Cash" });
    bankAId = String(bankA._id);
    bankBId = String(bankB._id);
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

  function baseInput(businessId: string, customerId: string): InvoiceWriteInput {
    return {
      businessId,
      customerId,
      invoiceDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: baseLineItems,
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
    };
  }

  it("createInvoice rejects a customerId belonging to a different business", async () => {
    const result = await createInvoice({
      ...baseInput(tenants.businessAId, customerBId),
      createdByUserId: tenants.userAId,
      finalize: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("customer_not_found");
  });

  it("createInvoice rejects a bankAccountId belonging to a different business", async () => {
    const result = await createInvoice({
      ...baseInput(tenants.businessAId, customerAId),
      bankAccountId: bankBId,
      createdByUserId: tenants.userAId,
      finalize: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_bank_account");
  });

  it("creates a draft invoice with no docNumber", async () => {
    const result = await createInvoice({
      ...baseInput(tenants.businessAId, customerAId),
      createdByUserId: tenants.userAId,
      finalize: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invoice.status).toBe("draft");
      expect(result.invoice.docNumber).toBeUndefined();
      expect(result.invoice.grandTotalMinor).toBe(118_000); // 2 x 500.00 @ 18% intra-state
    }
  });

  it("finalizing assigns a docNumber and the invoice is findable only within its own business", async () => {
    const created = await createInvoice({
      ...baseInput(tenants.businessAId, customerAId),
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.invoice.docNumber).toMatch(/^INV-/);
    expect(created.invoice.status).toBe("pending");

    const invoiceId = String(created.invoice._id);
    expect(await findInvoiceById(invoiceId, tenants.businessAId)).not.toBeNull();
    expect(await findInvoiceById(invoiceId, tenants.businessBId)).toBeNull();
  });

  it("finalize with an inline split payment marks the invoice partially_paid", async () => {
    const created = await createInvoice({
      ...baseInput(tenants.businessAId, customerAId),
      createdByUserId: tenants.userAId,
      finalize: true,
      payments: [{ amountMinor: 50_000, mode: "cash", bankAccountId: bankAId, paymentDate: new Date() }],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.invoice.status).toBe("partially_paid");
    expect(created.invoice.amountPaidMinor).toBe(50_000);
    expect(created.payments).toHaveLength(1);
  });

  it("createInvoice rejects inline payments that exceed the grand total", async () => {
    const result = await createInvoice({
      ...baseInput(tenants.businessAId, customerAId),
      createdByUserId: tenants.userAId,
      finalize: true,
      payments: [{ amountMinor: 999_999, mode: "cash", bankAccountId: bankAId, paymentDate: new Date() }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("payments_exceed_total");
  });

  it("createInvoice rejects a payment split referencing a foreign bank account", async () => {
    const result = await createInvoice({
      ...baseInput(tenants.businessAId, customerAId),
      createdByUserId: tenants.userAId,
      finalize: true,
      payments: [{ amountMinor: 10_000, mode: "cash", bankAccountId: bankBId, paymentDate: new Date() }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_bank_account");
  });

  it("updateInvoice cannot modify another business's invoice", async () => {
    const created = await createInvoice({
      ...baseInput(tenants.businessBId, customerBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await updateInvoice(
      String(created.invoice._id),
      tenants.businessAId,
      baseInput(tenants.businessAId, customerAId),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("updateInvoice recomputes totals for a draft and keeps it a draft", async () => {
    const created = await createInvoice({
      ...baseInput(tenants.businessAId, customerAId),
      createdByUserId: tenants.userAId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await updateInvoice(String(created.invoice._id), tenants.businessAId, {
      ...baseInput(tenants.businessAId, customerAId),
      lineItems: [{ ...baseLineItems[0], quantity: 4 }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invoice.status).toBe("draft");
      expect(result.invoice.grandTotalMinor).toBe(236_000);
    }
  });

  it("a paid invoice cannot be edited", async () => {
    const created = await createInvoice({
      ...baseInput(tenants.businessAId, customerAId),
      createdByUserId: tenants.userAId,
      finalize: true,
      payments: [{ amountMinor: 118_000, mode: "cash", bankAccountId: bankAId, paymentDate: new Date() }],
    });
    if (!created.ok) throw new Error("setup failed");
    expect(created.invoice.status).toBe("paid");

    const result = await updateInvoice(
      String(created.invoice._id),
      tenants.businessAId,
      baseInput(tenants.businessAId, customerAId),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_editable");
  });

  it("finalizeInvoiceDraft cannot finalize another business's draft", async () => {
    const created = await createInvoice({
      ...baseInput(tenants.businessBId, customerBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await finalizeInvoiceDraft(
      String(created.invoice._id),
      tenants.businessAId,
      baseInput(tenants.businessAId, customerAId),
      undefined,
      tenants.userAId,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("finalizeInvoiceDraft assigns a docNumber and cannot be called a second time", async () => {
    const created = await createInvoice({
      ...baseInput(tenants.businessAId, customerAId),
      createdByUserId: tenants.userAId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const invoiceId = String(created.invoice._id);

    const finalized = await finalizeInvoiceDraft(
      invoiceId,
      tenants.businessAId,
      baseInput(tenants.businessAId, customerAId),
      undefined,
      tenants.userAId,
    );
    expect(finalized.ok).toBe(true);
    if (finalized.ok) {
      expect(finalized.invoice.docNumber).toMatch(/^INV-/);
      expect(finalized.invoice.status).toBe("pending");
    }

    const secondAttempt = await finalizeInvoiceDraft(
      invoiceId,
      tenants.businessAId,
      baseInput(tenants.businessAId, customerAId),
      undefined,
      tenants.userAId,
    );
    expect(secondAttempt.ok).toBe(false);
    if (!secondAttempt.ok) expect(secondAttempt.reason).toBe("not_editable");
  });

  it("recordInvoicePayment cannot record a payment against another business's invoice", async () => {
    const created = await createInvoice({
      ...baseInput(tenants.businessBId, customerBId),
      createdByUserId: tenants.userBId,
      finalize: true,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await recordInvoicePayment(
      String(created.invoice._id),
      tenants.businessAId,
      [{ amountMinor: 10_000, mode: "cash", bankAccountId: bankAId, paymentDate: new Date() }],
      tenants.userAId,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");
  });

  it("recordInvoicePayment tops up a pending invoice to paid", async () => {
    const created = await createInvoice({
      ...baseInput(tenants.businessAId, customerAId),
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await recordInvoicePayment(
      String(created.invoice._id),
      tenants.businessAId,
      [{ amountMinor: 118_000, mode: "cash", bankAccountId: bankAId, paymentDate: new Date() }],
      tenants.userAId,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.invoice.status).toBe("paid");
      expect(result.invoice.amountPaidMinor).toBe(118_000);
    }
  });

  it("cancelInvoice cannot cancel another business's invoice", async () => {
    const created = await createInvoice({
      ...baseInput(tenants.businessBId, customerBId),
      createdByUserId: tenants.userBId,
      finalize: false,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await cancelInvoice(String(created.invoice._id), tenants.businessAId);
    expect(result.ok).toBe(false);
  });

  it("softDeleteInvoice refuses to delete a pending invoice but succeeds after cancelling it", async () => {
    const created = await createInvoice({
      ...baseInput(tenants.businessAId, customerAId),
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    if (!created.ok) throw new Error("setup failed");
    const invoiceId = String(created.invoice._id);

    const blocked = await softDeleteInvoice(invoiceId, tenants.businessAId);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("not_deletable");

    const cancelled = await cancelInvoice(invoiceId, tenants.businessAId);
    expect(cancelled.ok).toBe(true);

    const deleted = await softDeleteInvoice(invoiceId, tenants.businessAId);
    expect(deleted.ok).toBe(true);

    const list = await listInvoices(tenants.businessAId, { tab: "deleted" });
    expect(list.items.map((i) => String(i._id))).toContain(invoiceId);

    await restoreInvoice(invoiceId, tenants.businessAId);
  });

  it("listInvoices and sumInvoiceTotals never cross businesses", async () => {
    const list = await listInvoices(tenants.businessAId);
    for (const inv of list.items) {
      expect(String(inv.businessId)).toBe(tenants.businessAId);
    }

    const summaryA = await sumInvoiceTotals(tenants.businessAId);
    expect(summaryA.totalMinor).toBeGreaterThan(0);
    expect(summaryA.pendingMinor).toBe(summaryA.totalMinor - summaryA.paidMinor);
  });
});
