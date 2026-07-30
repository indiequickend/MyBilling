import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { getItemSalesReport, getItemPurchaseReport, type ItemReportRow } from "@/lib/db/queries/itemReports";
import { minorToRupeesString } from "@/lib/utils/money";
import { parseReportDateRange, reportExportQuery } from "@/lib/reports/searchParams";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { ReportTable, type ReportTableColumn } from "@/components/reports/ReportTable";
import { LinkTabs } from "@/components/ui/LinkTabs";

export default async function ItemReportPage({
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

  const docType = sp.docType === "purchase" ? "purchase" : "sales";
  const dateRange = parseReportDateRange(sp);
  const rows = await (docType === "purchase" ? getItemPurchaseReport : getItemSalesReport)(
    context.activeBusinessId,
    dateRange,
  );

  const columns: ReportTableColumn<ItemReportRow>[] = [
    { key: "description", header: "Item", value: (r) => r.description },
    { key: "hsnOrSac", header: "HSN/SAC", value: (r) => r.hsnOrSac ?? "—" },
    { key: "quantity", header: "Qty", align: "right", value: (r) => r.quantity },
    {
      key: "taxableAmountMinor",
      header: "Taxable",
      align: "right",
      value: (r) => minorToRupeesString(r.taxableAmountMinor),
    },
    { key: "taxMinor", header: "Tax", align: "right", value: (r) => minorToRupeesString(r.taxMinor) },
    { key: "totalMinor", header: "Total", align: "right", value: (r) => minorToRupeesString(r.totalMinor) },
  ];

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Item Report</h1>
      <LinkTabs
        tabs={[
          { label: "Sold", href: "/reports/items", active: docType === "sales" },
          { label: "Purchased", href: "/reports/items?docType=purchase", active: docType === "purchase" },
        ]}
      />
      <div className="mt-4">
        <ReportFilterBar dateFrom={sp.dateFrom} dateTo={sp.dateTo} extraHiddenParams={{ docType }} />
      </div>
      <ReportTable
        columns={columns}
        rows={rows}
        exportBaseHref="/api/reports/items/export"
        exportQuery={reportExportQuery(sp, { docType })}
        emptyMessage="No items for this range."
      />
    </div>
  );
}
