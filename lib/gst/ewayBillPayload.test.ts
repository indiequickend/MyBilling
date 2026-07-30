import { describe, expect, it } from "vitest";
import {
  buildEwayBillPayload,
  validateEwayBillPayload,
  type EwayBillInvoiceInput,
  type EwayBillBusinessInput,
  type EwayBillTransportInput,
} from "@/lib/gst/ewayBillPayload";

const business: EwayBillBusinessInput = {
  gstin: "27AAAAA0000A1Z5",
  displayName: "Acme Traders",
  address: { line1: "1 MG Road", city: "Mumbai", state: "Maharashtra", postalCode: "400001" },
};

const transport: EwayBillTransportInput = {
  transporterId: "27BBBBB1111B1Z6",
  transporterName: "Fast Logistics",
  transMode: "1",
  transDistanceKm: 120,
  vehicleNumber: "mh12ab1234",
  vehicleType: "R",
  subSupplyType: "1",
};

function invoiceFixture(overrides: Partial<EwayBillInvoiceInput> = {}): EwayBillInvoiceInput {
  return {
    docNumber: "INV-0001",
    invoiceDate: new Date("2026-06-15T00:00:00Z"),
    placeOfSupplyState: "Karnataka",
    customerGstin: "29CCCCC2222C1Z7",
    customerDisplayName: "Beta Corp",
    customerAddress: { line1: "2 Brigade Rd", city: "Bengaluru", state: "Karnataka", postalCode: "560001" },
    lineItems: [
      {
        description: "Widget",
        hsnOrSac: "8471",
        unit: "PCS",
        quantity: 10,
        taxableAmountMinor: 100_000,
        taxRatePercent: 18,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 18_000,
      },
    ],
    subtotalMinor: 100_000,
    totalCgstMinor: 0,
    totalSgstMinor: 0,
    totalIgstMinor: 18_000,
    grandTotalMinor: 118_000,
    ...overrides,
  };
}

describe("buildEwayBillPayload", () => {
  it("builds every required NIC EWB_INV01 field with the right shape", () => {
    const payload = buildEwayBillPayload(invoiceFixture(), business, transport);

    expect(payload.supplyType).toBe("O");
    expect(payload.docType).toBe("INV");
    expect(payload.docNo).toBe("INV-0001");
    expect(payload.docDate).toBe("15/06/2026");
    expect(payload.fromGstin).toBe("27AAAAA0000A1Z5");
    expect(payload.fromStateCode).toBe("27");
    expect(payload.toGstin).toBe("29CCCCC2222C1Z7");
    expect(payload.toStateCode).toBe("29");
    expect(payload.totalValue).toBe(1000);
    expect(payload.igstValue).toBe(180);
    expect(payload.totInvValue).toBe(1180);
    expect(payload.vehicleNo).toBe("MH12AB1234");
    expect(payload.itemList).toHaveLength(1);
    expect(payload.itemList[0].hsnCode).toBe("8471");
    expect(payload.itemList[0].igstRate).toBe(18);
    expect(payload.itemList[0].cgstRate).toBe(0);
  });

  it("defaults an unregistered customer's GSTIN to URP", () => {
    const payload = buildEwayBillPayload(
      invoiceFixture({ customerGstin: undefined }),
      business,
      transport,
    );
    expect(payload.toGstin).toBe("URP");
  });
});

describe("validateEwayBillPayload", () => {
  it("passes for a well-formed payload built from a valid fixture", () => {
    const payload = buildEwayBillPayload(invoiceFixture(), business, transport);
    const result = validateEwayBillPayload(payload);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("flags a missing HSN code and a malformed pincode", () => {
    const badInvoice = invoiceFixture({
      customerAddress: { line1: "2 Brigade Rd", city: "Bengaluru", state: "Karnataka", postalCode: "56001" },
      lineItems: [
        {
          description: "Widget",
          hsnOrSac: "",
          unit: "PCS",
          quantity: 10,
          taxableAmountMinor: 100_000,
          taxRatePercent: 18,
          cgstMinor: 0,
          sgstMinor: 0,
          igstMinor: 18_000,
        },
      ],
    });
    const payload = buildEwayBillPayload(badInvoice, business, transport);
    const result = validateEwayBillPayload(payload);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("hsnCode"))).toBe(true);
    expect(result.errors.some((e) => e.includes("toPincode"))).toBe(true);
  });
});
