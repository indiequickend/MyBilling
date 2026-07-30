import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/connect";
import { Invoice } from "@/lib/db/models/Invoice";
import { Purchase } from "@/lib/db/models/Purchase";
import { CreditNote } from "@/lib/db/models/CreditNote";
import { DebitNote } from "@/lib/db/models/DebitNote";
import { Business } from "@/lib/db/models/Business";
import { getHsnSummary, type HsnSummaryRow } from "@/lib/db/queries/reports";
import {
  buildB2bSection,
  buildB2clSection,
  buildB2csSection,
  buildExportsSection,
  buildNilRatedSection,
  buildCreditDebitNotesSection,
  buildDocumentsIssuedSection,
  sumGstr1Totals,
  type Gstr1Invoice,
  type Gstr1CreditNote,
  type B2bRow,
  type B2clRow,
  type B2csRow,
  type ExportRow,
  type NilRatedRow,
  type CdnrRow,
  type DocIssuedRow,
  type Gstr1Totals,
} from "@/lib/gst/gstr1";
import {
  buildOutwardTaxableSupplies,
  buildZeroRatedAndExempt,
  buildInwardReverseCharge,
  buildInterstateToUnregistered,
  buildItcSummary,
  type Gstr3bPurchase,
  type Gstr3bDebitNote,
  type OutwardTaxableSupplies,
  type ZeroRatedAndExempt,
  type InterstateToUnregisteredRow,
  type ItcSummary,
} from "@/lib/gst/gstr3b";
import {
  buildLocalItcSummary,
  type LocalItcRow,
  type LocalPurchaseForItc,
  type LocalPurchaseDocument,
} from "@/lib/gst/gstr2bReconciliation";

/** GST return periods are always calendar months (UTC), never a fiscal year. */
export function periodToDateRange(period: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // day 0 of next month = last day of this one
  return { start, end };
}

function toGstr1LineItems(lineItems: Array<Record<string, unknown>>) {
  return lineItems.map((li) => ({
    taxRatePercent: li.taxRatePercent as number,
    taxableAmountMinor: li.taxableAmountMinor as number,
    cgstMinor: li.cgstMinor as number,
    sgstMinor: li.sgstMinor as number,
    igstMinor: li.igstMinor as number,
    totalMinor: li.totalMinor as number,
  }));
}

async function fetchGstr1Invoices(businessId: string, start: Date, end: Date): Promise<Gstr1Invoice[]> {
  const docs = await Invoice.find({
    businessId: new mongoose.Types.ObjectId(businessId),
    invoiceDate: { $gte: start, $lte: end },
    status: { $ne: "draft" },
  })
    .select("docNumber invoiceDate status placeOfSupplyState customerSnapshot lineItems grandTotalMinor")
    .lean();

  return docs.map((inv) => ({
    invoiceId: String(inv._id),
    docNumber: inv.docNumber,
    invoiceDate: inv.invoiceDate,
    status: inv.status,
    placeOfSupplyState: inv.placeOfSupplyState,
    customerGstin: inv.customerSnapshot?.gstin,
    customerDisplayName: inv.customerSnapshot?.displayName ?? "—",
    lineItems: toGstr1LineItems(inv.lineItems),
    grandTotalMinor: inv.grandTotalMinor,
  }));
}

async function fetchGstr1CreditNotes(businessId: string, start: Date, end: Date): Promise<Gstr1CreditNote[]> {
  const docs = await CreditNote.find({
    businessId: new mongoose.Types.ObjectId(businessId),
    creditNoteDate: { $gte: start, $lte: end },
  })
    .select("docNumber creditNoteDate status placeOfSupplyState customerSnapshot lineItems")
    .lean();

  return docs.map((cn) => ({
    creditNoteId: String(cn._id),
    docNumber: cn.docNumber,
    creditNoteDate: cn.creditNoteDate,
    status: cn.status,
    placeOfSupplyState: cn.placeOfSupplyState,
    customerGstin: cn.customerSnapshot?.gstin,
    customerDisplayName: cn.customerSnapshot?.displayName ?? "—",
    lineItems: toGstr1LineItems(cn.lineItems),
  }));
}

export type Gstr1ComputedData = {
  b2b: B2bRow[];
  b2cl: B2clRow[];
  b2cs: B2csRow[];
  exports: ExportRow[];
  nilRated: NilRatedRow[];
  creditDebitNotes: CdnrRow[];
  hsnSummary: HsnSummaryRow[];
  documentsIssued: DocIssuedRow[];
  totals: Gstr1Totals;
};

/** GSTR-1 "calculation engine" for one businessId-scoped calendar-month period, computed entirely
 * from local documents (Invoice + CreditNote) — never a live GST-portal call. */
export async function computeGstr1(businessId: string, period: string): Promise<Gstr1ComputedData> {
  await connectToDatabase();
  const { start, end } = periodToDateRange(period);

  const [businessDoc, invoices, creditNotes, hsnSummary] = await Promise.all([
    Business.findById(businessId).lean(),
    fetchGstr1Invoices(businessId, start, end),
    fetchGstr1CreditNotes(businessId, start, end),
    getHsnSummary(businessId, { dateFrom: start, dateTo: end }),
  ]);
  const businessState = businessDoc?.addresses?.billing?.state ?? "";

  const b2b = buildB2bSection(invoices, businessState);
  const b2cl = buildB2clSection(invoices, businessState);
  const b2cs = buildB2csSection(invoices, businessState);
  const exportsSection = buildExportsSection(invoices, businessState);
  const nilRated = buildNilRatedSection(invoices, businessState);
  const creditDebitNotes = buildCreditDebitNotesSection(creditNotes);
  const documentsIssued = buildDocumentsIssuedSection(invoices);
  const totals = sumGstr1Totals({ b2b, b2cl, b2cs, exports: exportsSection, creditDebitNotes });

  return { b2b, b2cl, b2cs, exports: exportsSection, nilRated, creditDebitNotes, hsnSummary, documentsIssued, totals };
}

export type Gstr3bComputedData = {
  outwardTaxableSupplies: OutwardTaxableSupplies;
  zeroRatedAndExempt: ZeroRatedAndExempt;
  inwardReverseCharge: OutwardTaxableSupplies;
  interstateToUnregistered: InterstateToUnregisteredRow[];
  itc: ItcSummary;
};

/** GSTR-3B "calculation engine" for one businessId-scoped calendar-month period. */
export async function computeGstr3b(businessId: string, period: string): Promise<Gstr3bComputedData> {
  await connectToDatabase();
  const { start, end } = periodToDateRange(period);
  const businessObjectId = new mongoose.Types.ObjectId(businessId);

  const [businessDoc, invoices, creditNotes, purchaseDocs, debitNoteDocs] = await Promise.all([
    Business.findById(businessId).lean(),
    fetchGstr1Invoices(businessId, start, end),
    fetchGstr1CreditNotes(businessId, start, end),
    Purchase.find({ businessId: businessObjectId, purchaseDate: { $gte: start, $lte: end } })
      .select("status reverseCharge lineItems")
      .lean(),
    DebitNote.find({ businessId: businessObjectId, debitNoteDate: { $gte: start, $lte: end } })
      .select("status lineItems")
      .lean(),
  ]);
  const businessState = businessDoc?.addresses?.billing?.state ?? "";

  const purchases: Gstr3bPurchase[] = purchaseDocs.map((p) => ({
    purchaseId: String(p._id),
    status: p.status,
    reverseCharge: p.reverseCharge,
    lineItems: p.lineItems.map((li) => ({
      taxableAmountMinor: li.taxableAmountMinor,
      cgstMinor: li.cgstMinor,
      sgstMinor: li.sgstMinor,
      igstMinor: li.igstMinor,
      itcEligible: li.itcEligible,
    })),
  }));

  const debitNotes: Gstr3bDebitNote[] = debitNoteDocs.map((dn) => ({
    status: dn.status,
    lineItems: dn.lineItems.map((li) => ({
      taxableAmountMinor: li.taxableAmountMinor,
      cgstMinor: li.cgstMinor,
      sgstMinor: li.sgstMinor,
      igstMinor: li.igstMinor,
    })),
  }));

  return {
    outwardTaxableSupplies: buildOutwardTaxableSupplies(invoices, creditNotes, businessState),
    zeroRatedAndExempt: buildZeroRatedAndExempt(invoices, businessState),
    inwardReverseCharge: buildInwardReverseCharge(purchases),
    interstateToUnregistered: buildInterstateToUnregistered(invoices, businessState),
    itc: buildItcSummary(purchases, debitNotes),
  };
}

/** The GSTR-2B "calculation engine" half — local ITC-eligible purchases for the period, grouped
 * by vendor GSTIN + rate, independent of any imported GSTR-2B file. */
export async function computeLocalItcSummary(businessId: string, period: string): Promise<LocalItcRow[]> {
  await connectToDatabase();
  const { start, end } = periodToDateRange(period);
  const purchaseDocs = await Purchase.find({
    businessId: new mongoose.Types.ObjectId(businessId),
    purchaseDate: { $gte: start, $lte: end },
  })
    .select("vendorSnapshot status lineItems")
    .lean();

  const purchases: LocalPurchaseForItc[] = purchaseDocs.map((p) => ({
    vendorGstin: p.vendorSnapshot?.gstin,
    status: p.status,
    lineItems: p.lineItems.map((li) => ({
      taxRatePercent: li.taxRatePercent,
      taxableAmountMinor: li.taxableAmountMinor,
      cgstMinor: li.cgstMinor,
      sgstMinor: li.sgstMinor,
      igstMinor: li.igstMinor,
      itcEligible: li.itcEligible,
    })),
  }));

  return buildLocalItcSummary(purchases);
}

/** Per-document purchase totals for the period, in the shape lib/gst/gstr2bReconciliation.ts's
 * reconcileGstr2b() diffs against the imported file — the "books" side of the reconciliation. */
export async function getLocalPurchaseDocumentsForReconciliation(
  businessId: string,
  period: string,
): Promise<LocalPurchaseDocument[]> {
  await connectToDatabase();
  const { start, end } = periodToDateRange(period);
  const purchaseDocs = await Purchase.find({
    businessId: new mongoose.Types.ObjectId(businessId),
    purchaseDate: { $gte: start, $lte: end },
  })
    .select("docNumber vendorSnapshot status subtotalMinor totalCgstMinor totalSgstMinor totalIgstMinor")
    .lean();

  return purchaseDocs.map((p) => ({
    vendorGstin: p.vendorSnapshot?.gstin,
    docNumber: p.docNumber,
    status: p.status,
    taxableValueMinor: p.subtotalMinor,
    cgstMinor: p.totalCgstMinor,
    sgstMinor: p.totalSgstMinor,
    igstMinor: p.totalIgstMinor,
  }));
}
