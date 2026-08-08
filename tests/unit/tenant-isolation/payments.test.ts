import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createCustomer } from "@/lib/db/queries/customers";
import { createVendor } from "@/lib/db/queries/vendors";
import { createBankAccount } from "@/lib/db/queries/bankAccounts";
import { createInvoice, findInvoiceById } from "@/lib/db/queries/invoices";
import { createPurchase } from "@/lib/db/queries/purchases";
import {
  voidPayment,
  updatePayment,
  isPaymentEditable,
  getPartyLedger,
  getBillWiseForParty,
  listPaymentsForDocument,
  recordPartyPayment,
  listAvailableAdvances,
  applyAdvancePayment,
} from "@/lib/db/queries/payments";
import { createExpense } from "@/lib/db/queries/expenses";
import { createExpenseCategory } from "@/lib/db/queries/expenseCategories";
import { Invoice } from "@/lib/db/models/Invoice";
import { Purchase } from "@/lib/db/models/Purchase";
import { Expense } from "@/lib/db/models/Expense";
import { ExpenseCategory } from "@/lib/db/models/ExpenseCategory";
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
    const result = await voidPayment(paymentAId, tenants.businessBId, tenants.userAId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");

    const invoice = await findInvoiceById(invoiceAId, tenants.businessAId);
    expect(invoice?.amountPaidMinor).toBe(40_000);
  });

  it("voidPayment decrements the linked invoice's amountPaidMinor and re-derives status", async () => {
    const result = await voidPayment(paymentAId, tenants.businessAId, tenants.userAId);
    expect(result.ok).toBe(true);

    const invoice = await findInvoiceById(invoiceAId, tenants.businessAId);
    expect(invoice?.amountPaidMinor).toBe(0);
    expect(invoice?.status).toBe("pending");
  });

  it("voidPayment rejects voiding an already-voided payment", async () => {
    const result = await voidPayment(paymentAId, tenants.businessAId, tenants.userAId);
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

describe("advance payments — recordPartyPayment / applyAdvancePayment", () => {
  let tenants: TwoTenants;
  let customerAId: string;
  let bankAId: string;

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
    tenants = await setupTwoTenants("advance-payments");
    await Business.updateOne(
      { _id: tenants.businessAId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );
    const customerA = await createCustomer({ businessId: tenants.businessAId, displayName: "Customer A" });
    if (!customerA.ok) throw new Error("setup failed");
    customerAId = String(customerA.customer._id);

    const bankA = await createBankAccount({ businessId: tenants.businessAId, type: "cash", name: "Cash" });
    bankAId = String(bankA._id);
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

  it("recordPartyPayment rejects a customer belonging to another business", async () => {
    const result = await recordPartyPayment({
      businessId: tenants.businessBId,
      partyType: "customer",
      partyId: customerAId,
      direction: "in",
      amountMinor: 50_000,
      mode: "cash",
      bankAccountId: bankAId,
      paymentDate: new Date(),
      createdByUserId: tenants.userBId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("party_not_found");
  });

  it("recordPartyPayment creates an unlinked advance that shows up in the ledger and listAvailableAdvances", async () => {
    const result = await recordPartyPayment({
      businessId: tenants.businessAId,
      partyType: "customer",
      partyId: customerAId,
      direction: "in",
      amountMinor: 50_000,
      mode: "cash",
      bankAccountId: bankAId,
      paymentDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payment.linkedDocumentType).toBeUndefined();

    const ledger = await getPartyLedger("customer", customerAId, tenants.businessAId);
    expect(ledger.items).toHaveLength(1);
    expect(ledger.items[0].creditMinor).toBe(50_000);
    expect(ledger.items[0].balanceMinor).toBe(-50_000);

    const advances = await listAvailableAdvances("customer", customerAId, tenants.businessAId, "in");
    expect(advances).toHaveLength(1);
    expect(advances[0].amountMinor).toBe(50_000);

    const crossedAdvances = await listAvailableAdvances("customer", customerAId, tenants.businessBId, "in");
    expect(crossedAdvances).toHaveLength(0);
  });

  it("applyAdvancePayment partially applies an advance, splitting it into an applied portion and a remaining advance", async () => {
    const advances = await listAvailableAdvances("customer", customerAId, tenants.businessAId, "in");
    const advance = advances[0];

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
    });
    if (!created.ok) throw new Error("setup failed");
    const invoiceId = String(created.invoice._id);

    const cannotCrossApply = await applyAdvancePayment({
      businessId: tenants.businessBId,
      paymentId: advance.paymentId,
      targetType: "invoice",
      targetId: invoiceId,
      amountMinor: 30_000,
    });
    expect(cannotCrossApply.ok).toBe(false);

    const result = await applyAdvancePayment({
      businessId: tenants.businessAId,
      paymentId: advance.paymentId,
      targetType: "invoice",
      targetId: invoiceId,
      amountMinor: 30_000,
    });
    expect(result.ok).toBe(true);

    const invoice = await findInvoiceById(invoiceId, tenants.businessAId);
    expect(invoice?.amountPaidMinor).toBe(30_000);
    expect(invoice?.status).toBe("partially_paid");

    // 20_000 remains as a still-unlinked advance, still available to apply elsewhere.
    const remainingAdvances = await listAvailableAdvances("customer", customerAId, tenants.businessAId, "in");
    expect(remainingAdvances).toHaveLength(1);
    expect(remainingAdvances[0].amountMinor).toBe(20_000);

    // Total money recorded for the customer is unchanged by the split (50_000 in, none lost).
    const allPayments = await Payment.find({ businessId: tenants.businessAId, partyId: customerAId }).lean();
    const totalMinor = allPayments.reduce((sum, p) => sum + p.amountMinor, 0);
    expect(totalMinor).toBe(50_000);
  });
});

describe("updatePayment — tenant isolation & cascading", () => {
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
    tenants = await setupTwoTenants("update-payment");
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
      Expense.deleteMany({ businessId: { $in: businessIds } }),
      ExpenseCategory.deleteMany({ businessId: { $in: businessIds } }),
      Payment.deleteMany({ businessId: { $in: businessIds } }),
      Customer.deleteMany({ businessId: { $in: businessIds } }),
      BankAccount.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("cannot update another business's payment", async () => {
    const result = await updatePayment(
      paymentAId,
      tenants.businessBId,
      { amountMinor: 50_000, mode: "cash", bankAccountId: bankAId, paymentDate: new Date() },
      tenants.userBId,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_found");

    const invoice = await findInvoiceById(invoiceAId, tenants.businessAId);
    expect(invoice?.amountPaidMinor).toBe(40_000);
  });

  it("adjusts the linked invoice's amountPaidMinor by the delta and re-derives status", async () => {
    const result = await updatePayment(
      paymentAId,
      tenants.businessAId,
      { amountMinor: 100_000, mode: "upi", bankAccountId: bankAId, paymentDate: new Date() },
      tenants.userAId,
    );
    expect(result.ok).toBe(true);

    const invoice = await findInvoiceById(invoiceAId, tenants.businessAId);
    expect(invoice?.amountPaidMinor).toBe(100_000);
    expect(invoice?.status).toBe("paid");
  });

  it("rejects an amount that would push the linked invoice's paid total past its grand total", async () => {
    const result = await updatePayment(
      paymentAId,
      tenants.businessAId,
      { amountMinor: 999_999, mode: "cash", bankAccountId: bankAId, paymentDate: new Date() },
      tenants.userAId,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("amount_invalid");

    // Unchanged by the rejected attempt.
    const invoice = await findInvoiceById(invoiceAId, tenants.businessAId);
    expect(invoice?.amountPaidMinor).toBe(100_000);
  });

  it("updates an unlinked advance payment directly with no linked document to cascade to", async () => {
    const advance = await recordPartyPayment({
      businessId: tenants.businessAId,
      partyType: "customer",
      partyId: customerAId,
      direction: "in",
      amountMinor: 10_000,
      mode: "cash",
      bankAccountId: bankAId,
      paymentDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    expect(advance.ok).toBe(true);
    if (!advance.ok) return;

    const result = await updatePayment(
      String(advance.payment._id),
      tenants.businessAId,
      { amountMinor: 15_000, mode: "upi", bankAccountId: bankAId, paymentDate: new Date(), referenceNote: "Edited" },
      tenants.userAId,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payment.amountMinor).toBe(15_000);
    expect(result.payment.mode).toBe("upi");
    expect(result.payment.referenceNote).toBe("Edited");
  });

  it("rejects editing (and flags as not editable) an Expense-linked payment, since its amount/mode are duplicated onto the Expense record", async () => {
    const category = await createExpenseCategory({ businessId: tenants.businessAId, name: "Rent" });
    const expense = await createExpense({
      businessId: tenants.businessAId,
      categoryId: String(category._id),
      amountMinor: 20_000,
      mode: "cash",
      bankAccountId: bankAId,
      expenseDate: new Date(),
      createdByUserId: tenants.userAId,
    });
    expect(expense.ok).toBe(true);
    if (!expense.ok) return;

    const [expensePayment] = await Payment.find({
      businessId: tenants.businessAId,
      linkedDocumentType: "expense",
      linkedDocumentId: expense.expense._id,
    }).lean();
    expect(isPaymentEditable({ linkedDocumentType: "expense", source: "manual" })).toBe(false);

    const result = await updatePayment(
      String(expensePayment._id),
      tenants.businessAId,
      { amountMinor: 25_000, mode: "cash", bankAccountId: bankAId, paymentDate: new Date() },
      tenants.userAId,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_editable");
  });

  it("treats a gateway-sourced payment as not editable", () => {
    expect(isPaymentEditable({ source: "gateway" })).toBe(false);
    expect(isPaymentEditable({ source: "manual" })).toBe(true);
  });
});
