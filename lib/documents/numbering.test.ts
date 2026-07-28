import { describe, expect, it } from "vitest";
import {
  resolveFiscalYearLabel,
  resolveSeriesKey,
  formatDocumentNumber,
  resolveNumberingConfig,
} from "@/lib/documents/numbering";

describe("resolveFiscalYearLabel", () => {
  it("labels a month at or after the FY start month as the current calendar year's FY", () => {
    expect(resolveFiscalYearLabel(new Date(Date.UTC(2025, 3, 15)), 4)).toBe("2025-26"); // April
    expect(resolveFiscalYearLabel(new Date(Date.UTC(2025, 11, 31)), 4)).toBe("2025-26"); // December
  });

  it("labels a month before the FY start month as the previous calendar year's FY", () => {
    expect(resolveFiscalYearLabel(new Date(Date.UTC(2026, 0, 1)), 4)).toBe("2025-26"); // January
    expect(resolveFiscalYearLabel(new Date(Date.UTC(2026, 2, 31)), 4)).toBe("2025-26"); // March
  });

  it("rolls the FY-end year across a century boundary", () => {
    expect(resolveFiscalYearLabel(new Date(Date.UTC(2099, 3, 1)), 4)).toBe("2099-00");
  });
});

describe("resolveSeriesKey", () => {
  it("returns the fiscal year label when resetPolicy is fiscal_year", () => {
    expect(resolveSeriesKey(new Date(Date.UTC(2025, 5, 1)), 4, "fiscal_year")).toBe("2025-26");
  });

  it("returns a constant series when resetPolicy is never", () => {
    expect(resolveSeriesKey(new Date(Date.UTC(2025, 5, 1)), 4, "never")).toBe("default");
  });
});

describe("formatDocumentNumber", () => {
  it("pads the number and embeds the series key under fiscal_year reset", () => {
    const formatted = formatDocumentNumber({ prefix: "INV-", padding: 4, resetPolicy: "fiscal_year" }, "2025-26", 7);
    expect(formatted).toBe("INV-2025-26-0007");
  });

  it("omits the series key under never reset", () => {
    const formatted = formatDocumentNumber({ prefix: "INV-", padding: 4, resetPolicy: "never" }, "default", 7);
    expect(formatted).toBe("INV-0007");
  });

  it("does not truncate a number wider than the configured padding", () => {
    const formatted = formatDocumentNumber({ prefix: "INV-", padding: 4, resetPolicy: "never" }, "default", 123456);
    expect(formatted).toBe("INV-123456");
  });
});

describe("resolveNumberingConfig", () => {
  it("falls back to a docType-specific default when nothing is configured", () => {
    expect(resolveNumberingConfig(undefined, "invoice")).toEqual({
      prefix: "INV-",
      padding: 4,
      resetPolicy: "fiscal_year",
    });
  });

  it("returns the business's configured override when present", () => {
    const numbering = {
      fyStartMonth: 4,
      configs: { invoice: { prefix: "BILL-", padding: 5, resetPolicy: "never" as const } },
    };
    expect(resolveNumberingConfig(numbering, "invoice")).toEqual({
      prefix: "BILL-",
      padding: 5,
      resetPolicy: "never",
    });
  });
});
