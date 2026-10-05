import { describe, expect, it } from "vitest";
import {
  buildGstr1JsonExport,
  buildB2bJson,
  buildB2clJson,
  buildB2csJson,
  buildExpJson,
  buildNilJson,
  buildCdnrJson,
  buildCdnurJson,
  buildHsnJson,
  buildDocIssueJson,
  periodToFp,
  type Gstr1JsonExportInput,
} from "@/lib/gst/gstr1JsonExport";
import type { B2bRow, B2clRow, B2csRow, ExportRow, CdnrRow, HsnJsonRow, DocIssuedRow, NilRatedSplitRow } from "@/lib/gst/gstr1";

describe("periodToFp", () => {
  it("converts YYYY-MM to the portal's MMYYYY filing period", () => {
    expect(periodToFp("2026-07")).toBe("072026");
  });
});

describe("buildB2bJson", () => {
  it("groups rate-wise rows by customer GSTIN, then by invoice", () => {
    const rows: B2bRow[] = [
      {
        taxRatePercent: 18,
        taxableAmountMinor: 100_000,
        cgstMinor: 9_000,
        sgstMinor: 9_000,
        igstMinor: 0,
        totalMinor: 118_000,
        customerGstin: "27AAAAA0000A1Z5",
        customerName: "Alpha",
        docNumber: "INV-0001",
        invoiceDate: new Date("2026-07-05"),
        placeOfSupplyState: "Maharashtra",
        reverseCharge: false,
      },
      {
        taxRatePercent: 5,
        taxableAmountMinor: 20_000,
        cgstMinor: 500,
        sgstMinor: 500,
        igstMinor: 0,
        totalMinor: 21_000,
        customerGstin: "27AAAAA0000A1Z5",
        customerName: "Alpha",
        docNumber: "INV-0001",
        invoiceDate: new Date("2026-07-05"),
        placeOfSupplyState: "Maharashtra",
        reverseCharge: false,
      },
    ];
    const [customer] = buildB2bJson(rows);
    expect(customer.ctin).toBe("27AAAAA0000A1Z5");
    expect(customer.inv).toHaveLength(1);
    expect(customer.inv[0]).toMatchObject({ inum: "INV-0001", idt: "05-07-2026", val: 1390, pos: "27", rchrg: "N", inv_typ: "R" });
    expect(customer.inv[0].itms).toHaveLength(2);
    expect(customer.inv[0].itms[0].itm_det).toEqual({ txval: 1000, rt: 18, iamt: 0, camt: 90, samt: 90, csamt: 0 });
  });
});

describe("buildB2clJson", () => {
  it("groups rate-wise rows by place of supply, then by invoice", () => {
    const rows: B2clRow[] = [
      {
        taxRatePercent: 18,
        taxableAmountMinor: 25_500_000,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 4_590_000,
        totalMinor: 30_090_000,
        customerName: "Walk-in Customer",
        docNumber: "INV-0003",
        invoiceDate: new Date("2026-07-03"),
        placeOfSupplyState: "Karnataka",
      },
    ];
    const [pos] = buildB2clJson(rows);
    expect(pos.pos).toBe("29");
    expect(pos.inv).toEqual([
      { inum: "INV-0003", idt: "03-07-2026", val: 300900, itms: [{ num: 1, itm_det: { txval: 255000, rt: 18, iamt: 45900 } }] },
    ]);
  });
});

describe("buildB2csJson", () => {
  it("labels intra-state rows INTRA and inter-state rows INTER, dropping zero-value rows", () => {
    const rows: B2csRow[] = [
      { taxRatePercent: 5, taxableAmountMinor: 19_200_00, cgstMinor: 480_00, sgstMinor: 480_00, igstMinor: 0, totalMinor: 20_160_00, placeOfSupplyState: "West Bengal" },
      { taxRatePercent: 12, taxableAmountMinor: 0, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, totalMinor: 0, placeOfSupplyState: "West Bengal" },
      { taxRatePercent: 18, taxableAmountMinor: 10_000_00, cgstMinor: 0, sgstMinor: 0, igstMinor: 1_800_00, totalMinor: 11_800_00, placeOfSupplyState: "Karnataka" },
    ];
    expect(buildB2csJson(rows, "West Bengal")).toEqual([
      { rt: 5, pos: "19", iamt: 0, camt: 480, samt: 480, csamt: 0, txval: 19200, sply_ty: "INTRA", typ: "OE" },
      { rt: 18, pos: "29", iamt: 1800, camt: 0, samt: 0, csamt: 0, txval: 10000, sply_ty: "INTER", typ: "OE" },
    ]);
  });
});

describe("buildExpJson", () => {
  it("buckets exports into WPAY/WOPAY by whether tax was charged", () => {
    const rows: ExportRow[] = [
      { taxRatePercent: 0, taxableAmountMinor: 50_000, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, totalMinor: 50_000, customerName: "Foreign Buyer", docNumber: "EXP-0001", invoiceDate: new Date("2026-07-10") },
      { taxRatePercent: 18, taxableAmountMinor: 100_000, cgstMinor: 0, sgstMinor: 0, igstMinor: 18_000, totalMinor: 118_000, customerName: "Foreign Buyer 2", docNumber: "EXP-0002", invoiceDate: new Date("2026-07-11") },
    ];
    const result = buildExpJson(rows);
    expect(result.find((r) => r.exp_typ === "WOPAY")?.inv[0].inum).toBe("EXP-0001");
    expect(result.find((r) => r.exp_typ === "WPAY")?.inv[0].inum).toBe("EXP-0002");
  });
});

describe("buildNilJson", () => {
  it("returns undefined when every bucket is zero, and omits expt_amt/ngsup_amt detail", () => {
    expect(buildNilJson([])).toBeUndefined();
    const rows: NilRatedSplitRow[] = [{ sply_ty: "INTRAB2C", taxableAmountMinor: 20_000 }];
    expect(buildNilJson(rows)).toEqual({ inv: [{ sply_ty: "INTRAB2C", nil_amt: 200, expt_amt: 0, ngsup_amt: 0 }] });
  });
});

describe("buildCdnrJson / buildCdnurJson", () => {
  const rows: CdnrRow[] = [
    {
      taxRatePercent: 18,
      taxableAmountMinor: 20_000,
      cgstMinor: 1_800,
      sgstMinor: 1_800,
      igstMinor: 0,
      totalMinor: 23_600,
      customerGstin: "27AAAAA0000A1Z5",
      customerName: "Alpha",
      docNumber: "CN-0001",
      noteDate: new Date("2026-07-10"),
      placeOfSupplyState: "Maharashtra",
    },
    {
      taxRatePercent: 18,
      taxableAmountMinor: 30_000,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 5_400,
      totalMinor: 35_400,
      customerGstin: undefined,
      customerName: "Walk-in",
      docNumber: "CN-0002",
      noteDate: new Date("2026-07-11"),
      placeOfSupplyState: "Karnataka",
    },
  ];

  it("routes registered-customer notes to cdnr and unregistered ones to cdnur", () => {
    const cdnr = buildCdnrJson(rows);
    expect(cdnr).toEqual([
      {
        ctin: "27AAAAA0000A1Z5",
        nt: [
          {
            ntty: "C",
            nt_num: "CN-0001",
            nt_dt: "10-07-2026",
            val: 236,
            pos: "27",
            rchrg: "N",
            inv_typ: "R",
            itms: [{ num: 1, itm_det: { txval: 200, rt: 18, iamt: 0, camt: 18, samt: 18, csamt: 0 } }],
          },
        ],
      },
    ]);

    const cdnur = buildCdnurJson(rows);
    expect(cdnur).toEqual([
      { typ: "B2CL", ntty: "C", nt_num: "CN-0002", nt_dt: "11-07-2026", val: 354, pos: "29", itms: [{ num: 1, itm_det: { txval: 300, rt: 18, iamt: 54 } }] },
    ]);
  });
});

describe("buildHsnJson", () => {
  it("returns undefined when both buckets are empty", () => {
    expect(buildHsnJson([], [])).toBeUndefined();
  });

  it("numbers entries sequentially starting at 1 in each bucket", () => {
    const row: HsnJsonRow = {
      hsnOrSac: "996601",
      description: "Rental services",
      unit: "NA",
      quantity: 0,
      taxRatePercent: 5,
      taxableAmountMinor: 10_000_00,
      cgstMinor: 250_00,
      sgstMinor: 250_00,
      igstMinor: 0,
    };
    expect(buildHsnJson([], [row])).toEqual({
      hsn_b2b: [],
      hsn_b2c: [{ num: 1, hsn_sc: "996601", desc: "Rental services", uqc: "NA", qty: 0, rt: 5, txval: 10000, iamt: 0, camt: 250, samt: 250, csamt: 0 }],
    });
  });
});

describe("buildDocIssueJson", () => {
  it("maps invoice and credit-note series to their own doc_num", () => {
    const invoiceDocs: DocIssuedRow[] = [
      { natureOfDocument: "Invoices for outward supply", fromNumber: "INV/26-27/1", toNumber: "INV/26-27/13", totalNumber: 13, cancelled: 1, netIssued: 12 },
    ];
    const creditNoteDocs: DocIssuedRow[] = [{ natureOfDocument: "Credit Note", totalNumber: 0, cancelled: 0, netIssued: 0 }];
    expect(buildDocIssueJson(invoiceDocs, creditNoteDocs)).toEqual({
      doc_det: [
        { doc_num: 1, doc_typ: "Invoices for outward supply", docs: [{ num: 1, from: "INV/26-27/1", to: "INV/26-27/13", totnum: 13, cancel: 1, net_issue: 12 }] },
        { doc_num: 5, doc_typ: "Credit Note", docs: [] },
      ],
    });
  });
});

describe("buildGstr1JsonExport", () => {
  it("includes only the sections that have data, matching a real export's own shape", () => {
    const input: Gstr1JsonExportInput = {
      businessGstin: "19AAKFI5420J1Z6",
      businessState: "West Bengal",
      period: "2026-07",
      b2b: [],
      b2cl: [],
      b2cs: [
        { taxRatePercent: 5, taxableAmountMinor: 19_200_00, cgstMinor: 480_00, sgstMinor: 480_00, igstMinor: 0, totalMinor: 20_160_00, placeOfSupplyState: "West Bengal" },
      ],
      exports: [],
      nilRatedSplit: [],
      creditDebitNotes: [],
      hsnB2b: [],
      hsnB2c: [
        {
          hsnOrSac: "996601",
          description: "Rental services of road vehicles",
          unit: "NA",
          quantity: 0,
          taxRatePercent: 5,
          taxableAmountMinor: 10_000_00,
          cgstMinor: 250_00,
          sgstMinor: 250_00,
          igstMinor: 0,
        },
      ],
      documentsIssued: [
        { natureOfDocument: "Invoices for outward supply", fromNumber: "INV/26-27/13", toNumber: "INV/26-27/13", totalNumber: 1, cancelled: 0, netIssued: 1 },
      ],
      creditNoteDocumentsIssued: [{ natureOfDocument: "Credit Note", totalNumber: 0, cancelled: 0, netIssued: 0 }],
    };

    const result = buildGstr1JsonExport(input);
    expect(result.gstin).toBe("19AAKFI5420J1Z6");
    expect(result.fp).toBe("072026");
    expect(result.hash).toBe("hash");
    expect(result).not.toHaveProperty("b2b");
    expect(result).not.toHaveProperty("b2cl");
    expect(result).not.toHaveProperty("exp");
    expect(result).not.toHaveProperty("nil");
    expect(result).not.toHaveProperty("cdnr");
    expect(result).not.toHaveProperty("cdnur");
    expect(result.b2cs).toHaveLength(1);
    expect(result.hsn?.hsn_b2c).toHaveLength(1);
    expect(result.doc_issue?.doc_det).toHaveLength(2);
  });
});
