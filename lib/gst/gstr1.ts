import { isSameState } from "@/lib/tax/gstSplit";

/**
 * Pure GSTR-1 classification/aggregation over already-fetched, already businessId-scoped plain
 * rows (see lib/db/queries/gstReports.ts for the fetch side) — kept dependency-free from Mongoose
 * so every function here is fixture-testable, matching lib/tax/gstSplit.ts's precedent.
 *
 * Sections mirror the real-world GSTR-1 return (B2B/B2C Large/B2C Small/Credit-Debit Notes/
 * Exports/Nil-rated/HSN summary/Documents issued) since build_phases.md leaves the exact table
 * structure undefined and this app is a from-scratch Swipe clone — a single opaque total would be
 * far less useful. Credit/Debit Notes here means CreditNote (sales-side) only; DebitNote is
 * purchase-side and feeds GSTR-3B instead.
 */

export type Gstr1LineItem = {
  taxRatePercent: number;
  taxableAmountMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalMinor: number;
};

export type Gstr1Invoice = {
  invoiceId: string;
  docNumber?: string;
  invoiceDate: Date;
  status: string;
  placeOfSupplyState: string;
  customerGstin?: string;
  customerDisplayName: string;
  lineItems: Gstr1LineItem[];
  grandTotalMinor: number;
};

export type Gstr1CreditNote = {
  creditNoteId: string;
  docNumber?: string;
  creditNoteDate: Date;
  status: string;
  placeOfSupplyState: string;
  customerGstin?: string;
  customerDisplayName: string;
  lineItems: Gstr1LineItem[];
};

export type Gstr1Classification = "b2b" | "b2cl" | "b2cs" | "exports" | "nil_rated";

const B2CL_THRESHOLD_MINOR = 250_000_00; // ₹2.5 lakh

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isExportPlaceOfSupply(placeOfSupplyState: string): boolean {
  const n = normalize(placeOfSupplyState);
  return n === "other territory" || n === "97";
}

/**
 * Approximation, documented rather than hidden: this app has no dedicated "export invoice" flag
 * (see project_spec.md's Invoice fields), so an export is inferred as an unregistered customer
 * whose place of supply is "Other Territory" — a real export invoice's place of supply is outside
 * India, which is the closest signal this data model can express.
 */
export function classifyInvoiceForGstr1(invoice: Gstr1Invoice, businessState: string): Gstr1Classification {
  const allZeroRate = invoice.lineItems.every((li) => li.taxRatePercent === 0);
  if (!invoice.customerGstin && isExportPlaceOfSupply(invoice.placeOfSupplyState)) return "exports";
  if (allZeroRate) return "nil_rated";
  if (invoice.customerGstin) return "b2b";
  const interstate = !isSameState(businessState, invoice.placeOfSupplyState);
  if (interstate && invoice.grandTotalMinor > B2CL_THRESHOLD_MINOR) return "b2cl";
  return "b2cs";
}

export type RateWiseRow = {
  taxRatePercent: number;
  taxableAmountMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalMinor: number;
};

function emptyRateRow(taxRatePercent: number): RateWiseRow {
  return { taxRatePercent, taxableAmountMinor: 0, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, totalMinor: 0 };
}

function groupByRate(lineItems: Gstr1LineItem[]): RateWiseRow[] {
  const map = new Map<number, RateWiseRow>();
  for (const li of lineItems) {
    const row = map.get(li.taxRatePercent) ?? emptyRateRow(li.taxRatePercent);
    row.taxableAmountMinor += li.taxableAmountMinor;
    row.cgstMinor += li.cgstMinor;
    row.sgstMinor += li.sgstMinor;
    row.igstMinor += li.igstMinor;
    row.totalMinor += li.totalMinor;
    map.set(li.taxRatePercent, row);
  }
  return [...map.values()].sort((a, b) => a.taxRatePercent - b.taxRatePercent);
}

function activeInvoices(invoices: Gstr1Invoice[]): Gstr1Invoice[] {
  return invoices.filter((inv) => inv.status !== "cancelled");
}

export type B2bRow = RateWiseRow & {
  customerGstin: string;
  customerName: string;
  docNumber?: string;
  invoiceDate: Date;
  placeOfSupplyState: string;
};

export function buildB2bSection(invoices: Gstr1Invoice[], businessState: string): B2bRow[] {
  const rows: B2bRow[] = [];
  for (const inv of activeInvoices(invoices)) {
    if (classifyInvoiceForGstr1(inv, businessState) !== "b2b") continue;
    for (const rate of groupByRate(inv.lineItems)) {
      rows.push({
        ...rate,
        customerGstin: inv.customerGstin!,
        customerName: inv.customerDisplayName,
        docNumber: inv.docNumber,
        invoiceDate: inv.invoiceDate,
        placeOfSupplyState: inv.placeOfSupplyState,
      });
    }
  }
  return rows;
}

export type B2clRow = RateWiseRow & {
  customerName: string;
  docNumber?: string;
  invoiceDate: Date;
  placeOfSupplyState: string;
};

export function buildB2clSection(invoices: Gstr1Invoice[], businessState: string): B2clRow[] {
  const rows: B2clRow[] = [];
  for (const inv of activeInvoices(invoices)) {
    if (classifyInvoiceForGstr1(inv, businessState) !== "b2cl") continue;
    for (const rate of groupByRate(inv.lineItems)) {
      rows.push({
        ...rate,
        customerName: inv.customerDisplayName,
        docNumber: inv.docNumber,
        invoiceDate: inv.invoiceDate,
        placeOfSupplyState: inv.placeOfSupplyState,
      });
    }
  }
  return rows;
}

export type B2csRow = RateWiseRow & { placeOfSupplyState: string };

/** B2C Small is a period-level summary grouped by rate + place of supply only — no party or
 * invoice identity, matching the real GSTR-1 B2CS table. */
export function buildB2csSection(invoices: Gstr1Invoice[], businessState: string): B2csRow[] {
  const map = new Map<string, B2csRow>();
  for (const inv of activeInvoices(invoices)) {
    if (classifyInvoiceForGstr1(inv, businessState) !== "b2cs") continue;
    for (const rate of groupByRate(inv.lineItems)) {
      const key = `${inv.placeOfSupplyState}::${rate.taxRatePercent}`;
      const existing = map.get(key) ?? { ...emptyRateRow(rate.taxRatePercent), placeOfSupplyState: inv.placeOfSupplyState };
      existing.taxableAmountMinor += rate.taxableAmountMinor;
      existing.cgstMinor += rate.cgstMinor;
      existing.sgstMinor += rate.sgstMinor;
      existing.igstMinor += rate.igstMinor;
      existing.totalMinor += rate.totalMinor;
      map.set(key, existing);
    }
  }
  return [...map.values()].sort((a, b) => a.placeOfSupplyState.localeCompare(b.placeOfSupplyState));
}

export type ExportRow = RateWiseRow & { customerName: string; docNumber?: string; invoiceDate: Date };

export function buildExportsSection(invoices: Gstr1Invoice[], businessState: string): ExportRow[] {
  const rows: ExportRow[] = [];
  for (const inv of activeInvoices(invoices)) {
    if (classifyInvoiceForGstr1(inv, businessState) !== "exports") continue;
    for (const rate of groupByRate(inv.lineItems)) {
      rows.push({ ...rate, customerName: inv.customerDisplayName, docNumber: inv.docNumber, invoiceDate: inv.invoiceDate });
    }
  }
  return rows;
}

export type NilRatedRow = { placeOfSupplyState: string; taxableAmountMinor: number };

export function buildNilRatedSection(invoices: Gstr1Invoice[], businessState: string): NilRatedRow[] {
  const map = new Map<string, number>();
  for (const inv of activeInvoices(invoices)) {
    if (classifyInvoiceForGstr1(inv, businessState) !== "nil_rated") continue;
    const total = inv.lineItems.reduce((sum, li) => sum + li.taxableAmountMinor, 0);
    map.set(inv.placeOfSupplyState, (map.get(inv.placeOfSupplyState) ?? 0) + total);
  }
  return [...map.entries()]
    .map(([placeOfSupplyState, taxableAmountMinor]) => ({ placeOfSupplyState, taxableAmountMinor }))
    .sort((a, b) => a.placeOfSupplyState.localeCompare(b.placeOfSupplyState));
}

export type CdnrRow = RateWiseRow & {
  customerGstin?: string;
  customerName: string;
  docNumber?: string;
  noteDate: Date;
  placeOfSupplyState: string;
};

/** Sales-side credit notes only (see file doc comment) — issued notes reduce outward liability. */
export function buildCreditDebitNotesSection(creditNotes: Gstr1CreditNote[]): CdnrRow[] {
  const rows: CdnrRow[] = [];
  for (const note of creditNotes) {
    if (note.status !== "issued") continue;
    for (const rate of groupByRate(note.lineItems)) {
      rows.push({
        ...rate,
        customerGstin: note.customerGstin,
        customerName: note.customerDisplayName,
        docNumber: note.docNumber,
        noteDate: note.creditNoteDate,
        placeOfSupplyState: note.placeOfSupplyState,
      });
    }
  }
  return rows;
}

export type DocIssuedRow = {
  natureOfDocument: string;
  fromNumber?: string;
  toNumber?: string;
  totalNumber: number;
  cancelled: number;
  netIssued: number;
};

/**
 * Simplified vs. the real GSTR-1 Table 13 (which reconstructs numeric ranges per series) — this
 * app's docNumber carries a business-defined prefix, so "from/to" here is simply the first and
 * last issued document by date within the period, not a parsed numeric range.
 */
export function buildDocumentsIssuedSection(invoices: Gstr1Invoice[]): DocIssuedRow[] {
  const issued = invoices.filter((inv) => !!inv.docNumber).sort((a, b) => a.invoiceDate.getTime() - b.invoiceDate.getTime());
  if (issued.length === 0) {
    return [{ natureOfDocument: "Invoices for outward supply", totalNumber: 0, cancelled: 0, netIssued: 0 }];
  }
  const cancelled = issued.filter((inv) => inv.status === "cancelled").length;
  return [
    {
      natureOfDocument: "Invoices for outward supply",
      fromNumber: issued[0].docNumber,
      toNumber: issued[issued.length - 1].docNumber,
      totalNumber: issued.length,
      cancelled,
      netIssued: issued.length - cancelled,
    },
  ];
}

export type Gstr1Sections = {
  b2b: B2bRow[];
  b2cl: B2clRow[];
  b2cs: B2csRow[];
  exports: ExportRow[];
  creditDebitNotes: CdnrRow[];
};

export type Gstr1Totals = {
  taxableValueMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalTaxMinor: number;
  totalMinor: number;
};

/** Net outward-liability totals — the single function the Phase 9 verify step's "hand-tallied
 * total" check is run against. Credit notes reduce the liability the invoice sections created. */
export function sumGstr1Totals(sections: Gstr1Sections): Gstr1Totals {
  const positiveRows: RateWiseRow[] = [...sections.b2b, ...sections.b2cl, ...sections.b2cs, ...sections.exports];
  const negativeRows: RateWiseRow[] = sections.creditDebitNotes;

  const sum = (rows: RateWiseRow[]) =>
    rows.reduce(
      (acc, r) => ({
        taxableAmountMinor: acc.taxableAmountMinor + r.taxableAmountMinor,
        cgstMinor: acc.cgstMinor + r.cgstMinor,
        sgstMinor: acc.sgstMinor + r.sgstMinor,
        igstMinor: acc.igstMinor + r.igstMinor,
      }),
      { taxableAmountMinor: 0, cgstMinor: 0, sgstMinor: 0, igstMinor: 0 },
    );

  const positive = sum(positiveRows);
  const negative = sum(negativeRows);

  const taxableValueMinor = positive.taxableAmountMinor - negative.taxableAmountMinor;
  const cgstMinor = positive.cgstMinor - negative.cgstMinor;
  const sgstMinor = positive.sgstMinor - negative.sgstMinor;
  const igstMinor = positive.igstMinor - negative.igstMinor;
  const totalTaxMinor = cgstMinor + sgstMinor + igstMinor;

  return {
    taxableValueMinor,
    cgstMinor,
    sgstMinor,
    igstMinor,
    totalTaxMinor,
    totalMinor: taxableValueMinor + totalTaxMinor,
  };
}
