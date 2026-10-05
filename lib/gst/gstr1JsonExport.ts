import { gstinToStateCode, stateNameToCode } from "@/lib/gst/stateCodes";
import type {
  B2bRow,
  B2clRow,
  B2csRow,
  ExportRow,
  NilRatedSplitRow,
  CdnrRow,
  HsnJsonRow,
  DocIssuedRow,
} from "@/lib/gst/gstr1";

/**
 * Builds the GSTR-1 JSON export in the same shape as the GST portal/offline-tool's own GSTR-1
 * JSON (the file an accountant would otherwise prepare in Tally/ClearTax/etc. and upload to the
 * portal) — not a CSV/XLSX report for humans. Field names (gstin, fp, b2b/b2cl/b2cs/exp/nil/
 * cdnr/cdnur/hsn/doc_issue, ctin, inum, idt, txval, rt, iamt/camt/samt/csamt, ...) are exactly
 * the portal's own abbreviations, not ours — don't "clean them up".
 *
 * Built entirely from the already-computed, businessId-scoped rows in
 * lib/db/queries/gstReports.ts's computeGstr1() — this module itself never touches the database,
 * matching lib/gst/gstr1.ts and lib/gst/eInvoicePayload.ts's precedent of dependency-free,
 * fixture-testable builders.
 *
 * Known approximations, documented rather than hidden (see classifyInvoiceForGstr1's own doc
 * comment for the house style):
 *  - `inv_typ` is always "R" (Regular) — this app has no SEZ/Deemed Export customer flag.
 *  - `rchrg` on a credit/debit note always comes back "N" — CreditNote doesn't store the
 *    original invoice's reverseCharge flag.
 *  - "nil"/"exempt"/"non-GST" supply aren't distinguished — the whole nil-rated bucket for a
 *    sply_ty is reported under `nil_amt`, with `expt_amt`/`ngsup_amt` always 0, since this app
 *    has no field distinguishing the three.
 *  - An unregistered-customer credit/debit note always goes to "cdnur" (never netted back into
 *    "b2cs"), since this app's B2CS table is a plain period/rate/POS aggregate with no
 *    note-level linkage to net against.
 *  - `val` (invoice/note value) is the sum of its line items' `totalMinor`, not a stored
 *    document-level grand total broken out by rate.
 */

const CSAMT = 0; // No cess support anywhere in this app's tax model (lib/db/models/shared/lineItem.ts).

function minorToRupees(minor: number): number {
  return Math.round(minor) / 100;
}

function resolveStateCode(gstin: string | undefined, stateName: string): string {
  if (gstin) {
    const fromGstin = gstinToStateCode(gstin);
    if (fromGstin) return fromGstin;
  }
  return stateNameToCode(stateName) ?? "";
}

function toDdMmYyyy(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = date.getUTCFullYear();
  return `${d}-${m}-${y}`;
}

/** "YYYY-MM" (this app's period key) -> "MMYYYY" (the portal's `fp` filing-period format). */
export function periodToFp(period: string): string {
  const [year, month] = period.split("-");
  return `${month}${year}`;
}

type ItemDet = { txval: number; rt: number; iamt: number; camt: number; samt: number; csamt: number };
type Item = { num: number; itm_det: ItemDet };

function toItems(rows: Array<{ taxRatePercent: number; taxableAmountMinor: number; cgstMinor: number; sgstMinor: number; igstMinor: number }>): Item[] {
  return rows.map((r, i) => ({
    num: i + 1,
    itm_det: {
      txval: minorToRupees(r.taxableAmountMinor),
      rt: r.taxRatePercent,
      iamt: minorToRupees(r.igstMinor),
      camt: minorToRupees(r.cgstMinor),
      samt: minorToRupees(r.sgstMinor),
      csamt: CSAMT,
    },
  }));
}

type ExpItemDet = { txval: number; rt: number; iamt: number };
type ExpItem = { num: number; itm_det: ExpItemDet };

function toExpItems(rows: Array<{ taxRatePercent: number; taxableAmountMinor: number; igstMinor: number }>): ExpItem[] {
  return rows.map((r, i) => ({
    num: i + 1,
    itm_det: { txval: minorToRupees(r.taxableAmountMinor), rt: r.taxRatePercent, iamt: minorToRupees(r.igstMinor) },
  }));
}

function sumTotal(rows: Array<{ totalMinor: number }>): number {
  return minorToRupees(rows.reduce((sum, r) => sum + r.totalMinor, 0));
}

export type B2bJsonInvoice = {
  inum: string;
  idt: string;
  val: number;
  pos: string;
  rchrg: "Y" | "N";
  inv_typ: "R";
  itms: Item[];
};
export type B2bJsonCustomer = { ctin: string; inv: B2bJsonInvoice[] };

/** Groups the already rate-flattened B2bRow[] back into GSTIN -> invoice -> rate-wise items,
 * the nesting the portal's own b2b table expects. */
export function buildB2bJson(rows: B2bRow[]): B2bJsonCustomer[] {
  const byCustomer = new Map<string, Map<string, B2bRow[]>>();
  for (const r of rows) {
    const byInvoice = byCustomer.get(r.customerGstin) ?? new Map<string, B2bRow[]>();
    const key = r.docNumber ?? "";
    byInvoice.set(key, [...(byInvoice.get(key) ?? []), r]);
    byCustomer.set(r.customerGstin, byInvoice);
  }
  return [...byCustomer.entries()].map(([ctin, byInvoice]) => ({
    ctin,
    inv: [...byInvoice.values()].map((invoiceRows) => {
      const [first] = invoiceRows;
      return {
        inum: first.docNumber ?? "",
        idt: toDdMmYyyy(first.invoiceDate),
        val: sumTotal(invoiceRows),
        pos: resolveStateCode(ctin, first.placeOfSupplyState),
        rchrg: first.reverseCharge ? "Y" : "N",
        inv_typ: "R",
        itms: toItems(invoiceRows),
      };
    }),
  }));
}

export type B2clJsonInvoice = { inum: string; idt: string; val: number; itms: ExpItem[] };
export type B2clJsonPos = { pos: string; inv: B2clJsonInvoice[] };

export function buildB2clJson(rows: B2clRow[]): B2clJsonPos[] {
  const byPos = new Map<string, Map<string, B2clRow[]>>();
  for (const r of rows) {
    const posCode = resolveStateCode(undefined, r.placeOfSupplyState);
    const byInvoice = byPos.get(posCode) ?? new Map<string, B2clRow[]>();
    const key = r.docNumber ?? "";
    byInvoice.set(key, [...(byInvoice.get(key) ?? []), r]);
    byPos.set(posCode, byInvoice);
  }
  return [...byPos.entries()].map(([pos, byInvoice]) => ({
    pos,
    inv: [...byInvoice.values()].map((invoiceRows) => {
      const [first] = invoiceRows;
      return {
        inum: first.docNumber ?? "",
        idt: toDdMmYyyy(first.invoiceDate),
        val: sumTotal(invoiceRows),
        itms: toExpItems(invoiceRows),
      };
    }),
  }));
}

export type B2csJson = {
  rt: number;
  pos: string;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
  txval: number;
  sply_ty: "INTRA" | "INTER";
  typ: "OE";
};

/** This app has no e-commerce-operator-collected-supply flag, so `typ` is always "OE" (Other
 * than E-commerce). `sply_ty` needs the business's own state to tell intra- from inter-state. */
export function buildB2csJson(rows: B2csRow[], businessState: string): B2csJson[] {
  return rows
    .filter((r) => r.taxableAmountMinor !== 0)
    .map((r) => ({
      rt: r.taxRatePercent,
      pos: resolveStateCode(undefined, r.placeOfSupplyState),
      iamt: minorToRupees(r.igstMinor),
      camt: minorToRupees(r.cgstMinor),
      samt: minorToRupees(r.sgstMinor),
      csamt: CSAMT,
      txval: minorToRupees(r.taxableAmountMinor),
      sply_ty: r.placeOfSupplyState.trim().toLowerCase() === businessState.trim().toLowerCase() ? "INTRA" : "INTER",
      typ: "OE",
    }));
}

export type ExpJsonInvoice = { inum: string; idt: string; val: number; itms: ExpItem[] };
export type ExpJson = { exp_typ: "WPAY" | "WOPAY"; inv: ExpJsonInvoice[] };

/** WPAY = exported with payment of integrated tax (refund of tax paid); WOPAY = exported under
 * bond/LUT without payment of tax — told apart here by whether the export's rate is non-zero. */
export function buildExpJson(rows: ExportRow[]): ExpJson[] {
  const byType = new Map<"WPAY" | "WOPAY", Map<string, ExportRow[]>>();
  for (const r of rows) {
    const expType: "WPAY" | "WOPAY" = r.taxRatePercent > 0 ? "WPAY" : "WOPAY";
    const byInvoice = byType.get(expType) ?? new Map<string, ExportRow[]>();
    const key = r.docNumber ?? "";
    byInvoice.set(key, [...(byInvoice.get(key) ?? []), r]);
    byType.set(expType, byInvoice);
  }
  return [...byType.entries()].map(([exp_typ, byInvoice]) => ({
    exp_typ,
    inv: [...byInvoice.values()].map((invoiceRows) => {
      const [first] = invoiceRows;
      return {
        inum: first.docNumber ?? "",
        idt: toDdMmYyyy(first.invoiceDate),
        val: sumTotal(invoiceRows),
        itms: toExpItems(invoiceRows),
      };
    }),
  }));
}

export type NilJsonRow = { sply_ty: NilRatedSplitRow["sply_ty"]; nil_amt: number; expt_amt: number; ngsup_amt: number };
export type NilJson = { inv: NilJsonRow[] };

export function buildNilJson(rows: NilRatedSplitRow[]): NilJson | undefined {
  const nonZero = rows.filter((r) => r.taxableAmountMinor !== 0);
  if (nonZero.length === 0) return undefined;
  return {
    inv: nonZero.map((r) => ({ sply_ty: r.sply_ty, nil_amt: minorToRupees(r.taxableAmountMinor), expt_amt: 0, ngsup_amt: 0 })),
  };
}

export type CdnrJsonNote = {
  ntty: "C";
  nt_num: string;
  nt_dt: string;
  val: number;
  pos: string;
  rchrg: "Y" | "N";
  inv_typ: "R";
  itms: Item[];
};
export type CdnrJsonCustomer = { ctin: string; nt: CdnrJsonNote[] };

export function buildCdnrJson(rows: CdnrRow[]): CdnrJsonCustomer[] {
  const registered = rows.filter((r) => !!r.customerGstin);
  const byCustomer = new Map<string, Map<string, CdnrRow[]>>();
  for (const r of registered) {
    const byNote = byCustomer.get(r.customerGstin!) ?? new Map<string, CdnrRow[]>();
    const key = r.docNumber ?? "";
    byNote.set(key, [...(byNote.get(key) ?? []), r]);
    byCustomer.set(r.customerGstin!, byNote);
  }
  return [...byCustomer.entries()].map(([ctin, byNote]) => ({
    ctin,
    nt: [...byNote.values()].map((noteRows) => {
      const [first] = noteRows;
      return {
        ntty: "C",
        nt_num: first.docNumber ?? "",
        nt_dt: toDdMmYyyy(first.noteDate),
        val: sumTotal(noteRows),
        pos: resolveStateCode(ctin, first.placeOfSupplyState),
        rchrg: "N", // Approximation — see this file's doc comment.
        inv_typ: "R",
        itms: toItems(noteRows),
      };
    }),
  }));
}

export type CdnurJsonNote = { typ: "B2CL"; ntty: "C"; nt_num: string; nt_dt: string; val: number; pos: string; itms: ExpItem[] };

/** Every unregistered-customer credit/debit note, flat (not grouped) — see this file's doc
 * comment for why none of these are netted back into "b2cs" instead. */
export function buildCdnurJson(rows: CdnrRow[]): CdnurJsonNote[] {
  const unregistered = rows.filter((r) => !r.customerGstin);
  const byNote = new Map<string, CdnrRow[]>();
  for (const r of unregistered) {
    const key = r.docNumber ?? "";
    byNote.set(key, [...(byNote.get(key) ?? []), r]);
  }
  return [...byNote.values()].map((noteRows) => {
    const [first] = noteRows;
    return {
      typ: "B2CL",
      ntty: "C",
      nt_num: first.docNumber ?? "",
      nt_dt: toDdMmYyyy(first.noteDate),
      val: sumTotal(noteRows),
      pos: resolveStateCode(undefined, first.placeOfSupplyState),
      itms: toExpItems(noteRows),
    };
  });
}

export type HsnEntryJson = {
  num: number;
  hsn_sc: string;
  desc: string;
  uqc: string;
  qty: number;
  rt: number;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
};

function toHsnEntries(rows: HsnJsonRow[]): HsnEntryJson[] {
  return rows.map((r, i) => ({
    num: i + 1,
    hsn_sc: r.hsnOrSac,
    desc: r.description,
    uqc: r.unit || "NA",
    qty: r.quantity,
    rt: r.taxRatePercent,
    txval: minorToRupees(r.taxableAmountMinor),
    iamt: minorToRupees(r.igstMinor),
    camt: minorToRupees(r.cgstMinor),
    samt: minorToRupees(r.sgstMinor),
    csamt: CSAMT,
  }));
}

export type HsnJson = { hsn_b2b: HsnEntryJson[]; hsn_b2c: HsnEntryJson[] };

export function buildHsnJson(hsnB2b: HsnJsonRow[], hsnB2c: HsnJsonRow[]): HsnJson | undefined {
  if (hsnB2b.length === 0 && hsnB2c.length === 0) return undefined;
  return { hsn_b2b: toHsnEntries(hsnB2b), hsn_b2c: toHsnEntries(hsnB2c) };
}

export type DocIssuedDetailJson = { num: number; from: string; to: string; totnum: number; cancel: number; net_issue: number };
export type DocIssuedTypeJson = { doc_num: number; doc_typ: string; docs: DocIssuedDetailJson[] };
export type DocIssuedJson = { doc_det: DocIssuedTypeJson[] };

const DOC_NUM_BY_NATURE: Record<string, number> = {
  "Invoices for outward supply": 1,
  "Credit Note": 5,
};

function toDocIssuedType(row: DocIssuedRow): DocIssuedTypeJson {
  return {
    doc_num: DOC_NUM_BY_NATURE[row.natureOfDocument] ?? 1,
    doc_typ: row.natureOfDocument,
    docs:
      row.totalNumber === 0
        ? []
        : [
            {
              num: 1,
              from: row.fromNumber ?? "",
              to: row.toNumber ?? "",
              totnum: row.totalNumber,
              cancel: row.cancelled,
              net_issue: row.netIssued,
            },
          ],
  };
}

export function buildDocIssueJson(invoiceDocs: DocIssuedRow[], creditNoteDocs: DocIssuedRow[]): DocIssuedJson {
  return { doc_det: [...invoiceDocs, ...creditNoteDocs].map(toDocIssuedType) };
}

export type Gstr1JsonExportInput = {
  businessGstin: string;
  businessState: string;
  period: string; // "YYYY-MM"
  b2b: B2bRow[];
  b2cl: B2clRow[];
  b2cs: B2csRow[];
  exports: ExportRow[];
  nilRatedSplit: NilRatedSplitRow[];
  creditDebitNotes: CdnrRow[];
  hsnB2b: HsnJsonRow[];
  hsnB2c: HsnJsonRow[];
  documentsIssued: DocIssuedRow[];
  creditNoteDocumentsIssued: DocIssuedRow[];
};

export type Gstr1JsonExport = {
  gstin: string;
  fp: string;
  version: string;
  hash: "hash";
  b2b?: B2bJsonCustomer[];
  b2cl?: B2clJsonPos[];
  b2cs?: B2csJson[];
  exp?: ExpJson[];
  nil?: NilJson;
  cdnr?: CdnrJsonCustomer[];
  cdnur?: CdnurJsonNote[];
  hsn?: HsnJson;
  doc_issue?: DocIssuedJson;
};

/** The schema version string the real GST offline tool/portal stamps its own JSON exports with
 * (observed in a live export) — kept as a named constant since nothing here can actually derive
 * it. Sent as-is; the portal recomputes/validates it on upload, not this app. */
export const GSTR1_JSON_SCHEMA_VERSION = "GST3.2.2";

/**
 * Assembles the full GSTR-1 JSON export. Every section is included only when it has at least one
 * non-zero row — matching the real export's own behaviour of omitting empty tables (see this
 * file's sample fixture, which only has b2cs/hsn/doc_issue populated for a period with no other
 * activity) — except `doc_issue`, which the portal always includes.
 */
export function buildGstr1JsonExport(input: Gstr1JsonExportInput): Gstr1JsonExport {
  const b2b = buildB2bJson(input.b2b);
  const b2cl = buildB2clJson(input.b2cl);
  const b2cs = buildB2csJson(input.b2cs, input.businessState);
  const exp = buildExpJson(input.exports);
  const nil = buildNilJson(input.nilRatedSplit);
  const cdnr = buildCdnrJson(input.creditDebitNotes);
  const cdnur = buildCdnurJson(input.creditDebitNotes);
  const hsn = buildHsnJson(input.hsnB2b, input.hsnB2c);

  return {
    gstin: input.businessGstin,
    fp: periodToFp(input.period),
    version: GSTR1_JSON_SCHEMA_VERSION,
    hash: "hash",
    ...(b2b.length > 0 ? { b2b } : {}),
    ...(b2cl.length > 0 ? { b2cl } : {}),
    ...(b2cs.length > 0 ? { b2cs } : {}),
    ...(exp.length > 0 ? { exp } : {}),
    ...(nil ? { nil } : {}),
    ...(cdnr.length > 0 ? { cdnr } : {}),
    ...(cdnur.length > 0 ? { cdnur } : {}),
    ...(hsn ? { hsn } : {}),
    doc_issue: buildDocIssueJson(input.documentsIssued, input.creditNoteDocumentsIssued),
  };
}
