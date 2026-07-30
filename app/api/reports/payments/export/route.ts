import { handleReportExport } from "@/lib/reports/exportHandler";
import { getPaymentsReport, type PaymentTimelineEntry } from "@/lib/db/queries/payments";
import { PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import { minorToRupeesString } from "@/lib/utils/money";
import type { ExportColumn } from "@/lib/reports/export";

const columns: ExportColumn<PaymentTimelineEntry>[] = [
  { key: "paymentDate", header: "Date", value: (r) => new Date(r.paymentDate).toLocaleDateString() },
  { key: "direction", header: "Direction", value: (r) => (r.direction === "in" ? "Received" : "Given") },
  { key: "partyName", header: "Party", value: (r) => r.partyName ?? "—" },
  { key: "bankAccountName", header: "Account", value: (r) => r.bankAccountName },
  { key: "mode", header: "Mode", value: (r) => PAYMENT_MODE_LABELS[r.mode] },
  { key: "linkedDocumentNumber", header: "Linked Doc", value: (r) => r.linkedDocumentNumber ?? "—" },
  { key: "amountMinor", header: "Amount", value: (r) => minorToRupeesString(r.amountMinor) },
];

export async function GET(request: Request) {
  return handleReportExport(
    request,
    { module: "reports", action: "export" },
    columns,
    (businessId, params) => getPaymentsReport(businessId, params),
    "Payments Report",
  );
}
