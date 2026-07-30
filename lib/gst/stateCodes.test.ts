import { describe, expect, it } from "vitest";
import { stateNameToCode, gstinToStateCode, isValidStateCode } from "@/lib/gst/stateCodes";

describe("stateNameToCode", () => {
  it("is case- and whitespace-insensitive", () => {
    expect(stateNameToCode("Maharashtra")).toBe("27");
    expect(stateNameToCode("  maharashtra ")).toBe("27");
    expect(stateNameToCode("KARNATAKA")).toBe("29");
  });

  it("returns undefined for an unrecognized state name", () => {
    expect(stateNameToCode("Not A State")).toBeUndefined();
  });
});

describe("gstinToStateCode", () => {
  it("extracts the 2-digit state code from a valid GSTIN", () => {
    expect(gstinToStateCode("27AAAAA0000A1Z5")).toBe("27");
    expect(gstinToStateCode(" 29aaaaa0000a1z5 ")).toBe("29");
  });

  it("returns undefined for a malformed GSTIN", () => {
    expect(gstinToStateCode("not-a-gstin")).toBeUndefined();
    expect(gstinToStateCode("")).toBeUndefined();
  });
});

describe("isValidStateCode", () => {
  it("accepts known codes and rejects unknown ones", () => {
    expect(isValidStateCode("27")).toBe(true);
    expect(isValidStateCode("97")).toBe(true);
    expect(isValidStateCode("00")).toBe(false);
  });
});
