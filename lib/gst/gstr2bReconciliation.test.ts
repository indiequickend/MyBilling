import { describe, expect, it } from "vitest";
import {
  parseGstr2bExport,
  Gstr2bParseError,
  buildLocalItcSummary,
  reconcileGstr2b,
  type LocalPurchaseForItc,
  type LocalPurchaseDocument,
} from "@/lib/gst/gstr2bReconciliation";

function rawGstr2b(docdata: Record<string, unknown>) {
  return { gstin: "27AAAAA0000A1Z5", fp: "062026", data: { docdata } };
}

describe("parseGstr2bExport", () => {
  it("parses b2b and b2ba supplier blocks into flat rows", () => {
    const raw = rawGstr2b({
      b2b: [
        {
          ctin: "29bbbbb1111b1z6",
          inv: [
            {
              inum: "V-001",
              idt: "05-06-2026",
              val: 1180,
              rchrg: "N",
              itms: [{ itm_det: { rt: 18, txval: 1000, iamt: 180, camt: 0, samt: 0 } }],
            },
          ],
        },
      ],
      b2ba: [],
    });

    const rows = parseGstr2bExport(raw);
    expect(rows).toEqual([
      {
        vendorGstin: "29BBBBB1111B1Z6",
        invoiceNumber: "V-001",
        invoiceDateRaw: "05-06-2026",
        invoiceValueMinor: 118_000,
        taxableValueMinor: 100_000,
        igstMinor: 18_000,
        cgstMinor: 0,
        sgstMinor: 0,
        reverseCharge: false,
        source: "b2b",
      },
    ]);
  });

  it("throws a named Gstr2bParseError for an unsupported section instead of silently dropping it", () => {
    const raw = rawGstr2b({ b2b: [], cdnr: [{ ctin: "29BBBBB1111B1Z6" }] });
    expect(() => parseGstr2bExport(raw)).toThrow(Gstr2bParseError);
    try {
      parseGstr2bExport(raw);
    } catch (err) {
      expect(err).toBeInstanceOf(Gstr2bParseError);
      expect((err as Gstr2bParseError).unsupportedSections).toEqual(["cdnr"]);
    }
  });

  it("rejects a file missing the expected data.docdata shape", () => {
    expect(() => parseGstr2bExport({ not: "a gstr2b file" })).toThrow();
  });
});

describe("buildLocalItcSummary", () => {
  it("groups itcEligible purchase line items by vendor GSTIN + rate, skipping cancelled/draft/ineligible", () => {
    const purchases: LocalPurchaseForItc[] = [
      {
        vendorGstin: "29BBBBB1111B1Z6",
        status: "pending",
        lineItems: [
          { taxRatePercent: 18, taxableAmountMinor: 100_000, cgstMinor: 0, sgstMinor: 0, igstMinor: 18_000, itcEligible: true },
          { taxRatePercent: 18, taxableAmountMinor: 50_000, cgstMinor: 0, sgstMinor: 0, igstMinor: 9_000, itcEligible: false },
        ],
      },
      {
        vendorGstin: "29BBBBB1111B1Z6",
        status: "cancelled",
        lineItems: [{ taxRatePercent: 18, taxableAmountMinor: 999_999, cgstMinor: 0, sgstMinor: 0, igstMinor: 1, itcEligible: true }],
      },
    ];
    expect(buildLocalItcSummary(purchases)).toEqual([
      { vendorGstin: "29BBBBB1111B1Z6", taxRatePercent: 18, taxableAmountMinor: 100_000, cgstMinor: 0, sgstMinor: 0, igstMinor: 18_000 },
    ]);
  });
});

describe("reconcileGstr2b", () => {
  const local: LocalPurchaseDocument[] = [
    { vendorGstin: "29BBBBB1111B1Z6", docNumber: "V-MATCH", status: "pending", taxableValueMinor: 100_000, cgstMinor: 0, sgstMinor: 0, igstMinor: 18_000 },
    { vendorGstin: "29BBBBB1111B1Z6", docNumber: "V-MISMATCH", status: "pending", taxableValueMinor: 100_000, cgstMinor: 0, sgstMinor: 0, igstMinor: 18_000 },
    { vendorGstin: "29BBBBB1111B1Z6", docNumber: "V-ONLY-BOOKS", status: "pending", taxableValueMinor: 50_000, cgstMinor: 4_500, sgstMinor: 4_500, igstMinor: 0 },
  ];
  const imported = [
    { vendorGstin: "29BBBBB1111B1Z6", invoiceNumber: "V-MATCH", invoiceValueMinor: 118_000, taxableValueMinor: 100_000, igstMinor: 18_000, cgstMinor: 0, sgstMinor: 0, reverseCharge: false, source: "b2b" as const },
    { vendorGstin: "29BBBBB1111B1Z6", invoiceNumber: "V-MISMATCH", invoiceValueMinor: 236_000, taxableValueMinor: 200_000, igstMinor: 36_000, cgstMinor: 0, sgstMinor: 0, reverseCharge: false, source: "b2b" as const },
    { vendorGstin: "29BBBBB1111B1Z6", invoiceNumber: "V-ONLY-2B", invoiceValueMinor: 59_000, taxableValueMinor: 50_000, igstMinor: 9_000, cgstMinor: 0, sgstMinor: 0, reverseCharge: false, source: "b2b" as const },
  ];

  it("classifies all four diff categories correctly", () => {
    const diff = reconcileGstr2b(local, imported);
    const byInvoice = new Map(diff.map((r) => [r.invoiceNumber, r.category]));
    expect(byInvoice.get("V-MATCH")).toBe("matched");
    expect(byInvoice.get("V-MISMATCH")).toBe("value_mismatch");
    expect(byInvoice.get("V-ONLY-BOOKS")).toBe("missing_in_2b");
    expect(byInvoice.get("V-ONLY-2B")).toBe("missing_in_books");
    expect(diff).toHaveLength(4);
  });

  it("never cross-contaminates the diff across different vendor GSTINs", () => {
    const localTwoVendors: LocalPurchaseDocument[] = [
      { vendorGstin: "29AAAAA0000A1Z1", docNumber: "SAME-NUM", status: "pending", taxableValueMinor: 100_000, cgstMinor: 0, sgstMinor: 0, igstMinor: 18_000 },
      { vendorGstin: "27ZZZZZ9999Z1Z9", docNumber: "SAME-NUM", status: "pending", taxableValueMinor: 200_000, cgstMinor: 0, sgstMinor: 0, igstMinor: 36_000 },
    ];
    const importedOneVendor = [
      { vendorGstin: "29AAAAA0000A1Z1", invoiceNumber: "SAME-NUM", invoiceValueMinor: 118_000, taxableValueMinor: 100_000, igstMinor: 18_000, cgstMinor: 0, sgstMinor: 0, reverseCharge: false, source: "b2b" as const },
    ];
    const diff = reconcileGstr2b(localTwoVendors, importedOneVendor);
    const forVendor1 = diff.find((r) => r.vendorGstin === "29AAAAA0000A1Z1");
    const forVendor2 = diff.find((r) => r.vendorGstin === "27ZZZZZ9999Z1Z9");
    expect(forVendor1?.category).toBe("matched");
    // Vendor 2's identical-numbered invoice must NOT match vendor 1's imported row.
    expect(forVendor2?.category).toBe("missing_in_2b");
  });
});
