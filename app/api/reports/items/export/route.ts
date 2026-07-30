import { handleReportExport } from "@/lib/reports/exportHandler";
import { getItemSalesReport, getItemPurchaseReport, type ItemReportRow } from "@/lib/db/queries/itemReports";
import { minorToRupeesString } from "@/lib/utils/money";
import type { ExportColumn } from "@/lib/reports/export";

const columns: ExportColumn<ItemReportRow>[] = [
  { key: "description", header: "Item", value: (r) => r.description },
  { key: "hsnOrSac", header: "HSN/SAC", value: (r) => r.hsnOrSac ?? "—" },
  { key: "quantity", header: "Qty", value: (r) => r.quantity },
  { key: "taxableAmountMinor", header: "Taxable", value: (r) => minorToRupeesString(r.taxableAmountMinor) },
  { key: "taxMinor", header: "Tax", value: (r) => minorToRupeesString(r.taxMinor) },
  { key: "totalMinor", header: "Total", value: (r) => minorToRupeesString(r.totalMinor) },
];

export async function GET(request: Request) {
  const docType = new URL(request.url).searchParams.get("docType") === "purchase" ? "purchase" : "sales";
  const fetchReport = docType === "purchase" ? getItemPurchaseReport : getItemSalesReport;
  return handleReportExport(
    request,
    { module: "reports", action: "export" },
    columns,
    (businessId, params) => fetchReport(businessId, params),
    "Item Report",
  );
}
