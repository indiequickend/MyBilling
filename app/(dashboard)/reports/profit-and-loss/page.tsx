import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { getProfitAndLoss, buildProfitAndLossRows, type ProfitAndLossRow } from "@/lib/db/queries/reports";
import { minorToRupeesString } from "@/lib/utils/money";
import { parseReportDateRange, reportExportQuery } from "@/lib/reports/searchParams";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable, type ReportTableColumn } from "@/components/reports/ReportTable";

export default async function ProfitAndLossReportPage({
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
  const pl = await getProfitAndLoss(context.activeBusinessId, dateRange);
  const rows = buildProfitAndLossRows(pl);

  const columns: ReportTableColumn<ProfitAndLossRow>[] = [
    { key: "label", header: "Line", value: (r) => r.label },
    {
      key: "amountMinor",
      header: "Amount (₹)",
      align: "right",
      value: (r) => minorToRupeesString(r.amountMinor),
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Profit &amp; Loss</h1>
      <ReportFilterBar dateFrom={sp.dateFrom} dateTo={sp.dateTo} />
      <ReportTable
        columns={columns}
        rows={rows}
        exportBaseHref="/api/reports/profit-and-loss/export"
        exportQuery={reportExportQuery(sp)}
      />
    </div>
  );
}
