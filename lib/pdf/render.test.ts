import { describe, expect, it } from "vitest";
import { renderPdf } from "@/lib/pdf/render";
import { InvoiceDocument } from "@/lib/pdf/invoiceTemplate";
import type { InvoiceDoc } from "@/lib/db/models/Invoice";

const fixtureInvoice = {
  customerSnapshot: { displayName: "Acme Traders", gstin: "27AAAAA0000A1Z5" },
  docNumber: "INV-2025-26-0001",
  invoiceDate: new Date("2025-06-01"),
  dueDate: new Date("2025-06-15"),
  referenceNumber: "PO-42",
  lineItems: [
    {
      description: "Widget",
      hsnOrSac: "8471",
      unit: "PCS",
      quantity: 2,
      unitPriceMinor: 50_000,
      taxRatePercent: 18,
      totalMinor: 106_200,
    },
  ],
  subtotalMinor: 90_000,
  totalTaxMinor: 16_200,
  discountAmountMinor: 10_000,
  roundOff: true,
  roundOffAmountMinor: 0,
  grandTotalMinor: 106_200,
  amountPaidMinor: 50_000,
  notes: "Thanks for your business.",
  terms: "Net 15",
} as unknown as InvoiceDoc;

describe("InvoiceDocument + renderPdf", () => {
  // Pure-JS (@react-pdf/renderer) — no headless browser / Chromium binary required, so this runs
  // the same way in CI, locally, and inside a Vercel serverless function.
  it("renders a fixture invoice to a real PDF buffer", async () => {
    const document = await InvoiceDocument({
      invoice: fixtureInvoice,
      business: { name: "QuickTrails", brandName: "QuickTrails", gstin: "27BBBBB1111B1Z5" },
      bankAccount: { name: "Cash Account", upiId: "business@upi" },
      signature: null,
    });

    const pdf = await renderPdf(document);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(1000);
  }, 30_000);
});
