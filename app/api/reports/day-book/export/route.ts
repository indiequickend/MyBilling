import { handleReportExport } from "@/lib/reports/exportHandler";
import { getDayBook, type DayBookEntry } from "@/lib/db/queries/reports";
import { minorToRupeesString } from "@/lib/utils/money";
import type { ExportColumn } from "@/lib/reports/export";

const DOC_TYPE_LABELS: Record<DayBookEntry["type"], string> = {
  invoice: "Invoice",
  purchase: "Purchase",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  payment: "Payment",
  expense: "Expense",
  indirect_income: "Indirect Income",
  journal: "Journal",
};

const columns: ExportColumn<DayBookEntry>[] = [
  { key: "date", header: "Date", value: (r) => new Date(r.date).toLocaleString() },
  { key: "type", header: "Type", value: (r) => DOC_TYPE_LABELS[r.type] },
  { key: "docNumber", header: "Doc #", value: (r) => r.docNumber ?? "—" },
  { key: "description", header: "Description", value: (r) => r.description },
  { key: "partyName", header: "Party", value: (r) => r.partyName ?? "—" },
  { key: "amountMinor", header: "Amount", value: (r) => minorToRupeesString(r.amountMinor) },
];

export async function GET(request: Request) {
  return handleReportExport(
    request,
    { module: "reports", action: "export" },
    columns,
    (businessId, params) => getDayBook(businessId, params.dateFrom ?? new Date()),
    "Day Book",
  );
}
