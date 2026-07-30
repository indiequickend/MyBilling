import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { getSummaryReport, type SummaryReportRow } from "@/lib/db/queries/reports";
import { minorToRupeesString } from "@/lib/utils/money";
import { parseReportDateRange, reportExportQuery } from "@/lib/reports/searchParams";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable, type ReportTableColumn } from "@/components/reports/ReportTable";
import { LinkTabs } from "@/components/ui/LinkTabs";

const BUCKETS = ["day", "week", "month"] as const;
type Bucket = (typeof BUCKETS)[number];

export default async function SummaryReportPage({
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

  const bucket: Bucket = BUCKETS.includes(sp.bucket as Bucket) ? (sp.bucket as Bucket) : "day";
  const dateRange = parseReportDateRange(sp);
  const rows = await getSummaryReport(context.activeBusinessId, { ...dateRange, bucket });

  const columns: ReportTableColumn<SummaryReportRow>[] = [
    { key: "periodStart", header: "Period", value: (r) => new Date(r.periodStart).toLocaleDateString() },
    { key: "salesMinor", header: "Sales", align: "right", value: (r) => minorToRupeesString(r.salesMinor) },
    {
      key: "purchasesMinor",
      header: "Purchases",
      align: "right",
      value: (r) => minorToRupeesString(r.purchasesMinor),
    },
    {
      key: "expensesMinor",
      header: "Expenses",
      align: "right",
      value: (r) => minorToRupeesString(r.expensesMinor),
    },
    {
      key: "paymentsInMinor",
      header: "Payments In",
      align: "right",
      value: (r) => minorToRupeesString(r.paymentsInMinor),
    },
    {
      key: "paymentsOutMinor",
      header: "Payments Out",
      align: "right",
      value: (r) => minorToRupeesString(r.paymentsOutMinor),
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Summary Report</h1>
      <LinkTabs
        tabs={BUCKETS.map((b) => ({
          label: b === "day" ? "Daily" : b === "week" ? "Weekly" : "Monthly",
          href: b === "day" ? "/reports/summary" : `/reports/summary?bucket=${b}`,
          active: bucket === b,
        }))}
      />
      <div className="mt-4">
        <ReportFilterBar dateFrom={sp.dateFrom} dateTo={sp.dateTo} extraHiddenParams={{ bucket }} />
      </div>
      <ReportTable
        columns={columns}
        rows={rows}
        exportBaseHref="/api/reports/summary/export"
        exportQuery={reportExportQuery(sp, { bucket })}
        emptyMessage="No activity for this range."
      />
    </div>
  );
}
