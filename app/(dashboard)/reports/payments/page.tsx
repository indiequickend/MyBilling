import { redirect } from "next/navigation";
import { getDashboardContext, getActiveBusinessFyStartMonth } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { getPaymentsReport } from "@/lib/db/queries/payments";
import type { PaymentTimelineEntry } from "@/lib/db/queries/payments";
import { PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import { minorToRupeesString } from "@/lib/utils/money";
import { parseReportDateRange, reportExportQuery } from "@/lib/reports/searchParams";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable, type ReportTableColumn } from "@/components/reports/ReportTable";

export default async function PaymentsReportPage({
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
  const rows = await getPaymentsReport(context.activeBusinessId, dateRange);

  const columns: ReportTableColumn<PaymentTimelineEntry>[] = [
    { key: "paymentDate", header: "Date", value: (r) => new Date(r.paymentDate).toLocaleDateString() },
    { key: "direction", header: "Direction", value: (r) => (r.direction === "in" ? "Received" : "Given") },
    { key: "partyName", header: "Party", value: (r) => r.partyName ?? "—" },
    { key: "bankAccountName", header: "Account", value: (r) => r.bankAccountName },
    { key: "mode", header: "Mode", value: (r) => PAYMENT_MODE_LABELS[r.mode] },
    { key: "linkedDocumentNumber", header: "Linked Doc", value: (r) => r.linkedDocumentNumber ?? "—" },
    {
      key: "amountMinor",
      header: "Amount",
      align: "right",
      value: (r) => minorToRupeesString(r.amountMinor),
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Payments Report</h1>
      <ReportFilterBar dateFrom={sp.dateFrom} dateTo={sp.dateTo} fyStartMonth={fyStartMonth} />
      <ReportTable
        columns={columns}
        rows={rows}
        exportBaseHref="/api/reports/payments/export"
        exportQuery={reportExportQuery(sp)}
        emptyMessage="No payments for this range."
      />
    </div>
  );
}
