import { handleReportExport } from "@/lib/reports/exportHandler";
import { getBillWiseItemReport, type BillWiseItemRow } from "@/lib/db/queries/billWiseItemReport";
import { minorToRupeesString } from "@/lib/utils/money";
import type { ExportColumn } from "@/lib/reports/export";

const columns: ExportColumn<BillWiseItemRow>[] = [
  { key: "date", header: "Date", value: (r) => new Date(r.date).toLocaleDateString() },
  { key: "docNumber", header: "Doc #", value: (r) => r.docNumber ?? "Draft" },
  { key: "partyName", header: "Party", value: (r) => r.partyName },
  { key: "description", header: "Item", value: (r) => r.description },
  { key: "hsnOrSac", header: "HSN/SAC", value: (r) => r.hsnOrSac ?? "—" },
  { key: "quantity", header: "Qty", value: (r) => r.quantity },
  { key: "unitPriceMinor", header: "Unit Price", value: (r) => minorToRupeesString(r.unitPriceMinor) },
  { key: "totalMinor", header: "Total", value: (r) => minorToRupeesString(r.totalMinor) },
];

export async function GET(request: Request) {
  const docType = new URL(request.url).searchParams.get("docType") === "purchase" ? "purchase" : "invoice";
  return handleReportExport(
    request,
    { module: "reports", action: "export" },
    columns,
    (businessId, params) => getBillWiseItemReport(businessId, docType, params),
    "Bill-wise Item Report",
  );
}
