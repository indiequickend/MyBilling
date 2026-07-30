import { describe, expect, it } from "vitest";
import {
  buildEInvoicePayload,
  validateEInvoicePayload,
  type EInvoiceInvoiceInput,
  type EInvoiceBusinessInput,
} from "@/lib/gst/eInvoicePayload";

const business: EInvoiceBusinessInput = {
  gstin: "27AAAAA0000A1Z5",
  displayName: "Acme Traders",
  phone: "9999999999",
  email: "acme@example.com",
  address: { line1: "1 MG Road", city: "Mumbai", state: "Maharashtra", postalCode: "400001" },
};

function invoiceFixture(overrides: Partial<EInvoiceInvoiceInput> = {}): EInvoiceInvoiceInput {
  return {
    docNumber: "INV-0002",
    invoiceDate: new Date("2026-06-20T00:00:00Z"),
    reverseCharge: false,
    placeOfSupplyState: "Maharashtra",
    customerGstin: "27CCCCC2222C1Z7",
    customerDisplayName: "Beta Corp",
    customerAddress: { line1: "2 Fort Rd", city: "Mumbai", state: "Maharashtra", postalCode: "400002" },
    lineItems: [
      {
        description: "Consulting Service",
        hsnOrSac: "998311",
        unit: "PCS",
        quantity: 1,
        unitPriceMinor: 100_000,
        taxableAmountMinor: 100_000,
        taxRatePercent: 18,
        cgstMinor: 9_000,
        sgstMinor: 9_000,
        igstMinor: 0,
        totalMinor: 118_000,
      },
    ],
    subtotalMinor: 100_000,
    totalCgstMinor: 9_000,
    totalSgstMinor: 9_000,
    totalIgstMinor: 0,
    discountAmountMinor: 0,
    roundOffAmountMinor: 0,
    grandTotalMinor: 118_000,
    ...overrides,
  };
}

describe("buildEInvoicePayload", () => {
  it("builds every required IRP section with the right shape", () => {
    const payload = buildEInvoicePayload(invoiceFixture(), business);

    expect(payload.Version).toBe("1.1");
    expect(payload.TranDtls).toEqual({ TaxSch: "GST", SupTyp: "B2B", RegRev: "N" });
    expect(payload.DocDtls).toEqual({ Typ: "INV", No: "INV-0002", Dt: "20/06/2026" });
    expect(payload.SellerDtls.Gstin).toBe("27AAAAA0000A1Z5");
    expect(payload.SellerDtls.Stcd).toBe("27");
    expect(payload.BuyerDtls.Gstin).toBe("27CCCCC2222C1Z7");
    expect(payload.BuyerDtls.Pos).toBe("27");
    expect(payload.ItemList).toHaveLength(1);
    expect(payload.ItemList[0].HsnCd).toBe("998311");
    expect(payload.ItemList[0].IsServc).toBe("Y");
    expect(payload.ValDtls.TotInvVal).toBe(1180);
  });

  it("classifies an unregistered customer as B2C and defaults GSTIN to URP", () => {
    const payload = buildEInvoicePayload(invoiceFixture({ customerGstin: undefined }), business);
    expect(payload.TranDtls.SupTyp).toBe("B2C");
    expect(payload.BuyerDtls.Gstin).toBe("URP");
  });
});

describe("validateEInvoicePayload", () => {
  it("passes for a well-formed payload built from a valid fixture", () => {
    const payload = buildEInvoicePayload(invoiceFixture(), business);
    const result = validateEInvoicePayload(payload);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("flags an invalid seller GSTIN and a missing HSN code", () => {
    const payload = buildEInvoicePayload(invoiceFixture(), { ...business, gstin: "not-a-gstin" });
    payload.ItemList[0].HsnCd = "";
    const result = validateEInvoicePayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("SellerDtls.Gstin"))).toBe(true);
    expect(result.errors.some((e) => e.includes("HsnCd"))).toBe(true);
  });
});
