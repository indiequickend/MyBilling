import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTwoTenants, teardownTwoTenants, type TwoTenants } from "../helpers/twoTenants";
import { createBankAccount } from "@/lib/db/queries/bankAccounts";
import { createExpenseCategory } from "@/lib/db/queries/expenseCategories";
import { createCustomer } from "@/lib/db/queries/customers";
import { createVendor } from "@/lib/db/queries/vendors";
import { createInvoice } from "@/lib/db/queries/invoices";
import { createPurchase } from "@/lib/db/queries/purchases";
import { createCreditNote } from "@/lib/db/queries/creditNotes";
import { createDebitNote } from "@/lib/db/queries/debitNotes";
import { createExpense } from "@/lib/db/queries/expenses";
import { createIndirectIncome } from "@/lib/db/queries/indirectIncome";
import { createQuotation } from "@/lib/db/queries/quotations";
import { createPurchaseOrder } from "@/lib/db/queries/purchaseOrders";
import {
  getProfitAndLoss,
  getDayBook,
  getHsnSummary,
  getTdsTcsReport,
  getDocumentConversionHistory,
  getSalesTrend,
} from "@/lib/db/queries/reports";
import { Invoice } from "@/lib/db/models/Invoice";
import { Purchase } from "@/lib/db/models/Purchase";
import { CreditNote } from "@/lib/db/models/CreditNote";
import { DebitNote } from "@/lib/db/models/DebitNote";
import { Expense } from "@/lib/db/models/Expense";
import { IndirectIncome } from "@/lib/db/models/IndirectIncome";
import { Quotation } from "@/lib/db/models/Quotation";
import { PurchaseOrder } from "@/lib/db/models/PurchaseOrder";
import { Customer } from "@/lib/db/models/Customer";
import { Vendor } from "@/lib/db/models/Vendor";
import { Business } from "@/lib/db/models/Business";
import { ExpenseCategory } from "@/lib/db/models/ExpenseCategory";
import { BankAccount } from "@/lib/db/models/BankAccount";

describe("reports — tenant isolation and correctness", () => {
  let tenants: TwoTenants;
  let customerAId: string;
  let vendorAId: string;
  let customerBId: string;
  let vendorBId: string;
  let categoryAId: string;
  let categoryBId: string;
  let bankAId: string;
  let bankBId: string;

  // P&L period — Sales(A) 118,000 - Returns 11,800 = Net Sales 106,200;
  // Purchases(A) 35,400 - Returns 5,900 = Net Purchases 29,500; Expenses 20,000; Indirect Income 8,000.
  // Net Profit = 106,200 - 29,500 - 20,000 + 8,000 = 64,700.
  const plFrom = new Date("2031-01-01");
  const plTo = new Date("2031-01-31");
  const plDate = new Date("2031-01-15");

  const dayBookDate = new Date("2031-02-10");
  const dayBookFrom = new Date("2031-02-01");
  const dayBookTo = new Date("2031-02-28");

  const hsnFrom = new Date("2031-03-01");
  const hsnTo = new Date("2031-03-31");
  const hsnDate = new Date("2031-03-05");

  const tdsTcsFrom = new Date("2031-04-01");
  const tdsTcsTo = new Date("2031-04-30");
  const tdsTcsDate = new Date("2031-04-05");

  let invoiceAId: string;
  let purchaseAId: string;

  beforeAll(async () => {
    tenants = await setupTwoTenants("reports");
    await Business.updateOne(
      { _id: tenants.businessAId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );
    await Business.updateOne(
      { _id: tenants.businessBId },
      { $set: { "addresses.billing.state": "Maharashtra" } },
    );

    const [customerA, customerB, vendorA, vendorB, categoryA, categoryB, bankA, bankB] = await Promise.all([
      createCustomer({ businessId: tenants.businessAId, displayName: "Customer A" }),
      createCustomer({ businessId: tenants.businessBId, displayName: "Customer B" }),
      createVendor({ businessId: tenants.businessAId, displayName: "Vendor A" }),
      createVendor({ businessId: tenants.businessBId, displayName: "Vendor B" }),
      createExpenseCategory({ businessId: tenants.businessAId, name: "Rent" }),
      createExpenseCategory({ businessId: tenants.businessBId, name: "Rent" }),
      createBankAccount({ businessId: tenants.businessAId, type: "cash", name: "Cash" }),
      createBankAccount({ businessId: tenants.businessBId, type: "cash", name: "Cash" }),
    ]);
    if (!customerA.ok || !customerB.ok || !vendorA.ok || !vendorB.ok) throw new Error("setup failed");
    customerAId = String(customerA.customer._id);
    customerBId = String(customerB.customer._id);
    vendorAId = String(vendorA.vendor._id);
    vendorBId = String(vendorB.vendor._id);
    categoryAId = String(categoryA._id);
    categoryBId = String(categoryB._id);
    bankAId = String(bankA._id);
    bankBId = String(bankB._id);

    // --- P&L period (2031-01) ---
    const invoiceA = await createInvoice({
      businessId: tenants.businessAId,
      customerId: customerAId,
      invoiceDate: plDate,
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "Consulting",
          quantity: 2,
          unitPriceMinor: 50_000,
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
      purchaseDate: plDate,
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "Raw material",
          quantity: 1,
          unitPriceMinor: 30_000,
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
    invoiceAId = String(invoiceA.invoice._id);
    purchaseAId = String(purchaseA.purchase._id);

    const creditNoteA = await createCreditNote({
      businessId: tenants.businessAId,
      linkedInvoiceId: invoiceAId,
      creditNoteDate: plDate,
      placeOfSupplyState: "Maharashtra",
      lineItems: [
        {
          description: "Partial return",
          quantity: 1,
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
    const debitNoteA = await createDebitNote({
      businessId: tenants.businessAId,
      linkedPurchaseId: purchaseAId,
      debitNoteDate: plDate,
      placeOfSupplyState: "Maharashtra",
      lineItems: [
        {
          description: "Partial return",
          quantity: 1,
          unitPriceMinor: 5_000,
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
    if (!creditNoteA.ok || !debitNoteA.ok) throw new Error("setup failed");

    const expenseA = await createExpense({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 20_000,
      mode: "cash",
      bankAccountId: bankAId,
      expenseDate: plDate,
      createdByUserId: tenants.userAId,
    });
    const indirectIncomeA = await createIndirectIncome({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 8_000,
      mode: "cash",
      bankAccountId: bankAId,
      incomeDate: plDate,
      createdByUserId: tenants.userAId,
    });
    if (!expenseA.ok || !indirectIncomeA.ok) throw new Error("setup failed");

    // Business B: a much larger P&L-period invoice that must never leak into A's totals.
    const invoiceB = await createInvoice({
      businessId: tenants.businessBId,
      customerId: customerBId,
      invoiceDate: plDate,
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "Big deal",
          quantity: 1,
          unitPriceMinor: 999_999,
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

    // --- Day Book / Sales trend day (2031-02-10) ---
    const dayBookInvoiceA = await createInvoice({
      businessId: tenants.businessAId,
      customerId: customerAId,
      invoiceDate: dayBookDate,
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "Day book item",
          quantity: 1,
          unitPriceMinor: 100_000,
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
    if (!dayBookInvoiceA.ok) throw new Error("setup failed");
    await createExpense({
      businessId: tenants.businessAId,
      categoryId: categoryAId,
      amountMinor: 3_000,
      mode: "cash",
      bankAccountId: bankAId,
      expenseDate: dayBookDate,
      createdByUserId: tenants.userAId,
    });
    const dayBookInvoiceB = await createInvoice({
      businessId: tenants.businessBId,
      customerId: customerBId,
      invoiceDate: dayBookDate,
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "Other tenant",
          quantity: 1,
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
    if (!dayBookInvoiceB.ok) throw new Error("setup failed");

    // --- HSN summary period (2031-03) ---
    const hsnInvoiceA = await createInvoice({
      businessId: tenants.businessAId,
      customerId: customerAId,
      invoiceDate: hsnDate,
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "Rice",
          hsnOrSac: "1006",
          quantity: 2,
          unitPriceMinor: 50_000,
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
    if (!hsnInvoiceA.ok) throw new Error("setup failed");
    const hsnInvoiceB = await createInvoice({
      businessId: tenants.businessBId,
      customerId: customerBId,
      invoiceDate: hsnDate,
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "Other tenant item",
          hsnOrSac: "9999",
          quantity: 1,
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
    if (!hsnInvoiceB.ok) throw new Error("setup failed");

    // --- TDS/TCS period (2031-04) ---
    const tcsInvoiceA = await createInvoice({
      businessId: tenants.businessAId,
      customerId: customerAId,
      invoiceDate: tdsTcsDate,
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "TCS sale",
          quantity: 1,
          unitPriceMinor: 200_000,
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
      tcsApplicable: true,
      tcsSectionCode: "206C(1H)",
      tcsRatePercent: 0.1,
      tcsAmountMinor: 200,
    });
    const tdsTcsPurchaseA = await createPurchase({
      businessId: tenants.businessAId,
      vendorId: vendorAId,
      purchaseDate: tdsTcsDate,
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "TDS/TCS purchase",
          quantity: 1,
          unitPriceMinor: 150_000,
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
      tdsApplicable: true,
      tdsSectionCode: "194Q",
      tdsRatePercent: 0.1,
      tdsAmountMinor: 150,
      tcsApplicable: true,
      tcsSectionCode: "206C(1H)",
      tcsRatePercent: 0.1,
      tcsAmountMinor: 150,
    });
    if (!tcsInvoiceA.ok || !tdsTcsPurchaseA.ok) throw new Error("setup failed");
    const tdsTcsPurchaseB = await createPurchase({
      businessId: tenants.businessBId,
      vendorId: vendorBId,
      purchaseDate: tdsTcsDate,
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "Other tenant TDS purchase",
          quantity: 1,
          unitPriceMinor: 900_000,
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
      tdsApplicable: true,
      tdsSectionCode: "194Q",
      tdsRatePercent: 0.1,
      tdsAmountMinor: 900,
    });
    if (!tdsTcsPurchaseB.ok) throw new Error("setup failed");

    // --- Document conversion history ---
    const quotationA = await createQuotation({
      businessId: tenants.businessAId,
      customerId: customerAId,
      quotationDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "Quoted item",
          quantity: 1,
          unitPriceMinor: 40_000,
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
    if (!quotationA.ok) throw new Error("setup failed");
    const invoiceFromQuotationA = await createInvoice({
      businessId: tenants.businessAId,
      customerId: customerAId,
      invoiceDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "Quoted item",
          quantity: 1,
          unitPriceMinor: 40_000,
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
      sourceQuotationId: String(quotationA.quotation._id),
    });
    if (!invoiceFromQuotationA.ok) throw new Error("setup failed");

    const purchaseOrderA = await createPurchaseOrder({
      businessId: tenants.businessAId,
      vendorId: vendorAId,
      orderDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "Ordered item",
          quantity: 1,
          unitPriceMinor: 25_000,
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
    if (!purchaseOrderA.ok) throw new Error("setup failed");
    const purchaseFromOrderA = await createPurchase({
      businessId: tenants.businessAId,
      vendorId: vendorAId,
      purchaseDate: new Date(),
      placeOfSupplyState: "Maharashtra",
      reverseCharge: false,
      lineItems: [
        {
          description: "Ordered item",
          quantity: 1,
          unitPriceMinor: 25_000,
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
      sourcePurchaseOrderId: String(purchaseOrderA.purchaseOrder._id),
    });
    if (!purchaseFromOrderA.ok) throw new Error("setup failed");
  });

  afterAll(async () => {
    const businessIds = [tenants.businessAId, tenants.businessBId];
    await Promise.all([
      Invoice.deleteMany({ businessId: { $in: businessIds } }),
      Purchase.deleteMany({ businessId: { $in: businessIds } }),
      CreditNote.deleteMany({ businessId: { $in: businessIds } }),
      DebitNote.deleteMany({ businessId: { $in: businessIds } }),
      Expense.deleteMany({ businessId: { $in: businessIds } }),
      IndirectIncome.deleteMany({ businessId: { $in: businessIds } }),
      Quotation.deleteMany({ businessId: { $in: businessIds } }),
      PurchaseOrder.deleteMany({ businessId: { $in: businessIds } }),
      Customer.deleteMany({ businessId: { $in: businessIds } }),
      Vendor.deleteMany({ businessId: { $in: businessIds } }),
      ExpenseCategory.deleteMany({ businessId: { $in: businessIds } }),
      BankAccount.deleteMany({ businessId: { $in: businessIds } }),
    ]);
    await teardownTwoTenants(tenants);
  });

  it("getProfitAndLoss matches Sales minus Purchases minus Expenses plus Indirect Income, net of returns", async () => {
    const pl = await getProfitAndLoss(tenants.businessAId, { dateFrom: plFrom, dateTo: plTo });
    expect(pl.salesMinor).toBe(118_000);
    expect(pl.salesReturnsMinor).toBe(11_800);
    expect(pl.netSalesMinor).toBe(106_200);
    expect(pl.purchasesMinor).toBe(35_400);
    expect(pl.purchaseReturnsMinor).toBe(5_900);
    expect(pl.netPurchasesMinor).toBe(29_500);
    expect(pl.expensesMinor).toBe(20_000);
    expect(pl.indirectIncomeMinor).toBe(8_000);
    expect(pl.netProfitMinor).toBe(64_700);

    const plB = await getProfitAndLoss(tenants.businessBId, { dateFrom: plFrom, dateTo: plTo });
    expect(plB.salesMinor).not.toBe(pl.salesMinor);
  });

  it("getDayBook returns every transaction type for the day, scoped per business", async () => {
    const dayBookA = await getDayBook(tenants.businessAId, dayBookDate);
    expect(dayBookA.some((e) => e.type === "invoice" && e.amountMinor === 118_000)).toBe(true);
    expect(dayBookA.some((e) => e.type === "expense" && e.amountMinor === 3_000)).toBe(true);
    expect(dayBookA.some((e) => e.amountMinor === 590_000)).toBe(false);
  });

  it("getHsnSummary sums taxable/tax amounts per HSN code, scoped per business", async () => {
    const rowsA = await getHsnSummary(tenants.businessAId, { dateFrom: hsnFrom, dateTo: hsnTo });
    const rice = rowsA.find((r) => r.hsnOrSac === "1006");
    expect(rice).toBeDefined();
    expect(rice?.taxableAmountMinor).toBe(100_000);
    expect(rice?.cgstMinor).toBe(9_000);
    expect(rice?.sgstMinor).toBe(9_000);
    expect(rice?.igstMinor).toBe(0);
    expect(rice?.totalMinor).toBe(118_000);
    expect(rowsA.some((r) => r.hsnOrSac === "9999")).toBe(false);
  });

  it("getTdsTcsReport reports tcs_on_sales from Invoice and tds_deducted/tcs_paid from Purchase, scoped per business", async () => {
    const rowsA = await getTdsTcsReport(tenants.businessAId, { dateFrom: tdsTcsFrom, dateTo: tdsTcsTo });
    expect(rowsA.find((r) => r.kind === "tcs_on_sales")?.amountMinor).toBe(200);
    expect(rowsA.find((r) => r.kind === "tds_deducted")?.amountMinor).toBe(150);
    expect(rowsA.find((r) => r.kind === "tcs_paid")?.amountMinor).toBe(150);
    expect(rowsA.every((r) => r.amountMinor !== 900)).toBe(true);
  });

  it("getDocumentConversionHistory derives entries from sourceQuotationId/sourcePurchaseOrderId, scoped per business", async () => {
    const historyA = await getDocumentConversionHistory(tenants.businessAId);
    const fromQuotation = historyA.find((e) => e.sourceType === "quotation" && e.targetType === "invoice");
    expect(fromQuotation).toBeDefined();
    expect(fromQuotation?.sourceDocNumber).toMatch(/^QUO-/);
    expect(fromQuotation?.lineItemCount).toBe(1);

    const fromPurchaseOrder = historyA.find(
      (e) => e.sourceType === "purchase_order" && e.targetType === "purchase",
    );
    expect(fromPurchaseOrder).toBeDefined();
    expect(fromPurchaseOrder?.sourceDocNumber).toMatch(/^PO-/);

    const historyB = await getDocumentConversionHistory(tenants.businessBId);
    expect(historyB).toHaveLength(0);
  });

  it("getSalesTrend buckets finalized invoice totals by day, scoped per business", async () => {
    const trendA = await getSalesTrend(tenants.businessAId, {
      dateFrom: dayBookFrom,
      dateTo: dayBookTo,
      bucket: "day",
    });
    expect(trendA).toHaveLength(1);
    expect(trendA[0].totalMinor).toBe(118_000);
  });
});
