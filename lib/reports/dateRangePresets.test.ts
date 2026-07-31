import { describe, expect, it } from "vitest";
import { buildDateRangePresets } from "./dateRangePresets";

describe("buildDateRangePresets", () => {
  it("computes calendar and fiscal-year presets relative to `now`, fyStartMonth=4 (April)", () => {
    const now = new Date(2026, 6, 31); // 2026-07-31 (local)
    const presets = buildDateRangePresets(4, now);

    expect(presets).toEqual([
      { label: "This month", from: "2026-07-01", to: "2026-07-31" },
      { label: "Last month", from: "2026-06-01", to: "2026-06-30" },
      { label: "FY 2026-27", from: "2026-04-01", to: "2026-07-31" },
      { label: "FY 2025-26", from: "2025-04-01", to: "2026-03-31" },
      { label: "This year", from: "2026-01-01", to: "2026-07-31" },
      { label: "Last year", from: "2025-01-01", to: "2025-12-31" },
    ]);
  });

  it("rolls the fiscal year back when `now` falls before fyStartMonth", () => {
    const now = new Date(2026, 1, 15); // 2026-02-15, before April
    const presets = buildDateRangePresets(4, now);

    expect(presets.find((p) => p.label.startsWith("FY") && p.to === "2026-02-15")).toEqual({
      label: "FY 2025-26",
      from: "2025-04-01",
      to: "2026-02-15",
    });
  });

  it("handles January correctly for last month (year rollback)", () => {
    const now = new Date(2026, 0, 10); // 2026-01-10
    const presets = buildDateRangePresets(4, now);

    expect(presets.find((p) => p.label === "Last month")).toEqual({
      label: "Last month",
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });
});
