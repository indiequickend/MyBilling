import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { Invoice } from "@/lib/db/models/Invoice";
import { Purchase } from "@/lib/db/models/Purchase";
import { CreditNote } from "@/lib/db/models/CreditNote";
import { DebitNote } from "@/lib/db/models/DebitNote";
import { Payment } from "@/lib/db/models/Payment";
import { Expense } from "@/lib/db/models/Expense";
import { IndirectIncome } from "@/lib/db/models/IndirectIncome";
import { Journal } from "@/lib/db/models/Journal";
import { SalesOrder } from "@/lib/db/models/SalesOrder";
import { Quotation } from "@/lib/db/models/Quotation";
import { PurchaseOrder } from "@/lib/db/models/PurchaseOrder";
import { Customer } from "@/lib/db/models/Customer";
import { Vendor } from "@/lib/db/models/Vendor";
import { sumCreditNoteTotals } from "@/lib/db/queries/creditNotes";
import { sumDebitNoteTotals } from "@/lib/db/queries/debitNotes";
import { sumExpenseTotals } from "@/lib/db/queries/expenses";
import { sumIndirectIncomeTotals } from "@/lib/db/queries/indirectIncome";

export type DateRangeParams = { dateFrom?: Date; dateTo?: Date };

function dateRangeFilter(params: DateRangeParams): Record<string, Date> | undefined {
  if (!params.dateFrom && !params.dateTo) return undefined;
  const range: Record<string, Date> = {};
  if (params.dateFrom) range.$gte = params.dateFrom;
  if (params.dateTo) range.$lte = params.dateTo;
  return range;
}

/** Sums grandTotalMinor for finalized (non-draft, non-cancelled) Invoice/Purchase documents in a
 * date range — deliberately not reusing sumInvoiceTotals/sumPurchaseTotals, since those don't
 * exclude draft/cancelled by default and P&L must never count a document that was never issued or
 * was voided. */
async function sumFinalizedDocumentTotals(
  model: typeof Invoice | typeof Purchase,
  businessId: string,
  dateField: string,
  params: DateRangeParams,
): Promise<number> {
  await connectToDatabase();
  const match: Record<string, unknown> = {
    businessId: new mongoose.Types.ObjectId(businessId),
    status: { $nin: ["draft", "cancelled"] },
  };
  const range = dateRangeFilter(params);
  if (range) match[dateField] = range;
  const [agg] = await model.aggregate([
    { $match: match },
    { $group: { _id: null, totalMinor: { $sum: "$grandTotalMinor" } } },
  ]);
  return agg?.totalMinor ?? 0;
}

export type ProfitAndLoss = {
  salesMinor: number;
  salesReturnsMinor: number;
  netSalesMinor: number;
  purchasesMinor: number;
  purchaseReturnsMinor: number;
  netPurchasesMinor: number;
  expensesMinor: number;
  indirectIncomeMinor: number;
  netProfitMinor: number;
};

/** The spec's literal verify formula is "Sales minus Purchases minus Expenses plus Indirect
 * Income" for a period. This computes it net of returns (Credit/Debit Notes) for accounting
 * correctness — when no returns exist in the period the two are identical. */
export async function getProfitAndLoss(
  businessId: string,
  params: DateRangeParams = {},
): Promise<ProfitAndLoss> {
  await connectToDatabase();
  const [salesMinor, purchasesMinor, creditNotes, debitNotes, expenses, indirectIncome] = await Promise.all([
    sumFinalizedDocumentTotals(Invoice, businessId, "invoiceDate", params),
    sumFinalizedDocumentTotals(Purchase, businessId, "purchaseDate", params),
    sumCreditNoteTotals(businessId, params),
    sumDebitNoteTotals(businessId, params),
    sumExpenseTotals(businessId, params),
    sumIndirectIncomeTotals(businessId, params),
  ]);
  const salesReturnsMinor = creditNotes.totalMinor;
  const purchaseReturnsMinor = debitNotes.totalMinor;
  const netSalesMinor = salesMinor - salesReturnsMinor;
  const netPurchasesMinor = purchasesMinor - purchaseReturnsMinor;
  const expensesMinor = expenses.totalMinor;
  const indirectIncomeMinor = indirectIncome.totalMinor;
  const netProfitMinor = netSalesMinor - netPurchasesMinor - expensesMinor + indirectIncomeMinor;
  return {
    salesMinor,
    salesReturnsMinor,
    netSalesMinor,
    purchasesMinor,
    purchaseReturnsMinor,
    netPurchasesMinor,
    expensesMinor,
    indirectIncomeMinor,
    netProfitMinor,
  };
}

export type DayBookEntryType =
  | "invoice"
  | "purchase"
  | "credit_note"
  | "debit_note"
  | "payment"
  | "expense"
  | "indirect_income"
  | "journal";

export type DayBookEntry = {
  date: Date;
  type: DayBookEntryType;
  docNumber?: string;
  description: string;
  partyName?: string;
  amountMinor: number;
  documentId: string;
};

/** Chronological list of every transaction of every type on a given calendar day (UTC), per
 * project_spec.md's Day Book. One day-bounded query per collection, merged and sorted. */
export async function getDayBook(businessId: string, date: Date): Promise<DayBookEntry[]> {
  await connectToDatabase();
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  const range = { $gte: start, $lte: end };

  const [invoices, purchases, creditNotes, debitNotes, payments, expenses, indirectIncome, journals] =
    await Promise.all([
      Invoice.find({ businessId, invoiceDate: range, deletedAt: { $exists: false } })
        .select("docNumber invoiceDate grandTotalMinor customerSnapshot")
        .lean(),
      Purchase.find({ businessId, purchaseDate: range, deletedAt: { $exists: false } })
        .select("docNumber purchaseDate grandTotalMinor vendorSnapshot")
        .lean(),
      CreditNote.find({ businessId, creditNoteDate: range, deletedAt: { $exists: false } })
        .select("docNumber creditNoteDate grandTotalMinor customerSnapshot")
        .lean(),
      DebitNote.find({ businessId, debitNoteDate: range, deletedAt: { $exists: false } })
        .select("docNumber debitNoteDate grandTotalMinor vendorSnapshot")
        .lean(),
      Payment.find({ businessId, paymentDate: range, voidedAt: { $exists: false } })
        .select("paymentDate amountMinor direction referenceNote")
        .lean(),
      Expense.find({ businessId, expenseDate: range, deletedAt: { $exists: false } })
        .select("expenseDate amountMinor supplierName description")
        .lean(),
      IndirectIncome.find({ businessId, incomeDate: range, deletedAt: { $exists: false } })
        .select("incomeDate amountMinor sourceName description")
        .lean(),
      Journal.find({ businessId, journalDate: range, deletedAt: { $exists: false } })
        .select("docNumber journalDate narration totalMinor")
        .lean(),
    ]);

  const entries: DayBookEntry[] = [
    ...invoices.map((i) => ({
      date: i.invoiceDate,
      type: "invoice" as const,
      docNumber: i.docNumber,
      description: i.docNumber ? `Invoice ${i.docNumber}` : "Invoice (draft)",
      partyName: i.customerSnapshot?.displayName,
      amountMinor: i.grandTotalMinor,
      documentId: String(i._id),
    })),
    ...purchases.map((p) => ({
      date: p.purchaseDate,
      type: "purchase" as const,
      docNumber: p.docNumber,
      description: p.docNumber ? `Purchase ${p.docNumber}` : "Purchase (draft)",
      partyName: p.vendorSnapshot?.displayName,
      amountMinor: p.grandTotalMinor,
      documentId: String(p._id),
    })),
    ...creditNotes.map((cn) => ({
      date: cn.creditNoteDate,
      type: "credit_note" as const,
      docNumber: cn.docNumber,
      description: cn.docNumber ? `Credit Note ${cn.docNumber}` : "Credit Note (draft)",
      partyName: cn.customerSnapshot?.displayName,
      amountMinor: cn.grandTotalMinor,
      documentId: String(cn._id),
    })),
    ...debitNotes.map((dn) => ({
      date: dn.debitNoteDate,
      type: "debit_note" as const,
      docNumber: dn.docNumber,
      description: dn.docNumber ? `Debit Note ${dn.docNumber}` : "Debit Note (draft)",
      partyName: dn.vendorSnapshot?.displayName,
      amountMinor: dn.grandTotalMinor,
      documentId: String(dn._id),
    })),
    ...payments.map((p) => ({
      date: p.paymentDate,
      type: "payment" as const,
      description: p.referenceNote || (p.direction === "in" ? "Payment received" : "Payment made"),
      amountMinor: p.amountMinor,
      documentId: String(p._id),
    })),
    ...expenses.map((e) => ({
      date: e.expenseDate,
      type: "expense" as const,
      description: e.description || e.supplierName || "Expense",
      partyName: e.supplierName,
      amountMinor: e.amountMinor,
      documentId: String(e._id),
    })),
    ...indirectIncome.map((ii) => ({
      date: ii.incomeDate,
      type: "indirect_income" as const,
      description: ii.description || ii.sourceName || "Indirect income",
      partyName: ii.sourceName,
      amountMinor: ii.amountMinor,
      documentId: String(ii._id),
    })),
    ...journals.map((j) => ({
      date: j.journalDate,
      type: "journal" as const,
      docNumber: j.docNumber ?? undefined,
      description: j.narration,
      amountMinor: j.totalMinor,
      documentId: String(j._id),
    })),
  ];

  return entries.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export type HsnSummaryRow = {
  hsnOrSac: string;
  taxableAmountMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalMinor: number;
};

/** "Sale Summary by HSN" (project_spec.md Tax reports) — Invoice-only, grouped by each line
 * item's HSN/SAC code. */
export async function getHsnSummary(
  businessId: string,
  params: DateRangeParams = {},
): Promise<HsnSummaryRow[]> {
  await connectToDatabase();
  const match: Record<string, unknown> = {
    businessId: new mongoose.Types.ObjectId(businessId),
    status: { $ne: "draft" },
  };
  const range = dateRangeFilter(params);
  if (range) match.invoiceDate = range;

  const rows = await Invoice.aggregate([
    { $match: match },
    { $unwind: "$lineItems" },
    {
      $group: {
        _id: { $ifNull: ["$lineItems.hsnOrSac", "—"] },
        taxableAmountMinor: { $sum: "$lineItems.taxableAmountMinor" },
        cgstMinor: { $sum: "$lineItems.cgstMinor" },
        sgstMinor: { $sum: "$lineItems.sgstMinor" },
        igstMinor: { $sum: "$lineItems.igstMinor" },
        totalMinor: { $sum: "$lineItems.totalMinor" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((r) => ({
    hsnOrSac: r._id as string,
    taxableAmountMinor: r.taxableAmountMinor as number,
    cgstMinor: r.cgstMinor as number,
    sgstMinor: r.sgstMinor as number,
    igstMinor: r.igstMinor as number,
    totalMinor: r.totalMinor as number,
  }));
}

export type TdsTcsKind = "tcs_on_sales" | "tds_deducted" | "tcs_paid";

export type TdsTcsRow = {
  documentType: "invoice" | "purchase" | "expense";
  documentId: string;
  docNumber?: string;
  date: Date;
  partyName?: string;
  sectionCode?: string;
  ratePercent?: number;
  amountMinor: number;
  kind: TdsTcsKind;
};

/** project_spec.md's "TDS/TCS Receivable/Payable" — tcs_on_sales is TCS the business collects
 * from customers (Invoice), tds_deducted/tcs_paid are the payable side recorded on Purchase or
 * Expense (see TDS/TCS field doc-comments on those models). */
export async function getTdsTcsReport(
  businessId: string,
  params: DateRangeParams = {},
): Promise<TdsTcsRow[]> {
  await connectToDatabase();
  const range = dateRangeFilter(params);

  const [invoices, purchases, expenses] = await Promise.all([
    Invoice.find({
      businessId,
      tcsApplicable: true,
      deletedAt: { $exists: false },
      ...(range ? { invoiceDate: range } : {}),
    })
      .select("docNumber invoiceDate tcsSectionCode tcsRatePercent tcsAmountMinor customerSnapshot")
      .lean(),
    Purchase.find({
      businessId,
      deletedAt: { $exists: false },
      $or: [{ tdsApplicable: true }, { tcsApplicable: true }],
      ...(range ? { purchaseDate: range } : {}),
    })
      .select(
        "docNumber purchaseDate tdsApplicable tdsSectionCode tdsRatePercent tdsAmountMinor tcsApplicable tcsSectionCode tcsRatePercent tcsAmountMinor vendorSnapshot",
      )
      .lean(),
    Expense.find({
      businessId,
      deletedAt: { $exists: false },
      $or: [{ tdsApplicable: true }, { tcsApplicable: true }],
      ...(range ? { expenseDate: range } : {}),
    })
      .select(
        "expenseDate tdsApplicable tdsSectionCode tdsRatePercent tdsAmountMinor tcsApplicable tcsSectionCode tcsRatePercent tcsAmountMinor supplierName",
      )
      .lean(),
  ]);

  const rows: TdsTcsRow[] = [];
  for (const inv of invoices) {
    rows.push({
      documentType: "invoice",
      documentId: String(inv._id),
      docNumber: inv.docNumber,
      date: inv.invoiceDate,
      partyName: inv.customerSnapshot?.displayName,
      sectionCode: inv.tcsSectionCode,
      ratePercent: inv.tcsRatePercent,
      amountMinor: inv.tcsAmountMinor,
      kind: "tcs_on_sales",
    });
  }
  for (const p of purchases) {
    if (p.tdsApplicable) {
      rows.push({
        documentType: "purchase",
        documentId: String(p._id),
        docNumber: p.docNumber,
        date: p.purchaseDate,
        partyName: p.vendorSnapshot?.displayName,
        sectionCode: p.tdsSectionCode,
        ratePercent: p.tdsRatePercent,
        amountMinor: p.tdsAmountMinor,
        kind: "tds_deducted",
      });
    }
    if (p.tcsApplicable) {
      rows.push({
        documentType: "purchase",
        documentId: String(p._id),
        docNumber: p.docNumber,
        date: p.purchaseDate,
        partyName: p.vendorSnapshot?.displayName,
        sectionCode: p.tcsSectionCode,
        ratePercent: p.tcsRatePercent,
        amountMinor: p.tcsAmountMinor,
        kind: "tcs_paid",
      });
    }
  }
  for (const e of expenses) {
    if (e.tdsApplicable) {
      rows.push({
        documentType: "expense",
        documentId: String(e._id),
        date: e.expenseDate,
        partyName: e.supplierName,
        sectionCode: e.tdsSectionCode,
        ratePercent: e.tdsRatePercent,
        amountMinor: e.tdsAmountMinor,
        kind: "tds_deducted",
      });
    }
    if (e.tcsApplicable) {
      rows.push({
        documentType: "expense",
        documentId: String(e._id),
        date: e.expenseDate,
        partyName: e.supplierName,
        sectionCode: e.tcsSectionCode,
        ratePercent: e.tcsRatePercent,
        amountMinor: e.tcsAmountMinor,
        kind: "tcs_paid",
      });
    }
  }

  return rows.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export type ConversionSourceType = "quotation" | "sales_order" | "purchase_order";
export type ConversionTargetType = "invoice" | "sales_order" | "purchase";

export type ConversionHistoryEntry = {
  sourceType: ConversionSourceType;
  sourceId: string;
  sourceDocNumber?: string;
  targetType: ConversionTargetType;
  targetId: string;
  targetDocNumber?: string;
  convertedAt: Date;
  lineItemCount: number;
};

/**
 * Derives conversion history from the reference fields Invoice/SalesOrder/Purchase already carry
 * (sourceQuotationId, sourceSalesOrderId, sourcePurchaseOrderId) — conversion in this app is a UI
 * pre-fill (lib/documents/conversion.ts), not a persisted clone, so there is no separate
 * conversion-log collection to query.
 */
export async function getDocumentConversionHistory(
  businessId: string,
  params: DateRangeParams = {},
): Promise<ConversionHistoryEntry[]> {
  await connectToDatabase();
  const range = dateRangeFilter(params);

  const [invoices, salesOrders, purchases] = await Promise.all([
    Invoice.find({
      businessId,
      deletedAt: { $exists: false },
      $or: [{ sourceQuotationId: { $exists: true } }, { sourceSalesOrderId: { $exists: true } }],
      ...(range ? { createdAt: range } : {}),
    })
      .select("docNumber createdAt sourceQuotationId sourceSalesOrderId lineItems")
      .lean(),
    SalesOrder.find({
      businessId,
      deletedAt: { $exists: false },
      sourceQuotationId: { $exists: true },
      ...(range ? { createdAt: range } : {}),
    })
      .select("docNumber createdAt sourceQuotationId lineItems")
      .lean(),
    Purchase.find({
      businessId,
      deletedAt: { $exists: false },
      sourcePurchaseOrderId: { $exists: true },
      ...(range ? { createdAt: range } : {}),
    })
      .select("docNumber createdAt sourcePurchaseOrderId lineItems")
      .lean(),
  ]);

  const quotationIds = [
    ...new Set([
      ...invoices.filter((i) => i.sourceQuotationId).map((i) => String(i.sourceQuotationId)),
      ...salesOrders.map((s) => String(s.sourceQuotationId)),
    ]),
  ];
  const sourceSalesOrderIds = [
    ...new Set(invoices.filter((i) => i.sourceSalesOrderId).map((i) => String(i.sourceSalesOrderId))),
  ];
  const purchaseOrderIds = [...new Set(purchases.map((p) => String(p.sourcePurchaseOrderId)))];

  const [quotations, sourceSalesOrders, purchaseOrders] = await Promise.all([
    quotationIds.length ? Quotation.find({ _id: { $in: quotationIds } }).select("docNumber").lean() : [],
    sourceSalesOrderIds.length
      ? SalesOrder.find({ _id: { $in: sourceSalesOrderIds } }).select("docNumber").lean()
      : [],
    purchaseOrderIds.length
      ? PurchaseOrder.find({ _id: { $in: purchaseOrderIds } }).select("docNumber").lean()
      : [],
  ]);

  const quotationNumber = new Map(quotations.map((q) => [String(q._id), q.docNumber as string | undefined]));
  const salesOrderNumber = new Map(
    sourceSalesOrders.map((s) => [String(s._id), s.docNumber as string | undefined]),
  );
  const purchaseOrderNumber = new Map(
    purchaseOrders.map((po) => [String(po._id), po.docNumber as string | undefined]),
  );

  const entries: ConversionHistoryEntry[] = [];
  for (const inv of invoices) {
    if (inv.sourceQuotationId) {
      entries.push({
        sourceType: "quotation",
        sourceId: String(inv.sourceQuotationId),
        sourceDocNumber: quotationNumber.get(String(inv.sourceQuotationId)),
        targetType: "invoice",
        targetId: String(inv._id),
        targetDocNumber: inv.docNumber,
        convertedAt: inv.createdAt,
        lineItemCount: inv.lineItems.length,
      });
    }
    if (inv.sourceSalesOrderId) {
      entries.push({
        sourceType: "sales_order",
        sourceId: String(inv.sourceSalesOrderId),
        sourceDocNumber: salesOrderNumber.get(String(inv.sourceSalesOrderId)),
        targetType: "invoice",
        targetId: String(inv._id),
        targetDocNumber: inv.docNumber,
        convertedAt: inv.createdAt,
        lineItemCount: inv.lineItems.length,
      });
    }
  }
  for (const so of salesOrders) {
    entries.push({
      sourceType: "quotation",
      sourceId: String(so.sourceQuotationId),
      sourceDocNumber: quotationNumber.get(String(so.sourceQuotationId)),
      targetType: "sales_order",
      targetId: String(so._id),
      targetDocNumber: so.docNumber,
      convertedAt: so.createdAt,
      lineItemCount: so.lineItems.length,
    });
  }
  for (const p of purchases) {
    entries.push({
      sourceType: "purchase_order",
      sourceId: String(p.sourcePurchaseOrderId),
      sourceDocNumber: purchaseOrderNumber.get(String(p.sourcePurchaseOrderId)),
      targetType: "purchase",
      targetId: String(p._id),
      targetDocNumber: p.docNumber,
      convertedAt: p.createdAt,
      lineItemCount: p.lineItems.length,
    });
  }

  return entries.sort((a, b) => b.convertedAt.getTime() - a.convertedAt.getTime());
}

export type SalesTrendPoint = { periodStart: Date; totalMinor: number };

/** Powers the Insights "Sales-trend" and "Weekly Revenue" charts — bucketed sum of finalized
 * Invoice totals. */
export async function getSalesTrend(
  businessId: string,
  params: DateRangeParams & { bucket?: "day" | "week" } = {},
): Promise<SalesTrendPoint[]> {
  await connectToDatabase();
  const match: Record<string, unknown> = {
    businessId: new mongoose.Types.ObjectId(businessId),
    status: { $nin: ["draft", "cancelled"] },
  };
  const range = dateRangeFilter(params);
  if (range) match.invoiceDate = range;

  const unit = params.bucket === "week" ? "week" : "day";
  const rows = await Invoice.aggregate([
    { $match: match },
    { $group: { _id: { $dateTrunc: { date: "$invoiceDate", unit } }, totalMinor: { $sum: "$grandTotalMinor" } } },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((r) => ({ periodStart: r._id as Date, totalMinor: r.totalMinor as number }));
}

export type ProfitAndLossRow = { label: string; amountMinor: number };

/** Shapes getProfitAndLoss's single object into the row array both the page and its export route
 * render — keeps the two in sync by construction rather than duplicating the line list. */
export function buildProfitAndLossRows(pl: ProfitAndLoss): ProfitAndLossRow[] {
  return [
    { label: "Sales", amountMinor: pl.salesMinor },
    { label: "Sales Returns", amountMinor: -pl.salesReturnsMinor },
    { label: "Net Sales", amountMinor: pl.netSalesMinor },
    { label: "Purchases", amountMinor: pl.purchasesMinor },
    { label: "Purchase Returns", amountMinor: -pl.purchaseReturnsMinor },
    { label: "Net Purchases", amountMinor: pl.netPurchasesMinor },
    { label: "Expenses", amountMinor: pl.expensesMinor },
    { label: "Indirect Income", amountMinor: pl.indirectIncomeMinor },
    { label: "Net Profit", amountMinor: pl.netProfitMinor },
  ];
}

export type TransactionReportRow = {
  date: Date;
  documentType: "invoice" | "purchase" | "credit_note" | "debit_note";
  docNumber?: string;
  partyName: string;
  status: string;
  taxableAmountMinor: number;
  taxMinor: number;
  grandTotalMinor: number;
  amountPaidMinor: number;
  balanceMinor: number;
  documentId: string;
};

/** "Transaction Report" — every finalized sale/purchase document (Invoice/Purchase/CreditNote/
 * DebitNote) merged into one chronological cross-cut. */
export async function getTransactionReport(
  businessId: string,
  params: DateRangeParams = {},
): Promise<TransactionReportRow[]> {
  await connectToDatabase();
  const range = dateRangeFilter(params);
  const baseFilter = (dateField: string): Record<string, unknown> => {
    const f: Record<string, unknown> = { businessId, deletedAt: { $exists: false }, status: { $ne: "draft" } };
    if (range) f[dateField] = range;
    return f;
  };

  const [invoices, purchases, creditNotes, debitNotes] = await Promise.all([
    Invoice.find(baseFilter("invoiceDate"))
      .select("docNumber invoiceDate status subtotalMinor totalTaxMinor grandTotalMinor amountPaidMinor customerSnapshot")
      .lean(),
    Purchase.find(baseFilter("purchaseDate"))
      .select("docNumber purchaseDate status subtotalMinor totalTaxMinor grandTotalMinor amountPaidMinor vendorSnapshot")
      .lean(),
    CreditNote.find(baseFilter("creditNoteDate"))
      .select("docNumber creditNoteDate status subtotalMinor totalTaxMinor grandTotalMinor customerSnapshot")
      .lean(),
    DebitNote.find(baseFilter("debitNoteDate"))
      .select("docNumber debitNoteDate status subtotalMinor totalTaxMinor grandTotalMinor vendorSnapshot")
      .lean(),
  ]);

  const rows: TransactionReportRow[] = [
    ...invoices.map((i) => ({
      date: i.invoiceDate,
      documentType: "invoice" as const,
      docNumber: i.docNumber,
      partyName: i.customerSnapshot?.displayName ?? "—",
      status: i.status as string,
      taxableAmountMinor: i.subtotalMinor,
      taxMinor: i.totalTaxMinor,
      grandTotalMinor: i.grandTotalMinor,
      amountPaidMinor: i.amountPaidMinor,
      balanceMinor: i.grandTotalMinor - i.amountPaidMinor,
      documentId: String(i._id),
    })),
    ...purchases.map((p) => ({
      date: p.purchaseDate,
      documentType: "purchase" as const,
      docNumber: p.docNumber,
      partyName: p.vendorSnapshot?.displayName ?? "—",
      status: p.status as string,
      taxableAmountMinor: p.subtotalMinor,
      taxMinor: p.totalTaxMinor,
      grandTotalMinor: p.grandTotalMinor,
      amountPaidMinor: p.amountPaidMinor,
      balanceMinor: p.grandTotalMinor - p.amountPaidMinor,
      documentId: String(p._id),
    })),
    ...creditNotes.map((cn) => ({
      date: cn.creditNoteDate,
      documentType: "credit_note" as const,
      docNumber: cn.docNumber,
      partyName: cn.customerSnapshot?.displayName ?? "—",
      status: cn.status as string,
      taxableAmountMinor: cn.subtotalMinor,
      taxMinor: cn.totalTaxMinor,
      grandTotalMinor: cn.grandTotalMinor,
      amountPaidMinor: 0,
      balanceMinor: 0,
      documentId: String(cn._id),
    })),
    ...debitNotes.map((dn) => ({
      date: dn.debitNoteDate,
      documentType: "debit_note" as const,
      docNumber: dn.docNumber,
      partyName: dn.vendorSnapshot?.displayName ?? "—",
      status: dn.status as string,
      taxableAmountMinor: dn.subtotalMinor,
      taxMinor: dn.totalTaxMinor,
      grandTotalMinor: dn.grandTotalMinor,
      amountPaidMinor: 0,
      balanceMinor: 0,
      documentId: String(dn._id),
    })),
  ];

  return rows.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export type SummaryReportRow = {
  periodStart: Date;
  salesMinor: number;
  purchasesMinor: number;
  expensesMinor: number;
  paymentsInMinor: number;
  paymentsOutMinor: number;
};

/** "Summary Report" — one row per period bucket, combining the same underlying document data as
 * every other report (project_spec.md's "standard cross-cuts"). */
export async function getSummaryReport(
  businessId: string,
  params: DateRangeParams & { bucket?: "day" | "week" | "month" } = {},
): Promise<SummaryReportRow[]> {
  await connectToDatabase();
  const businessObjectId = new mongoose.Types.ObjectId(businessId);
  const unit = params.bucket ?? "day";
  const range = dateRangeFilter(params);

  async function bucketedSum(
    model: typeof Invoice | typeof Purchase | typeof Expense | typeof Payment,
    dateField: string,
    amountField: string,
    extraMatch: Record<string, unknown> = {},
  ): Promise<Map<string, number>> {
    const match: Record<string, unknown> = { businessId: businessObjectId, ...extraMatch };
    if (range) match[dateField] = range;
    const rows = await model.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateTrunc: { date: `$${dateField}`, unit } },
          totalMinor: { $sum: `$${amountField}` },
        },
      },
    ]);
    return new Map(rows.map((r) => [(r._id as Date).toISOString(), r.totalMinor as number]));
  }

  const [sales, purchases, expenses, paymentsIn, paymentsOut] = await Promise.all([
    bucketedSum(Invoice, "invoiceDate", "grandTotalMinor", { status: { $nin: ["draft", "cancelled"] } }),
    bucketedSum(Purchase, "purchaseDate", "grandTotalMinor", { status: { $nin: ["draft", "cancelled"] } }),
    bucketedSum(Expense, "expenseDate", "amountMinor", { status: "recorded" }),
    bucketedSum(Payment, "paymentDate", "amountMinor", { direction: "in", voidedAt: { $exists: false } }),
    bucketedSum(Payment, "paymentDate", "amountMinor", { direction: "out", voidedAt: { $exists: false } }),
  ]);

  const periodKeys = new Set([...sales.keys(), ...purchases.keys(), ...expenses.keys(), ...paymentsIn.keys(), ...paymentsOut.keys()]);

  return [...periodKeys]
    .map((key) => ({
      periodStart: new Date(key),
      salesMinor: sales.get(key) ?? 0,
      purchasesMinor: purchases.get(key) ?? 0,
      expensesMinor: expenses.get(key) ?? 0,
      paymentsInMinor: paymentsIn.get(key) ?? 0,
      paymentsOutMinor: paymentsOut.get(key) ?? 0,
    }))
    .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime());
}

export type PartyReportRow = {
  partyId: string;
  partyType: "customer" | "vendor";
  displayName: string;
  gstin?: string;
  totalDocumentedMinor: number;
  totalPaidMinor: number;
  balanceMinor: number;
};

/**
 * "Party Report" — per-customer or per-vendor rollup, grouped directly rather than looping
 * getPartyLedger per party (which would be an N+1 query for a business with many parties).
 */
export async function getPartyReport(
  businessId: string,
  partyType: "customer" | "vendor",
  params: DateRangeParams = {},
): Promise<PartyReportRow[]> {
  await connectToDatabase();
  const businessObjectId = new mongoose.Types.ObjectId(businessId);
  const range = dateRangeFilter(params);

  const documentModel = partyType === "customer" ? Invoice : Purchase;
  const dateField = partyType === "customer" ? "invoiceDate" : "purchaseDate";
  const partyIdField = partyType === "customer" ? "customerId" : "vendorId";

  const documentMatch: Record<string, unknown> = {
    businessId: businessObjectId,
    status: { $nin: ["draft", "cancelled"] },
  };
  if (range) documentMatch[dateField] = range;

  const paymentMatch: Record<string, unknown> = {
    businessId: businessObjectId,
    partyType,
    direction: partyType === "customer" ? "in" : "out",
    voidedAt: { $exists: false },
  };
  if (range) paymentMatch.paymentDate = range;

  const [documentTotals, paymentTotals] = await Promise.all([
    documentModel.aggregate([
      { $match: documentMatch },
      { $group: { _id: `$${partyIdField}`, totalMinor: { $sum: "$grandTotalMinor" } } },
    ]),
    Payment.aggregate([
      { $match: paymentMatch },
      { $group: { _id: "$partyId", totalMinor: { $sum: "$amountMinor" } } },
    ]),
  ]);

  const documentedByParty = new Map(documentTotals.map((r) => [String(r._id), r.totalMinor as number]));
  const paidByParty = new Map(paymentTotals.map((r) => [String(r._id), r.totalMinor as number]));

  const partyIds = [...new Set([...documentedByParty.keys(), ...paidByParty.keys()])];
  if (partyIds.length === 0) return [];

  const PartyModel = partyType === "customer" ? Customer : Vendor;
  const parties = await PartyModel.find({ _id: { $in: partyIds } }).select("displayName gstin").lean();
  const partyById = new Map(parties.map((p) => [String(p._id), p]));

  return partyIds
    .map((id) => {
      const party = partyById.get(id);
      const totalDocumentedMinor = documentedByParty.get(id) ?? 0;
      const totalPaidMinor = paidByParty.get(id) ?? 0;
      return {
        partyId: id,
        partyType,
        displayName: party?.displayName ?? "—",
        gstin: (party?.gstin as string | undefined) ?? undefined,
        totalDocumentedMinor,
        totalPaidMinor,
        balanceMinor: totalDocumentedMinor - totalPaidMinor,
      };
    })
    .sort((a, b) => b.balanceMinor - a.balanceMinor);
}
