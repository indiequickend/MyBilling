import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownCircle, ArrowUpCircle, FileText, Package, Users, Wallet } from "lucide-react";
import { getDashboardContext, getActiveBusinessFyStartMonth } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listInvoices, sumInvoiceTotals } from "@/lib/db/queries/invoices";
import { listCustomers } from "@/lib/db/queries/customers";
import { sumPaymentsTimeline, getPaymentsByBankAccount } from "@/lib/db/queries/payments";
import { getItemSalesReport } from "@/lib/db/queries/itemReports";
import { getProfitAndLoss, getSalesTrend } from "@/lib/db/queries/reports";
import { minorToRupeesString } from "@/lib/utils/money";
import { parseReportDateRange, reportExportQuery } from "@/lib/reports/searchParams";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SalesTrendChart, WeeklyRevenueChart, PaymentsByBankChart } from "@/components/insights/InsightsCharts";
import { INVOICE_STATUS_BADGE_VARIANT, INVOICE_STATUS_LABELS } from "@/lib/constants/invoices";

function StatTile({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
}) {
  const content = (
    <Card className={href ? "h-full transition-colors hover:bg-muted/50" : "h-full"}>
      <CardContent className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  const businessId = context.activeBusinessId;
  const membership = context.membership;
  const fyStartMonth = getActiveBusinessFyStartMonth(context);
  const dateRange = parseReportDateRange(sp);

  const canViewInvoices = can(membership, "sales_invoices", "view");
  const canViewCustomers = can(membership, "customers", "view");
  const canViewPayments = can(membership, "payments", "view");
  const canViewReports = can(membership, "reports", "view");

  const [
    invoiceCount,
    invoiceTotals,
    customerCount,
    cashTotals,
    itemsSold,
    pendingInvoices,
    salesTrend,
    weeklyRevenue,
    paymentsByBank,
    profitAndLoss,
  ] = await Promise.all([
    canViewInvoices ? listInvoices(businessId, { ...dateRange, pageSize: 1 }) : null,
    canViewInvoices ? sumInvoiceTotals(businessId, dateRange) : null,
    canViewCustomers ? listCustomers(businessId, { pageSize: 1 }) : null,
    canViewPayments ? sumPaymentsTimeline(businessId, dateRange) : null,
    canViewInvoices ? getItemSalesReport(businessId, dateRange) : null,
    canViewInvoices
      ? listInvoices(businessId, { ...dateRange, tab: "pending", pageSize: 5, page: 1 })
      : null,
    canViewInvoices ? getSalesTrend(businessId, { ...dateRange, bucket: "day" }) : null,
    canViewInvoices ? getSalesTrend(businessId, { ...dateRange, bucket: "week" }) : null,
    canViewPayments ? getPaymentsByBankAccount(businessId, dateRange) : null,
    canViewReports ? getProfitAndLoss(businessId, dateRange) : null,
  ]);

  const productsSoldQty = itemsSold ? itemsSold.reduce((sum, r) => sum + r.quantity, 0) : 0;

  const tiles = [
    canViewPayments && cashTotals
      ? { label: "Cash In", value: `₹${minorToRupeesString(cashTotals.receivedMinor)}`, icon: ArrowDownCircle }
      : null,
    canViewPayments && cashTotals
      ? { label: "Cash Out", value: `₹${minorToRupeesString(cashTotals.givenMinor)}`, icon: ArrowUpCircle }
      : null,
    canViewInvoices && itemsSold
      ? { label: "Products Sold", value: String(productsSoldQty), icon: Package }
      : null,
    canViewCustomers && customerCount
      ? { label: "Customers", value: String(customerCount.total), icon: Users, href: "/customers" }
      : null,
    canViewInvoices && invoiceTotals
      ? {
          label: "Pending Invoices",
          value: `₹${minorToRupeesString(invoiceTotals.pendingMinor)}`,
          icon: Wallet,
          href: "/sales/invoices?tab=pending",
        }
      : null,
    canViewInvoices && invoiceCount
      ? { label: "Invoices Created", value: String(invoiceCount.total), icon: FileText, href: "/sales/invoices" }
      : null,
  ].filter((t): t is NonNullable<typeof t> => t !== null);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Insights</h1>
        <ReportFilterBar dateFrom={sp.dateFrom} dateTo={sp.dateTo} fyStartMonth={fyStartMonth} />
      </div>

      {tiles.length > 0 ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => (
            <StatTile key={tile.label} {...tile} />
          ))}
        </div>
      ) : null}

      {canViewReports && profitAndLoss ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Total Sales" value={`₹${minorToRupeesString(profitAndLoss.salesMinor)}`} icon={FileText} />
          <StatTile
            label="Total Purchases"
            value={`₹${minorToRupeesString(profitAndLoss.purchasesMinor)}`}
            icon={FileText}
          />
          <StatTile
            label="Total Expenses"
            value={`₹${minorToRupeesString(profitAndLoss.expensesMinor)}`}
            icon={FileText}
          />
          <StatTile
            label="Total Indirect Income"
            value={`₹${minorToRupeesString(profitAndLoss.indirectIncomeMinor)}`}
            icon={FileText}
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {canViewInvoices && salesTrend ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sales Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <SalesTrendChart
                data={salesTrend.map((p) => ({ periodStart: p.periodStart.toISOString(), totalMinor: p.totalMinor }))}
              />
            </CardContent>
          </Card>
        ) : null}

        {canViewInvoices && weeklyRevenue ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Weekly Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <WeeklyRevenueChart
                data={weeklyRevenue.map((p) => ({
                  periodStart: p.periodStart.toISOString(),
                  totalMinor: p.totalMinor,
                }))}
              />
            </CardContent>
          </Card>
        ) : null}

        {canViewPayments && paymentsByBank ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payments by Bank</CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentsByBankChart data={paymentsByBank} />
            </CardContent>
          </Card>
        ) : null}

        {canViewInvoices && pendingInvoices ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pending Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingInvoices.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending invoices for this range.</p>
              ) : (
                <ul className="divide-y">
                  {pendingInvoices.items.map((inv) => (
                    <li key={String(inv._id)} className="flex items-center justify-between py-2">
                      <div>
                        <Link href={`/sales/invoices/${String(inv._id)}`} className="text-sm font-medium hover:underline">
                          {inv.docNumber ?? "Draft"}
                        </Link>
                        <p className="text-xs text-muted-foreground">{inv.customerSnapshot.displayName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={INVOICE_STATUS_BADGE_VARIANT[inv.status]}>
                          {INVOICE_STATUS_LABELS[inv.status]}
                        </Badge>
                        <span className="text-sm">₹{minorToRupeesString(inv.grandTotalMinor)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href={`/sales/invoices?tab=pending&${reportExportQuery(sp)}`}
                className="mt-3 inline-block text-sm text-primary hover:underline"
              >
                View all pending invoices →
              </Link>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {tiles.length === 0 && !profitAndLoss ? (
        <p className="text-sm text-muted-foreground">
          Nothing to show yet — you don&apos;t have view access to any module with data.
        </p>
      ) : null}
    </div>
  );
}
