import { redirect } from "next/navigation";
import { getDashboardContext, getActiveBusinessFyStartMonth } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { getDocumentConversionHistory, type ConversionHistoryEntry } from "@/lib/db/queries/reports";
import { parseReportDateRange, reportExportQuery } from "@/lib/reports/searchParams";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable, type ReportTableColumn } from "@/components/reports/ReportTable";

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

export default async function ConversionHistoryReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  if (!can(context.membership, "reports", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const fyStartMonth = getActiveBusinessFyStartMonth(context);
  const dateRange = parseReportDateRange(sp);
  const rows = await getDocumentConversionHistory(context.activeBusinessId, dateRange);

  const columns: ReportTableColumn<ConversionHistoryEntry>[] = [
    { key: "convertedAt", header: "Converted On", value: (r) => new Date(r.convertedAt).toLocaleDateString() },
    { key: "sourceType", header: "Source Type", value: (r) => SOURCE_LABELS[r.sourceType] },
    { key: "sourceDocNumber", header: "Source Doc #", value: (r) => r.sourceDocNumber ?? "—" },
    { key: "targetType", header: "Target Type", value: (r) => TARGET_LABELS[r.targetType] },
    { key: "targetDocNumber", header: "Target Doc #", value: (r) => r.targetDocNumber ?? "Draft" },
    { key: "lineItemCount", header: "Line Items", align: "right", value: (r) => r.lineItemCount },
  ];

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Document Conversion History</h1>
      <ReportFilterBar dateFrom={sp.dateFrom} dateTo={sp.dateTo} fyStartMonth={fyStartMonth} />
      <ReportTable
        columns={columns}
        rows={rows}
        exportBaseHref="/api/reports/conversions/export"
        exportQuery={reportExportQuery(sp)}
        emptyMessage="No document conversions for this range."
      />
    </div>
  );
}
