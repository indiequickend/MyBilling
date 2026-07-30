import { handleReportExport } from "@/lib/reports/exportHandler";
import { getSummaryReport, type SummaryReportRow } from "@/lib/db/queries/reports";
import { minorToRupeesString } from "@/lib/utils/money";
import type { ExportColumn } from "@/lib/reports/export";

const BUCKETS = ["day", "week", "month"] as const;
type Bucket = (typeof BUCKETS)[number];

const columns: ExportColumn<SummaryReportRow>[] = [
  { key: "periodStart", header: "Period", value: (r) => new Date(r.periodStart).toLocaleDateString() },
  { key: "salesMinor", header: "Sales", value: (r) => minorToRupeesString(r.salesMinor) },
  { key: "purchasesMinor", header: "Purchases", value: (r) => minorToRupeesString(r.purchasesMinor) },
  { key: "expensesMinor", header: "Expenses", value: (r) => minorToRupeesString(r.expensesMinor) },
  { key: "paymentsInMinor", header: "Payments In", value: (r) => minorToRupeesString(r.paymentsInMinor) },
  { key: "paymentsOutMinor", header: "Payments Out", value: (r) => minorToRupeesString(r.paymentsOutMinor) },
];

export async function GET(request: Request) {
  const bucketRaw = new URL(request.url).searchParams.get("bucket");
  const bucket: Bucket = BUCKETS.includes(bucketRaw as Bucket) ? (bucketRaw as Bucket) : "day";
  return handleReportExport(
    request,
    { module: "reports", action: "export" },
    columns,
    (businessId, params) => getSummaryReport(businessId, { ...params, bucket }),
    "Summary Report",
  );
}
