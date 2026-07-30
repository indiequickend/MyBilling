import { handleReportExport } from "@/lib/reports/exportHandler";
import { listShareHistory, type ShareHistoryEntry } from "@/lib/db/queries/shareHistory";
import { minorToRupeesString } from "@/lib/utils/money";
import type { ExportColumn } from "@/lib/reports/export";

const columns: ExportColumn<ShareHistoryEntry>[] = [
  { key: "createdAt", header: "Created On", value: (r) => new Date(r.createdAt).toLocaleString() },
  { key: "amountMinor", header: "Amount", value: (r) => minorToRupeesString(r.amountMinor) },
  { key: "linkedInvoiceNumber", header: "Linked Invoice", value: (r) => r.linkedInvoiceNumber ?? "—" },
  { key: "note", header: "Note", value: (r) => r.note ?? "—" },
  { key: "expiresAt", header: "Expires", value: (r) => new Date(r.expiresAt).toLocaleString() },
  { key: "status", header: "Status", value: (r) => r.status },
];

export async function GET(request: Request) {
  return handleReportExport(
    request,
    { module: "reports", action: "export" },
    columns,
    async (businessId, params) => (await listShareHistory(businessId, { ...params, pageSize: 100 })).items,
    "Share History",
  );
}
