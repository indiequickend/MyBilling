import { describe, expect, it } from "vitest";
import {
  gstPeriodSchema,
  transportDetailsSchema,
  markGstr1FiledSchema,
  eInvoiceStatusOverrideSchema,
} from "@/lib/validation/gst";

describe("gstPeriodSchema", () => {
  it("accepts a valid YYYY-MM period", () => {
    expect(gstPeriodSchema.safeParse("2026-06").success).toBe(true);
  });

  it("rejects an invalid month or shape", () => {
    expect(gstPeriodSchema.safeParse("2026-13").success).toBe(false);
    expect(gstPeriodSchema.safeParse("2026/06").success).toBe(false);
    expect(gstPeriodSchema.safeParse("").success).toBe(false);
  });
});

describe("transportDetailsSchema", () => {
  const base = { transMode: "1", vehicleType: "R", subSupplyType: "1" };

  it("accepts a minimal valid submission with all optional fields absent", () => {
    const result = transportDetailsSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("accepts and normalizes a valid transporter ID", () => {
    const result = transportDetailsSchema.safeParse({ ...base, transporterId: " 29aaaaa0000a1z6 " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.transporterId).toBe("29AAAAA0000A1Z6");
  });

  it("rejects a malformed transporter ID", () => {
    const result = transportDetailsSchema.safeParse({ ...base, transporterId: "too-short" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid transMode/vehicleType/subSupplyType", () => {
    expect(transportDetailsSchema.safeParse({ ...base, transMode: "9" }).success).toBe(false);
    expect(transportDetailsSchema.safeParse({ ...base, vehicleType: "X" }).success).toBe(false);
    expect(transportDetailsSchema.safeParse({ ...base, subSupplyType: "0" }).success).toBe(false);
  });
});

describe("markGstr1FiledSchema", () => {
  it("requires a valid period", () => {
    expect(markGstr1FiledSchema.safeParse({ period: "2026-06" }).success).toBe(true);
    expect(markGstr1FiledSchema.safeParse({ period: "bad" }).success).toBe(false);
  });
});

describe("eInvoiceStatusOverrideSchema", () => {
  it("only allows a manual override to cancelled or pending", () => {
    expect(eInvoiceStatusOverrideSchema.safeParse({ status: "cancelled" }).success).toBe(true);
    expect(eInvoiceStatusOverrideSchema.safeParse({ status: "pending" }).success).toBe(true);
    expect(eInvoiceStatusOverrideSchema.safeParse({ status: "success" }).success).toBe(false);
  });
});
