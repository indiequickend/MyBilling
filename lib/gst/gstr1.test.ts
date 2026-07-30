import { describe, expect, it } from "vitest";
import {
  classifyInvoiceForGstr1,
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
} from "@/lib/gst/gstr1";

const BUSINESS_STATE = "Maharashtra";

function line(overrides: Partial<Gstr1Invoice["lineItems"][number]> = {}) {
  return {
    taxRatePercent: 18,
    taxableAmountMinor: 100_000,
    cgstMinor: 9_000,
    sgstMinor: 9_000,
    igstMinor: 0,
    totalMinor: 118_000,
    ...overrides,
  };
}

describe("classifyInvoiceForGstr1", () => {
  const base: Gstr1Invoice = {
    invoiceId: "i1",
    docNumber: "INV-0001",
    invoiceDate: new Date("2026-06-01"),
    status: "pending",
    placeOfSupplyState: "Maharashtra",
    customerDisplayName: "Test Customer",
    lineItems: [line()],
    grandTotalMinor: 118_000,
  };

  it("classifies a registered customer as b2b regardless of state", () => {
    expect(classifyInvoiceForGstr1({ ...base, customerGstin: "27AAAAA0000A1Z5" }, BUSINESS_STATE)).toBe("b2b");
  });

  it("classifies an unregistered interstate customer above the B2C-Large threshold as b2cl", () => {
    const inv: Gstr1Invoice = {
      ...base,
      placeOfSupplyState: "Karnataka",
      grandTotalMinor: 300_000_00,
    };
    expect(classifyInvoiceForGstr1(inv, BUSINESS_STATE)).toBe("b2cl");
  });

  it("classifies an unregistered interstate customer below the threshold as b2cs", () => {
    const inv: Gstr1Invoice = { ...base, placeOfSupplyState: "Karnataka", grandTotalMinor: 59_000 };
    expect(classifyInvoiceForGstr1(inv, BUSINESS_STATE)).toBe("b2cs");
  });

  it("classifies an unregistered intra-state customer as b2cs even above the threshold", () => {
    const inv: Gstr1Invoice = { ...base, grandTotalMinor: 300_000_00 };
    expect(classifyInvoiceForGstr1(inv, BUSINESS_STATE)).toBe("b2cs");
  });

  it("classifies an all-zero-rate invoice as nil_rated", () => {
    const inv: Gstr1Invoice = { ...base, lineItems: [line({ taxRatePercent: 0, cgstMinor: 0, sgstMinor: 0, totalMinor: 100_000 })] };
    expect(classifyInvoiceForGstr1(inv, BUSINESS_STATE)).toBe("nil_rated");
  });

  it("classifies an unregistered Other-Territory invoice as exports", () => {
    const inv: Gstr1Invoice = { ...base, placeOfSupplyState: "Other Territory" };
    expect(classifyInvoiceForGstr1(inv, BUSINESS_STATE)).toBe("exports");
  });
});

describe("GSTR-1 sections and hand-tallied totals", () => {
  const invoices: Gstr1Invoice[] = [
    // 1: B2B, intra-state, 18%
    {
      invoiceId: "i1",
      docNumber: "INV-0001",
      invoiceDate: new Date("2026-06-01"),
      status: "pending",
      placeOfSupplyState: "Maharashtra",
      customerGstin: "27AAAAA0000A1Z5",
      customerDisplayName: "Alpha Pvt Ltd",
      lineItems: [line({ taxableAmountMinor: 100_000, cgstMinor: 9_000, sgstMinor: 9_000, igstMinor: 0, totalMinor: 118_000 })],
      grandTotalMinor: 118_000,
    },
    // 2: B2B, inter-state, 18%
    {
      invoiceId: "i2",
      docNumber: "INV-0002",
      invoiceDate: new Date("2026-06-02"),
      status: "pending",
      placeOfSupplyState: "Karnataka",
      customerGstin: "29BBBBB1111B1Z6",
      customerDisplayName: "Beta Corp",
      lineItems: [line({ taxableAmountMinor: 200_000, cgstMinor: 0, sgstMinor: 0, igstMinor: 36_000, totalMinor: 236_000 })],
      grandTotalMinor: 236_000,
    },
    // 3: B2C Large — unregistered, inter-state, above the ₹2.5L threshold
    {
      invoiceId: "i3",
      docNumber: "INV-0003",
      invoiceDate: new Date("2026-06-03"),
      status: "pending",
      placeOfSupplyState: "Karnataka",
      customerDisplayName: "Walk-in Customer",
      lineItems: [
        line({ taxableAmountMinor: 25_500_000, cgstMinor: 0, sgstMinor: 0, igstMinor: 4_590_000, totalMinor: 30_090_000 }),
      ],
      grandTotalMinor: 30_090_000,
    },
    // 4: B2C Small — unregistered, intra-state
    {
      invoiceId: "i4",
      docNumber: "INV-0004",
      invoiceDate: new Date("2026-06-04"),
      status: "pending",
      placeOfSupplyState: "Maharashtra",
      customerDisplayName: "Retail Buyer",
      lineItems: [line({ taxableAmountMinor: 50_000, cgstMinor: 4_500, sgstMinor: 4_500, igstMinor: 0, totalMinor: 59_000 })],
      grandTotalMinor: 59_000,
    },
    // 5: Nil-rated
    {
      invoiceId: "i5",
      docNumber: "INV-0005",
      invoiceDate: new Date("2026-06-05"),
      status: "pending",
      placeOfSupplyState: "Maharashtra",
      customerDisplayName: "Exempt Buyer",
      lineItems: [line({ taxRatePercent: 0, taxableAmountMinor: 20_000, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, totalMinor: 20_000 })],
      grandTotalMinor: 20_000,
    },
    // 6: Cancelled B2B — must be excluded entirely
    {
      invoiceId: "i6",
      docNumber: "INV-0006",
      invoiceDate: new Date("2026-06-06"),
      status: "cancelled",
      placeOfSupplyState: "Maharashtra",
      customerGstin: "27AAAAA0000A1Z5",
      customerDisplayName: "Alpha Pvt Ltd",
      lineItems: [line()],
      grandTotalMinor: 118_000,
    },
  ];

  const creditNotes: Gstr1CreditNote[] = [
    {
      creditNoteId: "cn1",
      docNumber: "CN-0001",
      creditNoteDate: new Date("2026-06-10"),
      status: "issued",
      placeOfSupplyState: "Maharashtra",
      customerGstin: "27AAAAA0000A1Z5",
      customerDisplayName: "Alpha Pvt Ltd",
      lineItems: [line({ taxableAmountMinor: 20_000, cgstMinor: 1_800, sgstMinor: 1_800, igstMinor: 0, totalMinor: 23_600 })],
    },
  ];

  it("puts each invoice in exactly its expected section", () => {
    expect(buildB2bSection(invoices, BUSINESS_STATE)).toHaveLength(2);
    expect(buildB2clSection(invoices, BUSINESS_STATE)).toHaveLength(1);
    expect(buildB2csSection(invoices, BUSINESS_STATE)).toHaveLength(1);
    expect(buildExportsSection(invoices, BUSINESS_STATE)).toHaveLength(0);
    expect(buildNilRatedSection(invoices, BUSINESS_STATE)).toEqual([
      { placeOfSupplyState: "Maharashtra", taxableAmountMinor: 20_000 },
    ]);
  });

  it("excludes a cancelled invoice from every section", () => {
    const b2b = buildB2bSection(invoices, BUSINESS_STATE);
    expect(b2b.every((r) => r.docNumber !== "INV-0006")).toBe(true);
  });

  it("builds the credit/debit notes section from issued sales credit notes only", () => {
    const rows = buildCreditDebitNotesSection(creditNotes);
    expect(rows).toEqual([
      {
        taxRatePercent: 18,
        taxableAmountMinor: 20_000,
        cgstMinor: 1_800,
        sgstMinor: 1_800,
        igstMinor: 0,
        totalMinor: 23_600,
        customerGstin: "27AAAAA0000A1Z5",
        customerName: "Alpha Pvt Ltd",
        docNumber: "CN-0001",
        noteDate: new Date("2026-06-10"),
        placeOfSupplyState: "Maharashtra",
      },
    ]);
  });

  it("summarizes documents issued, counting the cancelled invoice separately", () => {
    const [row] = buildDocumentsIssuedSection(invoices);
    expect(row).toEqual({
      natureOfDocument: "Invoices for outward supply",
      fromNumber: "INV-0001",
      toNumber: "INV-0006",
      totalNumber: 6,
      cancelled: 1,
      netIssued: 5,
    });
  });

  it("matches a hand-tallied grand total for the period, net of the issued credit note", () => {
    const sections = {
      b2b: buildB2bSection(invoices, BUSINESS_STATE),
      b2cl: buildB2clSection(invoices, BUSINESS_STATE),
      b2cs: buildB2csSection(invoices, BUSINESS_STATE),
      exports: buildExportsSection(invoices, BUSINESS_STATE),
      creditDebitNotes: buildCreditDebitNotesSection(creditNotes),
    };

    // Hand tally:
    //  taxable = 100,000 + 200,000 + 25,500,000 + 50,000 - 20,000(CN)   = 25,830,000
    //  cgst    = 9,000 + 0 + 0 + 4,500 - 1,800(CN)                       = 11,700
    //  sgst    = 9,000 + 0 + 0 + 4,500 - 1,800(CN)                       = 11,700
    //  igst    = 0 + 36,000 + 4,590,000 + 0 - 0(CN)                      = 4,626,000
    expect(sumGstr1Totals(sections)).toEqual({
      taxableValueMinor: 25_830_000,
      cgstMinor: 11_700,
      sgstMinor: 11_700,
      igstMinor: 4_626_000,
      totalTaxMinor: 4_649_400,
      totalMinor: 30_479_400,
    });
  });
});
