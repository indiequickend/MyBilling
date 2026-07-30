import { handleReportExport } from "@/lib/reports/exportHandler";
import { getTransactionReport, type TransactionReportRow } from "@/lib/db/queries/reports";
import { minorToRupeesString } from "@/lib/utils/money";
import type { ExportColumn } from "@/lib/reports/export";

const DOC_TYPE_LABELS: Record<TransactionReportRow["documentType"], string> = {
  invoice: "Invoice",
  purchase: "Purchase",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
};

const columns: ExportColumn<TransactionReportRow>[] = [
  { key: "date", header: "Date", value: (r) => new Date(r.date).toLocaleDateString() },
  { key: "documentType", header: "Type", value: (r) => DOC_TYPE_LABELS[r.documentType] },
  { key: "docNumber", header: "Doc #", value: (r) => r.docNumber ?? "Draft" },
  { key: "partyName", header: "Party", value: (r) => r.partyName },
  { key: "status", header: "Status", value: (r) => r.status },
  { key: "taxableAmountMinor", header: "Taxable", value: (r) => minorToRupeesString(r.taxableAmountMinor) },
  { key: "taxMinor", header: "Tax", value: (r) => minorToRupeesString(r.taxMinor) },
  { key: "grandTotalMinor", header: "Total", value: (r) => minorToRupeesString(r.grandTotalMinor) },
  { key: "amountPaidMinor", header: "Paid", value: (r) => minorToRupeesString(r.amountPaidMinor) },
  { key: "balanceMinor", header: "Balance", value: (r) => minorToRupeesString(r.balanceMinor) },
];

export async function GET(request: Request) {
  return handleReportExport(
    request,
    { module: "reports", action: "export" },
    columns,
    (businessId, params) => getTransactionReport(businessId, params),
    "Transaction Report",
  );
}
