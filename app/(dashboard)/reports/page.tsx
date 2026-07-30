import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const REPORTS = [
  { href: "/reports/transactions", label: "Transaction Report", description: "Every finalized sale/purchase document, merged and sorted by date." },
  { href: "/reports/bill-wise-items", label: "Bill-wise Item Report", description: "Per-document, per-line item breakdown." },
  { href: "/reports/items", label: "Item Report", description: "Quantity, taxable amount, and tax sold or purchased per item." },
  { href: "/reports/parties", label: "Party Report", description: "Total invoiced/purchased, paid, and balance per customer or vendor." },
  { href: "/reports/profit-and-loss", label: "Profit & Loss Report", description: "Net Sales minus Net Purchases minus Expenses plus Indirect Income." },
  { href: "/reports/payments", label: "Payments Report", description: "Every recorded payment across every bank/cash/personal account." },
  { href: "/reports/summary", label: "Summary Report", description: "Sales, purchases, expenses, and payments bucketed by period." },
  { href: "/reports/day-book", label: "Day Book", description: "Every transaction of every type on a single day." },
  { href: "/reports/conversions", label: "Document Conversion History", description: "Quotation → Invoice/Sales Order and Purchase Order → Purchase conversions." },
  { href: "/reports/share-history", label: "Share History", description: "Payment Links created, and their current status." },
  { href: "/reports/hsn-summary", label: "Sale Summary by HSN", description: "Taxable value and tax collected, grouped by HSN/SAC code." },
  { href: "/reports/tds-tcs", label: "TDS/TCS Report", description: "TCS collected on sales, and TDS/TCS on purchases and expenses." },
] as const;

export default async function ReportsHubPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "reports", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">Date-ranged cross-cuts of your sales, purchase, and payment data.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base">{r.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{r.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
