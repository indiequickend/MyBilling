import Link from "next/link";
import { Building2, FileText, Users, Wallet, PackageCheck, PackageX, IndianRupee } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { listInvoices, sumInvoiceTotals } from "@/lib/db/queries/invoices";
import { listCustomers } from "@/lib/db/queries/customers";
import { listVendors } from "@/lib/db/queries/vendors";
import { getInventoryDashboardTiles } from "@/lib/db/queries/stockLedger";
import { minorToRupeesString } from "@/lib/utils/money";
import { can } from "@/lib/rbac/can";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default async function DashboardHomePage() {
  const context = await getDashboardContext();

  if (!context || context.businesses.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2 />
          </EmptyMedia>
          <EmptyTitle>Welcome to MyBilling</EmptyTitle>
          <EmptyDescription>
            You don&apos;t belong to any business yet. Create one to get started.
          </EmptyDescription>
        </EmptyHeader>
        <Button asChild>
          <Link href="/businesses/new">Create a business</Link>
        </Button>
      </Empty>
    );
  }

  if (!context.activeBusinessId || !context.membership) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2 />
          </EmptyMedia>
          <EmptyTitle>No active business</EmptyTitle>
          <EmptyDescription>Select a business from the switcher above to continue.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const canViewInvoices = can(context.membership, "sales_invoices", "view");
  const canViewCustomers = can(context.membership, "customers", "view");
  const canViewVendors = can(context.membership, "vendors", "view");
  const canViewInventory = can(context.membership, "inventory", "view");

  const [invoiceCount, invoiceTotals, customerCount, vendorCount, inventoryTiles] = await Promise.all([
    canViewInvoices ? listInvoices(context.activeBusinessId, { pageSize: 1 }) : null,
    canViewInvoices ? sumInvoiceTotals(context.activeBusinessId, {}) : null,
    canViewCustomers ? listCustomers(context.activeBusinessId, { pageSize: 1 }) : null,
    canViewVendors ? listVendors(context.activeBusinessId, { pageSize: 1 }) : null,
    canViewInventory ? getInventoryDashboardTiles(context.activeBusinessId) : null,
  ]);

  const tiles = [
    canViewInvoices && invoiceCount
      ? { label: "Invoices", value: String(invoiceCount.total), icon: FileText, href: "/sales/invoices" }
      : null,
    canViewInvoices && invoiceTotals
      ? {
          label: "Outstanding",
          value: `₹${minorToRupeesString(invoiceTotals.pendingMinor)}`,
          icon: Wallet,
          href: "/sales/invoices",
        }
      : null,
    canViewCustomers && customerCount
      ? { label: "Customers", value: String(customerCount.total), icon: Users, href: "/customers" }
      : null,
    canViewVendors && vendorCount
      ? { label: "Vendors", value: String(vendorCount.total), icon: Building2, href: "/vendors" }
      : null,
    canViewInventory && inventoryTiles
      ? {
          label: "Low Stock",
          value: String(inventoryTiles.lowStockCount),
          icon: PackageX,
          href: "/inventory/timeline",
        }
      : null,
    canViewInventory && inventoryTiles
      ? {
          label: "Positive Stock",
          value: String(inventoryTiles.positiveStockCount),
          icon: PackageCheck,
          href: "/inventory/timeline",
        }
      : null,
    canViewInventory && inventoryTiles
      ? {
          label: "Stock Value (Sale)",
          value: `₹${minorToRupeesString(inventoryTiles.stockValueAtSaleMinor)}`,
          icon: IndianRupee,
          href: "/inventory/timeline",
        }
      : null,
    canViewInventory && inventoryTiles
      ? {
          label: "Stock Value (Purchase)",
          value: `₹${minorToRupeesString(inventoryTiles.stockValueAtPurchaseMinor)}`,
          icon: IndianRupee,
          href: "/inventory/timeline",
        }
      : null,
  ].filter((t): t is NonNullable<typeof t> => t !== null);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Signed in as {context.user.name}.</p>
      </div>

      {tiles.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((tile) => (
            <Link key={tile.label} href={tile.href}>
              <Card>
                <CardContent className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <tile.icon className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{tile.label}</p>
                    <p className="text-lg font-semibold">{tile.value}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing to show yet — you don&apos;t have view access to any module with data.
        </p>
      )}

      {/* TODO(reports-phase): full chart + stat-card row once Reports ships */}
    </div>
  );
}
