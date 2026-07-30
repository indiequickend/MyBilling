import { handleReportExport } from "@/lib/reports/exportHandler";
import { getTdsTcsReport, type TdsTcsRow } from "@/lib/db/queries/reports";
import { minorToRupeesString } from "@/lib/utils/money";
import type { ExportColumn } from "@/lib/reports/export";

const DOC_TYPE_LABELS: Record<TdsTcsRow["documentType"], string> = {
  invoice: "Invoice",
  purchase: "Purchase",
  expense: "Expense",
};
const KIND_LABELS: Record<TdsTcsRow["kind"], string> = {
  tcs_on_sales: "TCS Receivable (on sales)",
  tds_deducted: "TDS Payable (deducted)",
  tcs_paid: "TCS Payable (paid to vendor)",
};

const columns: ExportColumn<TdsTcsRow>[] = [
  { key: "date", header: "Date", value: (r) => new Date(r.date).toLocaleDateString() },
  { key: "kind", header: "Kind", value: (r) => KIND_LABELS[r.kind] },
  { key: "documentType", header: "Doc Type", value: (r) => DOC_TYPE_LABELS[r.documentType] },
  { key: "docNumber", header: "Doc #", value: (r) => r.docNumber ?? "—" },
  { key: "partyName", header: "Party", value: (r) => r.partyName ?? "—" },
  { key: "sectionCode", header: "Section", value: (r) => r.sectionCode ?? "—" },
  { key: "ratePercent", header: "Rate %", value: (r) => r.ratePercent ?? "—" },
  { key: "amountMinor", header: "Amount", value: (r) => minorToRupeesString(r.amountMinor) },
];

export async function GET(request: Request) {
  return handleReportExport(
    request,
    { module: "reports", action: "export" },
    columns,
    (businessId, params) => getTdsTcsReport(businessId, params),
    "TDS-TCS Report",
  );
}
