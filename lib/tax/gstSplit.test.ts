import { describe, expect, it } from "vitest";
import { splitTax, isSameState } from "@/lib/tax/gstSplit";

describe("isSameState", () => {
  it("is case- and whitespace-insensitive", () => {
    expect(isSameState("Maharashtra", "  maharashtra ")).toBe(true);
    expect(isSameState("Maharashtra", "Karnataka")).toBe(false);
  });

  it("treats two blank states as the same state (defaults to CGST+SGST, not a crash)", () => {
    expect(isSameState("", "")).toBe(true);
  });
});

describe("splitTax", () => {
  it("splits intra-state tax evenly into CGST+SGST with no IGST", () => {
    const result = splitTax(100_000, 18, "Maharashtra", "Maharashtra");
    expect(result).toEqual({ cgstMinor: 9_000, sgstMinor: 9_000, igstMinor: 0, totalTaxMinor: 18_000 });
  });

  it("puts the whole tax into IGST for inter-state supply", () => {
    const result = splitTax(100_000, 18, "Maharashtra", "Karnataka");
    expect(result).toEqual({ cgstMinor: 0, sgstMinor: 0, igstMinor: 18_000, totalTaxMinor: 18_000 });
  });

  it("rounds an odd intra-state tax amount without losing or duplicating a paisa", () => {
    // 18% of 100_005 = 18_000.9 -> rounds to 18_001 (odd), so cgst+sgst must still sum to it
    const result = splitTax(100_005, 18, "Maharashtra", "Maharashtra");
    expect(result.cgstMinor + result.sgstMinor).toBe(result.totalTaxMinor);
    expect(result.totalTaxMinor).toBe(18_001);
  });

  it("returns all zeros for a zero-rated line", () => {
    expect(splitTax(50_000, 0, "Maharashtra", "Maharashtra")).toEqual({
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: 0,
      totalTaxMinor: 0,
    });
  });
});
