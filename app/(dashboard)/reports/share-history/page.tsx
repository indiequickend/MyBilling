import { redirect } from "next/navigation";
import { getDashboardContext, getActiveBusinessFyStartMonth } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listShareHistory, type ShareHistoryEntry } from "@/lib/db/queries/shareHistory";
import { minorToRupeesString } from "@/lib/utils/money";
import { parseReportDateRange, reportExportQuery } from "@/lib/reports/searchParams";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable, type ReportTableColumn } from "@/components/reports/ReportTable";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<ShareHistoryEntry["status"], "default" | "secondary" | "destructive"> = {
  active: "default",
  expired: "secondary",
  revoked: "destructive",
};

export default async function ShareHistoryReportPage({
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
  const result = await listShareHistory(context.activeBusinessId, { ...dateRange, pageSize: 100 });

  const columns: ReportTableColumn<ShareHistoryEntry>[] = [
    { key: "createdAt", header: "Created On", value: (r) => new Date(r.createdAt).toLocaleString() },
    { key: "amountMinor", header: "Amount", align: "right", value: (r) => minorToRupeesString(r.amountMinor) },
    { key: "linkedInvoiceNumber", header: "Linked Invoice", value: (r) => r.linkedInvoiceNumber ?? "—" },
    { key: "note", header: "Note", value: (r) => r.note ?? "—" },
    { key: "expiresAt", header: "Expires", value: (r) => new Date(r.expiresAt).toLocaleString() },
    {
      key: "status",
      header: "Status",
      value: (r) => r.status,
      render: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>,
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Share History</h1>
      <p className="mb-4 text-sm text-muted-foreground">Payment Links created for this business.</p>
      <ReportFilterBar dateFrom={sp.dateFrom} dateTo={sp.dateTo} fyStartMonth={fyStartMonth} />
      <ReportTable
        columns={columns}
        rows={result.items}
        exportBaseHref="/api/reports/share-history/export"
        exportQuery={reportExportQuery(sp)}
        emptyMessage="No Payment Links created for this range."
      />
    </div>
  );
}
