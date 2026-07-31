import { redirect } from "next/navigation";
import { getDashboardContext, getActiveBusinessFyStartMonth } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import {
  getProjectProfitAndLoss,
  buildProjectProfitAndLossRows,
  type ProjectProfitAndLossRow,
} from "@/lib/db/queries/projects";
import { minorToRupeesString } from "@/lib/utils/money";
import { parseReportDateRange, reportExportQuery } from "@/lib/reports/searchParams";
import { ProjectDetailTabs } from "@/components/dashboard/ProjectDetailTabs";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable, type ReportTableColumn } from "@/components/reports/ReportTable";

export default async function ProjectProfitAndLossPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  if (!can(context.membership, "projects", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const fyStartMonth = getActiveBusinessFyStartMonth(context);
  const dateRange = parseReportDateRange(sp);
  const pl = await getProjectProfitAndLoss(context.activeBusinessId, id, dateRange);
  const rows = buildProjectProfitAndLossRows(pl);

  const columns: ReportTableColumn<ProjectProfitAndLossRow>[] = [
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
      <ProjectDetailTabs basePath={`/projects/${id}`} active="profit-and-loss" />
      <ReportFilterBar dateFrom={sp.dateFrom} dateTo={sp.dateTo} fyStartMonth={fyStartMonth} />
      <ReportTable
        columns={columns}
        rows={rows}
        exportBaseHref={`/api/projects/${id}/profit-and-loss/export`}
        exportQuery={reportExportQuery(sp)}
      />
    </div>
  );
}
