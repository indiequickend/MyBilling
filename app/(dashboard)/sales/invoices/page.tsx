import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listInvoices, sumInvoiceTotals } from "@/lib/db/queries/invoices";
import { invoiceListQuerySchema } from "@/lib/validation/invoices";
import { INVOICE_STATUS_LABELS } from "@/lib/constants/invoices";
import { minorToRupeesString } from "@/lib/utils/money";
import { Table, Thead, Th, Tbody, Tr, Td, TableEmptyState } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";

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
    return <p className="text-sm text-red-700">You don&apos;t have permission to view this page.</p>;
  }

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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Invoices</h1>
        {canCreate ? (
          <Link
            href="/sales/invoices/new"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            + New invoice
          </Link>
        ) : null}
      </div>

      <Tabs
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
        />
      </div>

      <Table>
        <Thead>
          <Th>Invoice #</Th>
          <Th>Date</Th>
          <Th>Customer</Th>
          <Th>Status</Th>
          <Th>Total</Th>
          <Th>Paid</Th>
        </Thead>
        <Tbody>
          {items.length === 0 ? <TableEmptyState colSpan={6} message="No invoices found." /> : null}
          {items.map((inv) => (
            <Tr key={String(inv._id)}>
              <Td>
                <Link
                  href={`/sales/invoices/${String(inv._id)}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {inv.docNumber ?? "Draft"}
                </Link>
              </Td>
              <Td>{new Date(inv.invoiceDate).toLocaleDateString()}</Td>
              <Td>{inv.customerSnapshot.displayName}</Td>
              <Td>{INVOICE_STATUS_LABELS[inv.status]}</Td>
              <Td>₹{minorToRupeesString(inv.grandTotalMinor)}</Td>
              <Td>₹{minorToRupeesString(inv.amountPaidMinor)}</Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      <div className="mt-4 flex justify-end gap-6 text-sm text-slate-600">
        <span>Total: ₹{minorToRupeesString(totals.totalMinor)}</span>
        <span>Paid: ₹{minorToRupeesString(totals.paidMinor)}</span>
        <span>Pending: ₹{minorToRupeesString(totals.pendingMinor)}</span>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/sales/invoices"
        searchParams={{ q: query.q, tab: query.tab }}
      />
    </div>
  );
}
