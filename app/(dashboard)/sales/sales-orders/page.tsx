import { redirect } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Plus } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listSalesOrders } from "@/lib/db/queries/salesOrders";
import { salesOrderListQuerySchema } from "@/lib/validation/salesOrders";
import { minorToRupeesString } from "@/lib/utils/money";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { LinkTabs } from "@/components/ui/LinkTabs";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "cancelled", label: "Cancelled" },
] as const;

const STATUS_LABELS = { draft: "Draft", open: "Open", closed: "Closed", cancelled: "Cancelled" } as const;
const STATUS_BADGE_VARIANT = {
  draft: "outline",
  open: "warning",
  closed: "success",
  cancelled: "danger",
} as const;

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "sales_orders", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const query = salesOrderListQuerySchema.parse({
    q: sp.q,
    customerId: sp.customerId,
    tab: sp.tab,
    page: sp.page,
  });

  const { items, page, totalPages } = await listSalesOrders(context.activeBusinessId, {
    search: query.q,
    customerId: query.customerId,
    tab: query.tab,
    page: query.page,
  });

  const canCreate = can(context.membership, "sales_orders", "create");
  const canEdit = can(context.membership, "sales_orders", "edit");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Sales Orders</h1>
        {canCreate ? (
          <Button asChild>
            <Link href="/sales/sales-orders/new">
              <Plus data-icon="inline-start" />
              New sales order
            </Link>
          </Button>
        ) : null}
      </div>

      <LinkTabs
        tabs={TABS.map((t) => ({
          label: t.label,
          href: t.key === "all" ? "/sales/sales-orders" : `/sales/sales-orders?tab=${t.key}`,
          active: query.tab === t.key,
        }))}
      />

      <div className="mb-4">
        <SearchInput
          defaultValue={query.q}
          placeholder="Search order #, reference, customer…"
          hiddenParams={{ tab: query.tab }}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={6} message="No sales orders found." /> : null}
          {items.map((so) => {
            const id = String(so._id);
            return (
              <TableRow key={id} className="group">
                <TableCell>
                  <Link href={`/sales/sales-orders/${id}`} className="font-medium hover:underline">
                    {so.docNumber ?? "Draft"}
                  </Link>
                </TableCell>
                <TableCell>{new Date(so.orderDate).toLocaleDateString()}</TableCell>
                <TableCell>{so.customerSnapshot.displayName}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE_VARIANT[so.status]}>{STATUS_LABELS[so.status]}</Badge>
                </TableCell>
                <TableCell>₹{minorToRupeesString(so.grandTotalMinor)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/sales/sales-orders/${id}`}>View</Link>
                    </Button>
                    {canEdit ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="More actions">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem asChild>
                              <Link href={`/sales/sales-orders/${id}/edit`}>Edit</Link>
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="mt-2 flex items-center justify-end text-sm text-muted-foreground">
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/sales/sales-orders"
          searchParams={{ q: query.q, tab: query.tab }}
        />
      </div>
    </div>
  );
}
