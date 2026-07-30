import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { getPartyReport, type PartyReportRow } from "@/lib/db/queries/reports";
import { minorToRupeesString } from "@/lib/utils/money";
import { parseReportDateRange, reportExportQuery } from "@/lib/reports/searchParams";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable, type ReportTableColumn } from "@/components/reports/ReportTable";
import { LinkTabs } from "@/components/ui/LinkTabs";

export default async function PartyReportPage({
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

  const partyType = sp.partyType === "vendor" ? "vendor" : "customer";
  const dateRange = parseReportDateRange(sp);
  const rows = await getPartyReport(context.activeBusinessId, partyType, dateRange);

  const columns: ReportTableColumn<PartyReportRow>[] = [
    { key: "displayName", header: "Party", value: (r) => r.displayName },
    { key: "gstin", header: "GSTIN", value: (r) => r.gstin ?? "—" },
    {
      key: "totalDocumentedMinor",
      header: partyType === "customer" ? "Total Invoiced" : "Total Purchased",
      align: "right",
      value: (r) => minorToRupeesString(r.totalDocumentedMinor),
    },
    {
      key: "totalPaidMinor",
      header: "Total Paid",
      align: "right",
      value: (r) => minorToRupeesString(r.totalPaidMinor),
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
      <h1 className="mb-6 text-lg font-semibold">Party Report</h1>
      <LinkTabs
        tabs={[
          { label: "Customers", href: "/reports/parties", active: partyType === "customer" },
          { label: "Vendors", href: "/reports/parties?partyType=vendor", active: partyType === "vendor" },
        ]}
      />
      <div className="mt-4">
        <ReportFilterBar dateFrom={sp.dateFrom} dateTo={sp.dateTo} extraHiddenParams={{ partyType }} />
      </div>
      <ReportTable
        columns={columns}
        rows={rows}
        exportBaseHref="/api/reports/parties/export"
        exportQuery={reportExportQuery(sp, { partyType })}
        emptyMessage="No party activity for this range."
      />
    </div>
  );
}
