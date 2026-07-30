import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { getHsnSummary, type HsnSummaryRow } from "@/lib/db/queries/reports";
import { minorToRupeesString } from "@/lib/utils/money";
import { parseReportDateRange, reportExportQuery } from "@/lib/reports/searchParams";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable, type ReportTableColumn } from "@/components/reports/ReportTable";

export default async function HsnSummaryReportPage({
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

  const dateRange = parseReportDateRange(sp);
  const rows = await getHsnSummary(context.activeBusinessId, dateRange);

  const columns: ReportTableColumn<HsnSummaryRow>[] = [
    { key: "hsnOrSac", header: "HSN/SAC", value: (r) => r.hsnOrSac },
    {
      key: "taxableAmountMinor",
      header: "Taxable Amount",
      align: "right",
      value: (r) => minorToRupeesString(r.taxableAmountMinor),
    },
    { key: "cgstMinor", header: "CGST", align: "right", value: (r) => minorToRupeesString(r.cgstMinor) },
    { key: "sgstMinor", header: "SGST", align: "right", value: (r) => minorToRupeesString(r.sgstMinor) },
    { key: "igstMinor", header: "IGST", align: "right", value: (r) => minorToRupeesString(r.igstMinor) },
    { key: "totalMinor", header: "Total", align: "right", value: (r) => minorToRupeesString(r.totalMinor) },
  ];

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Sale Summary by HSN</h1>
      <ReportFilterBar dateFrom={sp.dateFrom} dateTo={sp.dateTo} />
      <ReportTable
        columns={columns}
        rows={rows}
        exportBaseHref="/api/reports/hsn-summary/export"
        exportQuery={reportExportQuery(sp)}
        emptyMessage="No sales for this range."
      />
    </div>
  );
}
