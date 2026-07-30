import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { getBillWiseItemReport, type BillWiseItemRow } from "@/lib/db/queries/billWiseItemReport";
import { minorToRupeesString } from "@/lib/utils/money";
import { parseReportDateRange, reportExportQuery } from "@/lib/reports/searchParams";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable, type ReportTableColumn } from "@/components/reports/ReportTable";
import { LinkTabs } from "@/components/ui/LinkTabs";

export default async function BillWiseItemReportPage({
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

  const docType = sp.docType === "purchase" ? "purchase" : "invoice";
  const dateRange = parseReportDateRange(sp);
  const rows = await getBillWiseItemReport(context.activeBusinessId, docType, dateRange);

  const columns: ReportTableColumn<BillWiseItemRow>[] = [
    { key: "date", header: "Date", value: (r) => new Date(r.date).toLocaleDateString() },
    { key: "docNumber", header: "Doc #", value: (r) => r.docNumber ?? "Draft" },
    { key: "partyName", header: "Party", value: (r) => r.partyName },
    { key: "description", header: "Item", value: (r) => r.description },
    { key: "hsnOrSac", header: "HSN/SAC", value: (r) => r.hsnOrSac ?? "—" },
    { key: "quantity", header: "Qty", align: "right", value: (r) => r.quantity },
    {
      key: "unitPriceMinor",
      header: "Unit Price",
      align: "right",
      value: (r) => minorToRupeesString(r.unitPriceMinor),
    },
    { key: "totalMinor", header: "Total", align: "right", value: (r) => minorToRupeesString(r.totalMinor) },
  ];

  const exportQuery = reportExportQuery(sp, { docType });

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Bill-wise Item Report</h1>
      <LinkTabs
        tabs={[
          { label: "Sales", href: "/reports/bill-wise-items", active: docType === "invoice" },
          { label: "Purchases", href: "/reports/bill-wise-items?docType=purchase", active: docType === "purchase" },
        ]}
      />
      <div className="mt-4">
        <ReportFilterBar dateFrom={sp.dateFrom} dateTo={sp.dateTo} extraHiddenParams={{ docType }} />
      </div>
      <ReportTable
        columns={columns}
        rows={rows}
        exportBaseHref="/api/reports/bill-wise-items/export"
        exportQuery={exportQuery}
        emptyMessage="No line items for this range."
      />
    </div>
  );
}
