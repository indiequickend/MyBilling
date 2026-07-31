import { redirect } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Plus } from "lucide-react";
import { getDashboardContext, getActiveBusinessFyStartMonth } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listPurchases, sumPurchaseTotals } from "@/lib/db/queries/purchases";
import { purchaseListQuerySchema } from "@/lib/validation/purchases";
import { DOCUMENT_STATUS_BADGE_VARIANT, DOCUMENT_STATUS_LABELS } from "@/lib/constants/documents";
import { minorToRupeesString } from "@/lib/utils/money";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
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
  { key: "pending", label: "Pending" },
  { key: "partially_paid", label: "Partially Paid" },
  { key: "paid", label: "Paid" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "purchases", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const fyStartMonth = getActiveBusinessFyStartMonth(context);

  const query = purchaseListQuerySchema.parse({
    q: sp.q,
    vendorId: sp.vendorId,
    tab: sp.tab,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    page: sp.page,
  });

  const listParams = {
    search: query.q,
    vendorId: query.vendorId,
    tab: query.tab,
    dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
    dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    page: query.page,
  };

  const [{ items, page, totalPages }, totals] = await Promise.all([
    listPurchases(context.activeBusinessId, listParams),
    sumPurchaseTotals(context.activeBusinessId, listParams),
  ]);

  const canCreate = can(context.membership, "purchases", "create");
  const canEdit = can(context.membership, "purchases", "edit");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Purchases</h1>
        {canCreate ? (
          <Button asChild>
            <Link href="/purchases/new">
              <Plus data-icon="inline-start" />
              New purchase
            </Link>
          </Button>
        ) : null}
      </div>

      <LinkTabs
        tabs={TABS.map((t) => ({
          label: t.label,
          href: t.key === "all" ? "/purchases" : `/purchases?tab=${t.key}`,
          active: query.tab === t.key,
        }))}
      />

      <div className="mb-4">
        <SearchInput
          defaultValue={query.q}
          placeholder="Search purchase #, reference, vendor…"
          hiddenParams={{ tab: query.tab }}
        >
          <DateRangeFilter dateFrom={query.dateFrom} dateTo={query.dateTo} fyStartMonth={fyStartMonth} />
        </SearchInput>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Purchase #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Paid</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={7} message="No purchases found." /> : null}
          {items.map((p) => {
            const id = String(p._id);
            return (
              <TableRow key={id} className="group">
                <TableCell>
                  <Link href={`/purchases/${id}`} className="font-medium hover:underline">
                    {p.docNumber ?? "Draft"}
                  </Link>
                </TableCell>
                <TableCell>{new Date(p.purchaseDate).toLocaleDateString()}</TableCell>
                <TableCell>{p.vendorSnapshot.displayName}</TableCell>
                <TableCell>
                  <Badge variant={DOCUMENT_STATUS_BADGE_VARIANT[p.status]}>
                    {DOCUMENT_STATUS_LABELS[p.status]}
                  </Badge>
                </TableCell>
                <TableCell>₹{minorToRupeesString(p.grandTotalMinor)}</TableCell>
                <TableCell>₹{minorToRupeesString(p.amountPaidMinor)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/purchases/${id}`}>View</Link>
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
                              <Link href={`/purchases/${id}/edit`}>Edit</Link>
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
        {items.length > 0 ? (
          <TableFooter>
            <TableRow className="hover:bg-muted/50">
              <TableCell colSpan={4}>Total</TableCell>
              <TableCell>₹{minorToRupeesString(totals.totalMinor)}</TableCell>
              <TableCell>₹{minorToRupeesString(totals.paidMinor)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>

      <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
        <span>Pending: ₹{minorToRupeesString(totals.pendingMinor)}</span>
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/purchases"
          searchParams={{ q: query.q, tab: query.tab }}
        />
      </div>
    </div>
  );
}
