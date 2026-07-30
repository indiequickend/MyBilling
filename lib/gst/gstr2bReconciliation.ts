/**
 * GSTR-2B "calculation engine" (local ITC summary) + reconciliation against an imported real
 * GSTR-2B government JSON export. Pure/dependency-free, fixture-testable — see
 * lib/db/queries/gstReports.ts for the fetch side.
 *
 * Import scope (documented limitation, not a silent gap): only the `b2b`/`b2ba` sections of the
 * real GSTN GSTR-2B JSON export are parsed — these carry the vast majority of ITC line items for
 * most businesses. `cdnr`/`cdnra`/`isd`/`isda`/`impg`/`impgsez` sections are explicitly rejected
 * with a named error rather than silently dropped or mis-parsed; broadening support is a future
 * extension, not something this phase pretends to already do.
 */

export class Gstr2bParseError extends Error {
  constructor(public readonly unsupportedSections: string[]) {
    super(`Unsupported GSTR-2B section(s), not parsed this phase: ${unsupportedSections.join(", ")}`);
    this.name = "Gstr2bParseError";
  }
}

export type Gstr2bParsedRow = {
  vendorGstin: string;
  invoiceNumber: string;
  invoiceDateRaw?: string;
  invoiceValueMinor: number;
  taxableValueMinor: number;
  igstMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  reverseCharge: boolean;
  source: "b2b" | "b2ba";
};

type RawGstr2bItem = { itm_det?: { rt?: number; txval?: number; iamt?: number; camt?: number; samt?: number } };
type RawGstr2bInvoice = { inum?: string; idt?: string; val?: number; rchrg?: string; itms?: RawGstr2bItem[] };
type RawGstr2bSupplierBlock = { ctin?: string; inv?: RawGstr2bInvoice[] };

const UNSUPPORTED_SECTIONS = ["cdnr", "cdnra", "isd", "isda", "impg", "impgsez"] as const;

function rupeesToMinor(value: number | undefined): number {
  return Math.round((value ?? 0) * 100);
}

function parseSupplierBlocks(blocks: unknown, source: "b2b" | "b2ba"): Gstr2bParsedRow[] {
  if (!Array.isArray(blocks)) return [];
  const rows: Gstr2bParsedRow[] = [];
  for (const block of blocks as RawGstr2bSupplierBlock[]) {
    const vendorGstin = String(block.ctin ?? "").toUpperCase();
    for (const inv of block.inv ?? []) {
      const items = inv.itms ?? [];
      rows.push({
        vendorGstin,
        invoiceNumber: String(inv.inum ?? ""),
        invoiceDateRaw: inv.idt,
        invoiceValueMinor: rupeesToMinor(inv.val),
        taxableValueMinor: items.reduce((sum, it) => sum + rupeesToMinor(it.itm_det?.txval), 0),
        igstMinor: items.reduce((sum, it) => sum + rupeesToMinor(it.itm_det?.iamt), 0),
        cgstMinor: items.reduce((sum, it) => sum + rupeesToMinor(it.itm_det?.camt), 0),
        sgstMinor: items.reduce((sum, it) => sum + rupeesToMinor(it.itm_det?.samt), 0),
        reverseCharge: inv.rchrg === "Y",
        source,
      });
    }
  }
  return rows;
}

/** Parses the real GSTN GSTR-2B JSON export's `data.docdata.b2b`/`b2ba` sections. Throws
 * Gstr2bParseError (never silently drops data) if any other known top-level section is present
 * and non-empty. */
export function parseGstr2bExport(rawJson: unknown): Gstr2bParsedRow[] {
  if (typeof rawJson !== "object" || rawJson === null) {
    throw new Error("GSTR-2B file is not valid JSON");
  }
  const docdata = (rawJson as { data?: { docdata?: Record<string, unknown> } }).data?.docdata;
  if (!docdata || typeof docdata !== "object") {
    throw new Error("GSTR-2B file is missing the expected data.docdata section");
  }

  const unsupported = UNSUPPORTED_SECTIONS.filter((key) => {
    const section = docdata[key];
    return Array.isArray(section) && section.length > 0;
  });
  if (unsupported.length > 0) {
    throw new Gstr2bParseError(unsupported);
  }

  return [...parseSupplierBlocks(docdata.b2b, "b2b"), ...parseSupplierBlocks(docdata.b2ba, "b2ba")];
}

export type LocalPurchaseLineItem = {
  taxRatePercent: number;
  taxableAmountMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  itcEligible: boolean;
};

export type LocalPurchaseForItc = {
  vendorGstin?: string;
  status: string;
  lineItems: LocalPurchaseLineItem[];
};

export type LocalItcRow = {
  vendorGstin: string;
  taxRatePercent: number;
  taxableAmountMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
};

/** The "calculation engine" half — grouped by vendor GSTIN + rate, itcEligible purchase line
 * items only, independent of any GSTR-2B import. */
export function buildLocalItcSummary(purchases: LocalPurchaseForItc[]): LocalItcRow[] {
  const map = new Map<string, LocalItcRow>();
  for (const p of purchases) {
    if (p.status === "cancelled" || p.status === "draft" || !p.vendorGstin) continue;
    for (const li of p.lineItems) {
      if (!li.itcEligible) continue;
      const key = `${p.vendorGstin}::${li.taxRatePercent}`;
      const row = map.get(key) ?? {
        vendorGstin: p.vendorGstin,
        taxRatePercent: li.taxRatePercent,
        taxableAmountMinor: 0,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 0,
      };
      row.taxableAmountMinor += li.taxableAmountMinor;
      row.cgstMinor += li.cgstMinor;
      row.sgstMinor += li.sgstMinor;
      row.igstMinor += li.igstMinor;
      map.set(key, row);
    }
  }
  return [...map.values()].sort(
    (a, b) => a.vendorGstin.localeCompare(b.vendorGstin) || a.taxRatePercent - b.taxRatePercent,
  );
}

export type LocalPurchaseDocument = {
  vendorGstin?: string;
  docNumber?: string;
  status: string;
  taxableValueMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
};

export type Gstr2bDiffCategory = "matched" | "value_mismatch" | "missing_in_books" | "missing_in_2b";

export type Gstr2bDiffRow = {
  category: Gstr2bDiffCategory;
  vendorGstin: string;
  invoiceNumber: string;
  localTaxableValueMinor?: number;
  importedTaxableValueMinor?: number;
  localTaxMinor?: number;
  importedTaxMinor?: number;
};

const AMOUNT_TOLERANCE_MINOR = 100; // ±₹1, absorbs rounding differences between systems

function docKey(vendorGstin: string, invoiceNumber: string): string {
  return `${vendorGstin.trim().toUpperCase()}::${invoiceNumber.trim().toUpperCase()}`;
}

/**
 * Diffs local Purchase records against the parsed GSTR-2B import, matched by vendor GSTIN +
 * invoice number (the key itself is scoped by vendor GSTIN, so two different vendors' invoices —
 * even from different businesses — never collide in the returned diff). Four categories per
 * design: matched, value_mismatch, missing_in_books (in 2B, not recorded locally), missing_in_2b
 * (recorded locally, absent from the import).
 */
export function reconcileGstr2b(
  localPurchases: LocalPurchaseDocument[],
  importedRows: Gstr2bParsedRow[],
): Gstr2bDiffRow[] {
  const localByKey = new Map<string, LocalPurchaseDocument>();
  for (const p of localPurchases) {
    if (!p.vendorGstin || !p.docNumber) continue;
    if (p.status === "cancelled" || p.status === "draft") continue;
    localByKey.set(docKey(p.vendorGstin, p.docNumber), p);
  }
  const importedByKey = new Map<string, Gstr2bParsedRow>();
  for (const row of importedRows) {
    importedByKey.set(docKey(row.vendorGstin, row.invoiceNumber), row);
  }

  const rows: Gstr2bDiffRow[] = [];
  const seen = new Set<string>();

  for (const [key, local] of localByKey) {
    seen.add(key);
    const localTaxMinor = local.igstMinor + local.cgstMinor + local.sgstMinor;
    const imported = importedByKey.get(key);
    if (!imported) {
      rows.push({
        category: "missing_in_2b",
        vendorGstin: local.vendorGstin!,
        invoiceNumber: local.docNumber!,
        localTaxableValueMinor: local.taxableValueMinor,
        localTaxMinor,
      });
      continue;
    }
    const importedTaxMinor = imported.igstMinor + imported.cgstMinor + imported.sgstMinor;
    const taxableDiff = Math.abs(local.taxableValueMinor - imported.taxableValueMinor);
    const taxDiff = Math.abs(localTaxMinor - importedTaxMinor);
    rows.push({
      category: taxableDiff <= AMOUNT_TOLERANCE_MINOR && taxDiff <= AMOUNT_TOLERANCE_MINOR ? "matched" : "value_mismatch",
      vendorGstin: local.vendorGstin!,
      invoiceNumber: local.docNumber!,
      localTaxableValueMinor: local.taxableValueMinor,
      importedTaxableValueMinor: imported.taxableValueMinor,
      localTaxMinor,
      importedTaxMinor,
    });
  }

  for (const [key, imported] of importedByKey) {
    if (seen.has(key)) continue;
    rows.push({
      category: "missing_in_books",
      vendorGstin: imported.vendorGstin,
      invoiceNumber: imported.invoiceNumber,
      importedTaxableValueMinor: imported.taxableValueMinor,
      importedTaxMinor: imported.igstMinor + imported.cgstMinor + imported.sgstMinor,
    });
  }

  return rows;
}
