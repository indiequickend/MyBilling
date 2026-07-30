import { handleReportExport } from "@/lib/reports/exportHandler";
import { getDocumentConversionHistory, type ConversionHistoryEntry } from "@/lib/db/queries/reports";
import type { ExportColumn } from "@/lib/reports/export";

const SOURCE_LABELS: Record<ConversionHistoryEntry["sourceType"], string> = {
  quotation: "Quotation",
  sales_order: "Sales Order",
  purchase_order: "Purchase Order",
};
const TARGET_LABELS: Record<ConversionHistoryEntry["targetType"], string> = {
  invoice: "Invoice",
  sales_order: "Sales Order",
  purchase: "Purchase",
};

const columns: ExportColumn<ConversionHistoryEntry>[] = [
  { key: "convertedAt", header: "Converted On", value: (r) => new Date(r.convertedAt).toLocaleDateString() },
  { key: "sourceType", header: "Source Type", value: (r) => SOURCE_LABELS[r.sourceType] },
  { key: "sourceDocNumber", header: "Source Doc #", value: (r) => r.sourceDocNumber ?? "—" },
  { key: "targetType", header: "Target Type", value: (r) => TARGET_LABELS[r.targetType] },
  { key: "targetDocNumber", header: "Target Doc #", value: (r) => r.targetDocNumber ?? "Draft" },
  { key: "lineItemCount", header: "Line Items", value: (r) => r.lineItemCount },
];

export async function GET(request: Request) {
  return handleReportExport(
    request,
    { module: "reports", action: "export" },
    columns,
    (businessId, params) => getDocumentConversionHistory(businessId, params),
    "Document Conversion History",
  );
}
