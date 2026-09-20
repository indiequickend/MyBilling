import { describe, expect, it } from "vitest";
import {
  buildRowCells,
  getListColumns,
  parseSearchFieldIds,
  resolveSearchPaths,
} from "@/lib/documents/listColumns";

const defs = [
  { key: "journey_start", label: "Journey start", type: "date" },
  { key: "pnr", label: "PNR", type: "text" },
  { key: "pax", label: "Passengers", type: "number" },
  { key: "bad.key", label: "Bad", type: "text" },
  { key: "$where", label: "Worse", type: "text" },
];

describe("getListColumns", () => {
  it("appends safe custom fields as cf: columns and drops unsafe keys", () => {
    const ids = getListColumns("invoice", defs).map((c) => c.id);
    expect(ids).toContain("cf:journey_start");
    expect(ids).toContain("cf:pax");
    expect(ids).not.toContain("cf:bad.key");
    expect(ids).not.toContain("cf:$where");
  });

  it("makes text/date custom fields searchable but not number ones", () => {
    const cols = getListColumns("proforma_invoice", defs);
    expect(cols.find((c) => c.id === "cf:pnr")?.searchPath).toBe("customFieldValues.pnr");
    expect(cols.find((c) => c.id === "cf:pax")?.searchPath).toBeUndefined();
  });
});

describe("resolveSearchPaths", () => {
  const cols = getListColumns("purchase", defs);

  it("falls back to the default fields when nothing valid is requested", () => {
    const paths = resolveSearchPaths(cols, ["nope", "$where"]);
    expect(paths).toEqual(["docNumber", "vendorSnapshot.displayName", "referenceNumber", "vendorInvoiceNumber"]);
  });

  it("honours known ids only", () => {
    expect(resolveSearchPaths(cols, ["cf:pnr", "notes", "cf:bad.key", "customFieldValues.x"])).toEqual([
      "notes",
      "customFieldValues.pnr",
    ]);
  });
});

describe("parseSearchFieldIds", () => {
  it("accepts a string, an array, or garbage", () => {
    expect(parseSearchFieldIds("a")).toEqual(["a"]);
    expect(parseSearchFieldIds(["a", 1, "b"])).toEqual(["a", "b"]);
    expect(parseSearchFieldIds(undefined)).toEqual([]);
  });
});

describe("buildRowCells", () => {
  it("formats custom date values and money", () => {
    const cols = getListColumns("invoice", defs);
    const cells = buildRowCells(
      "invoice",
      { docNumber: "INV-1", grandTotalMinor: 12345, amountPaidMinor: 45, customFieldValues: { journey_start: "2026-09-20" } },
      cols,
      defs,
    );
    expect(cells["cf:journey_start"]).toBe("20-09-2026");
    expect(cells.total).toBe("₹123.45");
    expect(cells.balance).toBe("₹123.00");
  });
});
