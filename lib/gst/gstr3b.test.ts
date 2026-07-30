import { describe, expect, it } from "vitest";
import {
  buildOutwardTaxableSupplies,
  buildZeroRatedAndExempt,
  buildInwardReverseCharge,
  buildInterstateToUnregistered,
  buildItcSummary,
  type Gstr3bPurchase,
  type Gstr3bDebitNote,
} from "@/lib/gst/gstr3b";
import type { Gstr1Invoice, Gstr1CreditNote } from "@/lib/gst/gstr1";

const BUSINESS_STATE = "Maharashtra";

const invoices: Gstr1Invoice[] = [
  {
    invoiceId: "i1",
    docNumber: "INV-0001",
    invoiceDate: new Date("2026-06-01"),
    status: "pending",
    placeOfSupplyState: "Maharashtra",
    customerGstin: "27AAAAA0000A1Z5",
    customerDisplayName: "Alpha Pvt Ltd",
    lineItems: [
      { taxRatePercent: 18, taxableAmountMinor: 100_000, cgstMinor: 9_000, sgstMinor: 9_000, igstMinor: 0, totalMinor: 118_000 },
    ],
    grandTotalMinor: 118_000,
  },
  {
    invoiceId: "i2",
    docNumber: "INV-0002",
    invoiceDate: new Date("2026-06-02"),
    status: "pending",
    placeOfSupplyState: "Karnataka",
    customerDisplayName: "Retail Buyer",
    lineItems: [
      { taxRatePercent: 18, taxableAmountMinor: 50_000, cgstMinor: 0, sgstMinor: 0, igstMinor: 9_000, totalMinor: 59_000 },
    ],
    grandTotalMinor: 59_000,
  },
  {
    invoiceId: "i3",
    docNumber: "INV-0003",
    invoiceDate: new Date("2026-06-03"),
    status: "pending",
    placeOfSupplyState: "Other Territory",
    customerDisplayName: "Overseas Buyer",
    lineItems: [{ taxRatePercent: 0, taxableAmountMinor: 40_000, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, totalMinor: 40_000 }],
    grandTotalMinor: 40_000,
  },
  {
    invoiceId: "i4",
    docNumber: "INV-0004",
    invoiceDate: new Date("2026-06-04"),
    status: "pending",
    placeOfSupplyState: "Maharashtra",
    customerDisplayName: "Exempt Buyer",
    lineItems: [{ taxRatePercent: 0, taxableAmountMinor: 15_000, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, totalMinor: 15_000 }],
    grandTotalMinor: 15_000,
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
    lineItems: [{ taxRatePercent: 18, taxableAmountMinor: 10_000, cgstMinor: 900, sgstMinor: 900, igstMinor: 0, totalMinor: 11_800 }],
  },
];

describe("buildOutwardTaxableSupplies", () => {
  it("sums b2b/b2cl/b2cs taxable+tax net of issued credit notes, excluding exempt/nil-rated", () => {
    const result = buildOutwardTaxableSupplies(invoices, creditNotes, BUSINESS_STATE);
    expect(result).toEqual({
      taxableAmountMinor: 100_000 + 50_000 - 10_000,
      cgstMinor: 9_000 - 900,
      sgstMinor: 9_000 - 900,
      igstMinor: 9_000,
    });
  });
});

describe("buildZeroRatedAndExempt", () => {
  it("splits exports (zero-rated) from nil-rated/exempt", () => {
    expect(buildZeroRatedAndExempt(invoices, BUSINESS_STATE)).toEqual({
      zeroRatedMinor: 40_000,
      nilExemptMinor: 15_000,
    });
  });
});

describe("buildInterstateToUnregistered", () => {
  it("groups unregistered inter-state supplies by place of supply", () => {
    expect(buildInterstateToUnregistered(invoices, BUSINESS_STATE)).toEqual([
      { placeOfSupplyState: "Karnataka", taxableAmountMinor: 50_000, igstMinor: 9_000 },
    ]);
  });
});

const purchases: Gstr3bPurchase[] = [
  {
    purchaseId: "p1",
    status: "pending",
    reverseCharge: false,
    lineItems: [
      { taxableAmountMinor: 80_000, cgstMinor: 7_200, sgstMinor: 7_200, igstMinor: 0, itcEligible: true },
      { taxableAmountMinor: 20_000, cgstMinor: 1_800, sgstMinor: 1_800, igstMinor: 0, itcEligible: false },
    ],
  },
  {
    purchaseId: "p2",
    status: "pending",
    reverseCharge: true,
    lineItems: [{ taxableAmountMinor: 30_000, cgstMinor: 2_700, sgstMinor: 2_700, igstMinor: 0, itcEligible: true }],
  },
  {
    purchaseId: "p3",
    status: "cancelled",
    reverseCharge: true,
    lineItems: [{ taxableAmountMinor: 999_999, cgstMinor: 1, sgstMinor: 1, igstMinor: 1, itcEligible: true }],
  },
];

describe("buildInwardReverseCharge", () => {
  it("sums only active reverse-charge purchases", () => {
    expect(buildInwardReverseCharge(purchases)).toEqual({
      taxableAmountMinor: 30_000,
      cgstMinor: 2_700,
      sgstMinor: 2_700,
      igstMinor: 0,
    });
  });
});

describe("buildItcSummary", () => {
  it("nets ITC-eligible purchase tax against issued debit note reversals", () => {
    const debitNotes: Gstr3bDebitNote[] = [
      { status: "issued", lineItems: [{ taxableAmountMinor: 5_000, cgstMinor: 450, sgstMinor: 450, igstMinor: 0 }] },
    ];
    const result = buildItcSummary(purchases, debitNotes);
    expect(result).toEqual({
      availableCgstMinor: 7_200 + 2_700,
      availableSgstMinor: 7_200 + 2_700,
      availableIgstMinor: 0,
      reversedCgstMinor: 450,
      reversedSgstMinor: 450,
      reversedIgstMinor: 0,
      netCgstMinor: 7_200 + 2_700 - 450,
      netSgstMinor: 7_200 + 2_700 - 450,
      netIgstMinor: 0,
    });
  });
});
