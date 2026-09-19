import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "@/lib/utils/date";

describe("formatDate / formatDateTime", () => {
  it("formats a UTC-midnight business date as dd-mm-yyyy (same calendar day)", () => {
    expect(formatDate(new Date("2026-09-18T00:00:00.000Z"))).toBe("18-09-2026");
    expect(formatDate("2026-01-05T00:00:00.000Z")).toBe("05-01-2026");
  });

  it("formats timestamps in IST", () => {
    // 20:00 UTC on 18 Sep is 01:30 IST on 19 Sep.
    expect(formatDate(new Date("2026-09-18T20:00:00.000Z"))).toBe("19-09-2026");
    expect(formatDateTime(new Date("2026-09-18T20:00:00.000Z"))).toBe("19-09-2026 01:30");
    expect(formatDateTime(new Date("2026-03-01T07:05:00.000Z"))).toBe("01-03-2026 12:35");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatDate("not a date")).toBe("");
    expect(formatDateTime(NaN)).toBe("");
  });
});
