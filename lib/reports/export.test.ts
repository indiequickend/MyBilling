import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import { toCsv, toExcelBuffer, type ExportColumn } from "@/lib/reports/export";

type Row = { name: string; amountMinor: number };

const columns: ExportColumn<Row>[] = [
  { key: "name", header: "Name", value: (r) => r.name },
  { key: "amountMinor", header: "Amount", value: (r) => r.amountMinor / 100 },
];

const rows: Row[] = [
  { name: "Invoice 1", amountMinor: 150_00 },
  { name: "Invoice 2", amountMinor: 275_50 },
];

describe("lib/reports/export", () => {
  it("toCsv round-trips through Papa.parse back to the same rows — matches the on-screen table", () => {
    const csv = toCsv(rows, columns);
    const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
    expect(parsed.data).toEqual([
      { Name: "Invoice 1", Amount: "150" },
      { Name: "Invoice 2", Amount: "275.5" },
    ]);
  });

  it("toExcelBuffer produces a workbook exceljs can re-read with the same header row", async () => {
    const buffer = await toExcelBuffer(rows, columns, "Test Report");
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    // exceljs's bundled type defs predate @types/node's generic Buffer<T> — safe runtime cast.
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).getCell(1).value).toBe("Name");
    expect(sheet.getRow(1).getCell(2).value).toBe("Amount");
    expect(sheet.getRow(2).getCell(1).value).toBe("Invoice 1");
    expect(sheet.getRow(2).getCell(2).value).toBe(150);
  });
});
