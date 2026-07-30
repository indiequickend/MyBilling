import { handleReportExport } from "@/lib/reports/exportHandler";
import { getHsnSummary, type HsnSummaryRow } from "@/lib/db/queries/reports";
import { minorToRupeesString } from "@/lib/utils/money";
import type { ExportColumn } from "@/lib/reports/export";

const columns: ExportColumn<HsnSummaryRow>[] = [
  { key: "hsnOrSac", header: "HSN/SAC", value: (r) => r.hsnOrSac },
  { key: "taxableAmountMinor", header: "Taxable Amount", value: (r) => minorToRupeesString(r.taxableAmountMinor) },
  { key: "cgstMinor", header: "CGST", value: (r) => minorToRupeesString(r.cgstMinor) },
  { key: "sgstMinor", header: "SGST", value: (r) => minorToRupeesString(r.sgstMinor) },
  { key: "igstMinor", header: "IGST", value: (r) => minorToRupeesString(r.igstMinor) },
  { key: "totalMinor", header: "Total", value: (r) => minorToRupeesString(r.totalMinor) },
];

export async function GET(request: Request) {
  return handleReportExport(
    request,
    { module: "reports", action: "export" },
    columns,
    (businessId, params) => getHsnSummary(businessId, params),
    "Sale Summary by HSN",
  );
}
