import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { getTransactionReport, type TransactionReportRow } from "@/lib/db/queries/reports";
import { minorToRupeesString } from "@/lib/utils/money";
import { parseReportDateRange, reportExportQuery } from "@/lib/reports/searchParams";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable, type ReportTableColumn } from "@/components/reports/ReportTable";

const DOC_TYPE_LABELS: Record<TransactionReportRow["documentType"], string> = {
  invoice: "Invoice",
  purchase: "Purchase",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
};

export default async function TransactionReportPage({
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
  const rows = await getTransactionReport(context.activeBusinessId, dateRange);

  const columns: ReportTableColumn<TransactionReportRow>[] = [
    { key: "date", header: "Date", value: (r) => new Date(r.date).toLocaleDateString() },
    { key: "documentType", header: "Type", value: (r) => DOC_TYPE_LABELS[r.documentType] },
    { key: "docNumber", header: "Doc #", value: (r) => r.docNumber ?? "Draft" },
    { key: "partyName", header: "Party", value: (r) => r.partyName },
    { key: "status", header: "Status", value: (r) => r.status },
    {
      key: "taxableAmountMinor",
      header: "Taxable",
      align: "right",
      value: (r) => minorToRupeesString(r.taxableAmountMinor),
    },
    { key: "taxMinor", header: "Tax", align: "right", value: (r) => minorToRupeesString(r.taxMinor) },
    {
      key: "grandTotalMinor",
      header: "Total",
      align: "right",
      value: (r) => minorToRupeesString(r.grandTotalMinor),
    },
    {
      key: "amountPaidMinor",
      header: "Paid",
      align: "right",
      value: (r) => minorToRupeesString(r.amountPaidMinor),
    },
    {
      key: "balanceMinor",
      header: "Balance",
      align: "right",
      value: (r) => minorToRupeesString(r.balanceMinor),
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Transaction Report</h1>
      <ReportFilterBar dateFrom={sp.dateFrom} dateTo={sp.dateTo} />
      <ReportTable
        columns={columns}
        rows={rows}
        exportBaseHref="/api/reports/transactions/export"
        exportQuery={reportExportQuery(sp)}
        emptyMessage="No transactions for this range."
      />
    </div>
  );
}
