import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createCustomer } from "@/lib/db/queries/customers";
import { createInvoice } from "@/lib/db/queries/invoices";
import {
  createCreditNote,
  cancelCreditNote,
  softDeleteCreditNote,
  restoreCreditNote,
  findCreditNoteById,
  listCreditNotes,
  sumCreditNoteTotals,
} from "@/lib/db/queries/creditNotes";
import { getPartyLedger } from "@/lib/db/queries/payments";
import { CreditNote } from "@/lib/db/models/CreditNote";
import { Invoice } from "@/lib/db/models/Invoice";
import { Customer } from "@/lib/db/models/Customer";
import { Business } from "@/lib/db/models/Business";

describe("credit notes — tenant isolation", () => {
  let tenants: TwoTenants;
  let customerAId: string;
  let customerBId: string;
  let invoiceAId: string;
  let invoiceBId: string;

  const lineItems = [
    {
      description: "Consulting",
      quantity: 1,
      unitPriceMinor: 100_000,
      discountType: "percentage" as const,
      discountValue: 0,
      taxRatePercent: 0,
    },
  ];

  beforeAll(async () => {
    tenants = await setupTwoTenants("credit-notes");
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

    const invoiceA = await createInvoice({
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
    });
    const invoiceB = await createInvoice({
      businessId: tenants.businessBId,
      customerId: customerBId,
      invoiceDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems,
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userBId,
      finalize: true,
    });
    if (!invoiceA.ok || !invoiceB.ok) throw new Error("setup failed");
    invoiceAId = String(invoiceA.invoice._id);
    invoiceBId = String(invoiceB.invoice._id);
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      CreditNote.deleteMany({ businessId: { $in: businessIds } }),
      Invoice.deleteMany({ businessId: { $in: businessIds } }),
      Customer.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("createCreditNote rejects a linkedInvoiceId belonging to a different business", async () => {
    const result = await createCreditNote({
      businessId: tenants.businessAId,
      linkedInvoiceId: invoiceBId,
      creditNoteDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      lineItems: [{ ...lineItems[0], unitPriceMinor: 20_000 }],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invoice_not_found");
  });

  it("creates an issued credit note and reduces the customer ledger balance (credit), cleared on cancel", async () => {
    const result = await createCreditNote({
      businessId: tenants.businessAId,
      linkedInvoiceId: invoiceAId,
      creditNoteDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      lineItems: [{ ...lineItems[0], unitPriceMinor: 20_000 }],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.creditNote.docNumber).toMatch(/^CN-/);
    expect(result.creditNote.status).toBe("issued");

    const id = String(result.creditNote._id);
    expect(await findCreditNoteById(id, tenants.businessAId)).not.toBeNull();
    expect(await findCreditNoteById(id, tenants.businessBId)).toBeNull();

    const ledger = await getPartyLedger("customer", customerAId, tenants.businessAId);
    const creditNoteEntry = ledger.items.find((e) => e.type === "credit_note");
    expect(creditNoteEntry).toBeDefined();
    expect(creditNoteEntry?.creditMinor).toBe(20_000);
    expect(creditNoteEntry?.debitMinor).toBe(0);

    await cancelCreditNote(id, tenants.businessAId);
    const ledgerAfterCancel = await getPartyLedger("customer", customerAId, tenants.businessAId);
    expect(ledgerAfterCancel.items.find((e) => e.type === "credit_note")).toBeUndefined();
  });

  it("cancelCreditNote cannot cancel another business's credit note", async () => {
    const created = await createCreditNote({
      businessId: tenants.businessBId,
      linkedInvoiceId: invoiceBId,
      creditNoteDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      lineItems: [{ ...lineItems[0], unitPriceMinor: 10_000 }],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userBId,
      finalize: true,
    });
    if (!created.ok) throw new Error("setup failed");
    const result = await cancelCreditNote(String(created.creditNote._id), tenants.businessAId);
    expect(result.ok).toBe(false);
  });

  it("softDeleteCreditNote refuses to delete an issued note but succeeds after cancelling it", async () => {
    const created = await createCreditNote({
      businessId: tenants.businessAId,
      linkedInvoiceId: invoiceAId,
      creditNoteDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      lineItems: [{ ...lineItems[0], unitPriceMinor: 5_000 }],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    if (!created.ok) throw new Error("setup failed");
    const id = String(created.creditNote._id);

    const blocked = await softDeleteCreditNote(id, tenants.businessAId);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("not_deletable");

    const cancelled = await cancelCreditNote(id, tenants.businessAId);
    expect(cancelled.ok).toBe(true);

    const deleted = await softDeleteCreditNote(id, tenants.businessAId);
    expect(deleted.ok).toBe(true);

    const list = await listCreditNotes(tenants.businessAId, { tab: "deleted" });
    expect(list.items.map((cn) => String(cn._id))).toContain(id);

    await restoreCreditNote(id, tenants.businessAId);
  });

  it("listCreditNotes never crosses businesses", async () => {
    const list = await listCreditNotes(tenants.businessAId);
    for (const cn of list.items) {
      expect(String(cn.businessId)).toBe(tenants.businessAId);
    }
  });

  it("sumCreditNoteTotals only sums issued credit notes within its own business", async () => {
    const before = await sumCreditNoteTotals(tenants.businessAId);

    const issued = await createCreditNote({
      businessId: tenants.businessAId,
      linkedInvoiceId: invoiceAId,
      creditNoteDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      lineItems: [{ ...lineItems[0], unitPriceMinor: 30_000 }],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userAId,
      finalize: true,
    });
    const otherBusiness = await createCreditNote({
      businessId: tenants.businessBId,
      linkedInvoiceId: invoiceBId,
      creditNoteDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      lineItems: [{ ...lineItems[0], unitPriceMinor: 90_000 }],
      discountType: "percentage",
      discountValue: 0,
      discountTarget: "total",
      roundOff: false,
      createdByUserId: tenants.userBId,
      finalize: true,
    });
    if (!issued.ok || !otherBusiness.ok) throw new Error("setup failed");

    const after = await sumCreditNoteTotals(tenants.businessAId);
    expect(after.totalMinor - before.totalMinor).toBe(30_000);
  });
});
