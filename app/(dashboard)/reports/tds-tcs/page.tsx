import { redirect } from "next/navigation";
import { getDashboardContext, getActiveBusinessFyStartMonth } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { getTdsTcsReport, type TdsTcsRow } from "@/lib/db/queries/reports";
import { minorToRupeesString } from "@/lib/utils/money";
import { parseReportDateRange, reportExportQuery } from "@/lib/reports/searchParams";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable, type ReportTableColumn } from "@/components/reports/ReportTable";

const DOC_TYPE_LABELS: Record<TdsTcsRow["documentType"], string> = {
  invoice: "Invoice",
  purchase: "Purchase",
  expense: "Expense",
};
const KIND_LABELS: Record<TdsTcsRow["kind"], string> = {
  tcs_on_sales: "TCS Receivable (on sales)",
  tds_deducted: "TDS Payable (deducted)",
  tcs_paid: "TCS Payable (paid to vendor)",
};

export default async function TdsTcsReportPage({
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
  const rows = await getTdsTcsReport(context.activeBusinessId, dateRange);

  const columns: ReportTableColumn<TdsTcsRow>[] = [
    { key: "date", header: "Date", value: (r) => new Date(r.date).toLocaleDateString() },
    { key: "kind", header: "Kind", value: (r) => KIND_LABELS[r.kind] },
    { key: "documentType", header: "Doc Type", value: (r) => DOC_TYPE_LABELS[r.documentType] },
    { key: "docNumber", header: "Doc #", value: (r) => r.docNumber ?? "—" },
    { key: "partyName", header: "Party", value: (r) => r.partyName ?? "—" },
    { key: "sectionCode", header: "Section", value: (r) => r.sectionCode ?? "—" },
    { key: "ratePercent", header: "Rate %", align: "right", value: (r) => r.ratePercent ?? "—" },
    {
      key: "amountMinor",
      header: "Amount",
      align: "right",
      value: (r) => minorToRupeesString(r.amountMinor),
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">TDS/TCS Report</h1>
      <ReportFilterBar dateFrom={sp.dateFrom} dateTo={sp.dateTo} fyStartMonth={fyStartMonth} />
      <ReportTable
        columns={columns}
        rows={rows}
        exportBaseHref="/api/reports/tds-tcs/export"
        exportQuery={reportExportQuery(sp)}
        emptyMessage="No TDS/TCS recorded for this range."
      />
    </div>
  );
}
