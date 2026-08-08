import { redirect } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Plus } from "lucide-react";
import { getDashboardContext, getActiveBusinessFyStartMonth } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listInvoices, sumInvoiceTotals } from "@/lib/db/queries/invoices";
import { invoiceListQuerySchema } from "@/lib/validation/invoices";
import { resolveInvoiceStatusDisplay } from "@/lib/constants/invoices";
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
import { StatusStamp } from "@/components/ui/StatusStamp";
import { Button } from "@/components/ui/button";
import { ButtonLabel } from "@/components/ui/ButtonLabel";
import { PageHeader } from "@/components/ui/PageHeader";
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

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "sales_invoices", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const fyStartMonth = getActiveBusinessFyStartMonth(context);

  const query = invoiceListQuerySchema.parse({
    q: sp.q,
    customerId: sp.customerId,
    tab: sp.tab,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    page: sp.page,
  });

  const listParams = {
    search: query.q,
    customerId: query.customerId,
    tab: query.tab,
    dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
    dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    page: query.page,
  };

  const [{ items, page, totalPages }, totals] = await Promise.all([
    listInvoices(context.activeBusinessId, listParams),
    sumInvoiceTotals(context.activeBusinessId, listParams),
  ]);

  const canCreate = can(context.membership, "sales_invoices", "create");
  const canEdit = can(context.membership, "sales_invoices", "edit");

  return (
    <div>
      <PageHeader
        title="Invoices"
        actions={
          canCreate ? (
            <Button asChild aria-label="New invoice">
              <Link href="/sales/invoices/new">
                <Plus data-icon="inline-start" />
                <ButtonLabel>New invoice</ButtonLabel>
              </Link>
            </Button>
          ) : null
        }
      />

      <LinkTabs
        tabs={TABS.map((t) => ({
          label: t.label,
          href: t.key === "all" ? "/sales/invoices" : `/sales/invoices?tab=${t.key}`,
          active: query.tab === t.key,
        }))}
      />

      <div className="mb-4">
        <SearchInput
          defaultValue={query.q}
          placeholder="Search invoice #, reference, customer…"
          hiddenParams={{ tab: query.tab }}
        >
          <DateRangeFilter dateFrom={query.dateFrom} dateTo={query.dateTo} fyStartMonth={fyStartMonth} />
        </SearchInput>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Paid</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={7} message="No invoices found." /> : null}
          {items.map((inv) => {
            const id = String(inv._id);
            const statusDisplay = resolveInvoiceStatusDisplay(inv.status, inv.dueDate);
            return (
              <TableRow key={id} className="group">
                <TableCell>
                  <Link href={`/sales/invoices/${id}`} className="font-medium hover:underline">
                    {inv.docNumber ?? "Draft"}
                  </Link>
                </TableCell>
                <TableCell>{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
                <TableCell>{inv.customerSnapshot.displayName}</TableCell>
                <TableCell>
                  <StatusStamp variant={statusDisplay.variant} seed={id}>
                    {statusDisplay.label}
                  </StatusStamp>
                </TableCell>
                <TableCell className="font-tabular tabular-nums">₹{minorToRupeesString(inv.grandTotalMinor)}</TableCell>
                <TableCell className="font-tabular tabular-nums">₹{minorToRupeesString(inv.amountPaidMinor)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/sales/invoices/${id}`}>View</Link>
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
                              <Link href={`/sales/invoices/${id}/edit`}>Edit</Link>
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
              <TableCell className="font-tabular tabular-nums">₹{minorToRupeesString(totals.totalMinor)}</TableCell>
              <TableCell className="font-tabular tabular-nums">₹{minorToRupeesString(totals.paidMinor)}</TableCell>
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
          basePath="/sales/invoices"
          searchParams={{ q: query.q, tab: query.tab }}
        />
      </div>
    </div>
  );
}
