import Papa from "papaparse";
import ExcelJS from "exceljs";

/**
 * One column shape drives the on-screen table AND every export format, so CSV/Excel/PDF are
 * guaranteed to show exactly the same data as what the user sees — the spec's Phase 8 verify
 * step ("CSV export opens cleanly and matches the on-screen table") holds by construction rather
 * than by keeping two implementations in sync by hand.
 */
export type ExportColumn<T> = {
  key: string;
  header: string;
  value: (row: T) => string | number;
};

export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const data = rows.map((row) => Object.fromEntries(columns.map((c) => [c.header, c.value(row)])));
  return Papa.unparse(data, { columns: columns.map((c) => c.header) });
}

export async function toExcelBuffer<T>(
  rows: T[],
  columns: ExportColumn<T>[],
  sheetName: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31)); // Excel sheet-name length limit
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: 20 }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(Object.fromEntries(columns.map((c) => [c.key, c.value(row)])));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
