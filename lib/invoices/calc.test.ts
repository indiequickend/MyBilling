import { describe, expect, it } from "vitest";
import {
  computeLineItem,
  computeInvoiceTotals,
  exclusiveUnitPriceMinor,
  deriveInvoiceStatus,
} from "@/lib/invoices/calc";

describe("exclusiveUnitPriceMinor", () => {
  it("returns the price unchanged when it is already tax-exclusive", () => {
    expect(exclusiveUnitPriceMinor(11_800, 18, false)).toBe(11_800);
  });

  it("returns the price unchanged when the tax rate is zero", () => {
    expect(exclusiveUnitPriceMinor(11_800, 0, true)).toBe(11_800);
  });

  it("strips the embedded tax out of an inclusive price", () => {
    expect(exclusiveUnitPriceMinor(11_800, 18, true)).toBe(10_000);
  });
});

describe("computeLineItem", () => {
  it("applies a percentage line discount before splitting intra-state tax", () => {
    const result = computeLineItem(
      { quantity: 2, unitPriceMinor: 50_000, discountType: "percentage", discountValue: 10, taxRatePercent: 18 },
      "Maharashtra",
      "Maharashtra",
    );
    // gross 100_000, -10% = 90_000 taxable, 18% tax = 16_200 (8_100 cgst + 8_100 sgst)
    expect(result).toEqual({
      taxableAmountMinor: 90_000,
      cgstMinor: 8_100,
      sgstMinor: 8_100,
      igstMinor: 0,
      totalMinor: 106_200,
    });
  });

  it("applies a flat-amount line discount (minor units) for an inter-state line", () => {
    const result = computeLineItem(
      { quantity: 1, unitPriceMinor: 100_000, discountType: "amount", discountValue: 5_000, taxRatePercent: 18 },
      "Maharashtra",
      "Karnataka",
    );
    expect(result).toEqual({
      taxableAmountMinor: 95_000,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 17_100,
      totalMinor: 112_100,
    });
  });

  it("clamps a line discount that would exceed the line's gross value", () => {
    const result = computeLineItem(
      { quantity: 1, unitPriceMinor: 1_000, discountType: "amount", discountValue: 5_000, taxRatePercent: 0 },
      "Maharashtra",
      "Maharashtra",
    );
    expect(result.taxableAmountMinor).toBe(0);
    expect(result.totalMinor).toBe(0);
  });
});

describe("computeInvoiceTotals", () => {
  const oneLine = [
    { quantity: 1, unitPriceMinor: 100_000, discountType: "percentage" as const, discountValue: 0, taxRatePercent: 18 },
  ];

  it("computes a no-discount, no-round-off intra-state invoice", () => {
    const totals = computeInvoiceTotals(
      oneLine,
      { type: "percentage", value: 0, target: "total" },
      false,
      "Maharashtra",
      "Maharashtra",
    );
    expect(totals).toEqual({
      subtotalMinor: 100_000,
      totalTaxMinor: 18_000,
      totalCgstMinor: 9_000,
      totalSgstMinor: 9_000,
      totalIgstMinor: 0,
      discountAmountMinor: 0,
      roundOff: false,
      roundOffAmountMinor: 0,
      grandTotalMinor: 118_000,
      lineItems: [
        { taxableAmountMinor: 100_000, cgstMinor: 9_000, sgstMinor: 9_000, igstMinor: 0, totalMinor: 118_000 },
      ],
    });
  });

  it("a post-tax discount target (total) leaves the tax total unchanged", () => {
    const totals = computeInvoiceTotals(
      oneLine,
      { type: "percentage", value: 10, target: "total" },
      false,
      "Maharashtra",
      "Maharashtra",
    );
    expect(totals.totalTaxMinor).toBe(18_000);
    expect(totals.discountAmountMinor).toBe(11_800); // 10% of (100_000 + 18_000)
    expect(totals.grandTotalMinor).toBe(106_200);
  });

  it("a pre-tax discount target (net_amount) proportionally reduces the tax total", () => {
    const totals = computeInvoiceTotals(
      oneLine,
      { type: "percentage", value: 10, target: "net_amount" },
      false,
      "Maharashtra",
      "Maharashtra",
    );
    expect(totals.totalTaxMinor).toBe(16_200); // 90% of 18_000
    expect(totals.totalCgstMinor).toBe(8_100);
    expect(totals.totalSgstMinor).toBe(8_100);
    expect(totals.discountAmountMinor).toBe(10_000); // 10% of subtotal only
    // Same final grand total as the post-tax case above — a percentage discount commutes with
    // tax multiplication — even though the reported tax breakdown differs.
    expect(totals.grandTotalMinor).toBe(106_200);
  });

  it("unit_price target behaves the same as net_amount (both collapse to the pre-tax base)", () => {
    const totals = computeInvoiceTotals(
      oneLine,
      { type: "percentage", value: 10, target: "unit_price" },
      false,
      "Maharashtra",
      "Maharashtra",
    );
    expect(totals.grandTotalMinor).toBe(106_200);
    expect(totals.totalTaxMinor).toBe(16_200);
  });

  it("price_with_tax target behaves the same as total (both collapse to the tax-inclusive base)", () => {
    const totals = computeInvoiceTotals(
      oneLine,
      { type: "percentage", value: 10, target: "price_with_tax" },
      false,
      "Maharashtra",
      "Maharashtra",
    );
    expect(totals.grandTotalMinor).toBe(106_200);
    expect(totals.totalTaxMinor).toBe(18_000);
  });

  it("rounds the grand total to the nearest whole rupee when roundOff is enabled", () => {
    const oddLine = [
      { quantity: 3, unitPriceMinor: 33_333, discountType: "percentage" as const, discountValue: 0, taxRatePercent: 18 },
    ];
    const totals = computeInvoiceTotals(
      oddLine,
      { type: "percentage", value: 0, target: "total" },
      true,
      "Maharashtra",
      "Maharashtra",
    );
    // gross 99_999, tax 18% = round(17_999.82) = 18_000 -> pre-round total 117_999
    expect(totals.grandTotalMinor % 100).toBe(0);
    expect(totals.grandTotalMinor).toBe(118_000);
    expect(totals.roundOffAmountMinor).toBe(1);
  });

  it("leaves the grand total unrounded when roundOff is disabled", () => {
    const oddLine = [
      { quantity: 3, unitPriceMinor: 33_333, discountType: "percentage" as const, discountValue: 0, taxRatePercent: 18 },
    ];
    const totals = computeInvoiceTotals(
      oddLine,
      { type: "percentage", value: 0, target: "total" },
      false,
      "Maharashtra",
      "Maharashtra",
    );
    expect(totals.grandTotalMinor).toBe(117_999);
    expect(totals.roundOffAmountMinor).toBe(0);
  });

  it("clamps a document-level discount that would exceed its base", () => {
    const totals = computeInvoiceTotals(
      oneLine,
      { type: "amount", value: 999_999, target: "net_amount" },
      false,
      "Maharashtra",
      "Maharashtra",
    );
    expect(totals.discountAmountMinor).toBe(100_000); // clamped to subtotal
    expect(totals.grandTotalMinor).toBe(0);
  });

  it("sums CGST/SGST/IGST across multiple lines with mixed tax rates", () => {
    const totals = computeInvoiceTotals(
      [
        { quantity: 1, unitPriceMinor: 100_000, discountType: "percentage", discountValue: 0, taxRatePercent: 18 },
        { quantity: 1, unitPriceMinor: 50_000, discountType: "percentage", discountValue: 0, taxRatePercent: 5 },
      ],
      { type: "percentage", value: 0, target: "total" },
      false,
      "Maharashtra",
      "Maharashtra",
    );
    expect(totals.subtotalMinor).toBe(150_000);
    expect(totals.totalTaxMinor).toBe(18_000 + 2_500);
    expect(totals.totalCgstMinor).toBe(9_000 + 1_250);
    expect(totals.totalSgstMinor).toBe(9_000 + 1_250);
  });
});

describe("deriveInvoiceStatus", () => {
  it("is pending when nothing has been paid", () => {
    expect(deriveInvoiceStatus(10_000, 0)).toBe("pending");
  });

  it("is partially_paid when some but not all has been paid", () => {
    expect(deriveInvoiceStatus(10_000, 4_000)).toBe("partially_paid");
  });

  it("is paid once the amount paid reaches the grand total", () => {
    expect(deriveInvoiceStatus(10_000, 10_000)).toBe("paid");
  });

  it("is paid even if overpaid", () => {
    expect(deriveInvoiceStatus(10_000, 10_500)).toBe("paid");
  });
});
