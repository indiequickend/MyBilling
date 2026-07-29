import { redirect } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Plus } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listPurchaseOrders } from "@/lib/db/queries/purchaseOrders";
import { purchaseOrderListQuerySchema } from "@/lib/validation/purchaseOrders";
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

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "purchase_orders", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const query = purchaseOrderListQuerySchema.parse({
    q: sp.q,
    vendorId: sp.vendorId,
    tab: sp.tab,
    page: sp.page,
  });

  const { items, page, totalPages } = await listPurchaseOrders(context.activeBusinessId, {
    search: query.q,
    vendorId: query.vendorId,
    tab: query.tab,
    page: query.page,
  });

  const canCreate = can(context.membership, "purchase_orders", "create");
  const canEdit = can(context.membership, "purchase_orders", "edit");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Purchase Orders</h1>
        {canCreate ? (
          <Button asChild>
            <Link href="/purchases/orders/new">
              <Plus data-icon="inline-start" />
              New purchase order
            </Link>
          </Button>
        ) : null}
      </div>

      <LinkTabs
        tabs={TABS.map((t) => ({
          label: t.label,
          href: t.key === "all" ? "/purchases/orders" : `/purchases/orders?tab=${t.key}`,
          active: query.tab === t.key,
        }))}
      />

      <div className="mb-4">
        <SearchInput
          defaultValue={query.q}
          placeholder="Search order #, reference, vendor…"
          hiddenParams={{ tab: query.tab }}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={6} message="No purchase orders found." /> : null}
          {items.map((po) => {
            const id = String(po._id);
            return (
              <TableRow key={id} className="group">
                <TableCell>
                  <Link href={`/purchases/orders/${id}`} className="font-medium hover:underline">
                    {po.docNumber ?? "Draft"}
                  </Link>
                </TableCell>
                <TableCell>{new Date(po.orderDate).toLocaleDateString()}</TableCell>
                <TableCell>{po.vendorSnapshot.displayName}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE_VARIANT[po.status]}>{STATUS_LABELS[po.status]}</Badge>
                </TableCell>
                <TableCell>₹{minorToRupeesString(po.grandTotalMinor)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/purchases/orders/${id}`}>View</Link>
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
                              <Link href={`/purchases/orders/${id}/edit`}>Edit</Link>
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
          basePath="/purchases/orders"
          searchParams={{ q: query.q, tab: query.tab }}
        />
      </div>
    </div>
  );
}
