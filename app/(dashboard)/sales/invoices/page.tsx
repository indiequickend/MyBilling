import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { getDashboardContext, getActiveBusinessFyStartMonth } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listInvoices, sumInvoiceTotals } from "@/lib/db/queries/invoices";
import { invoiceListQuerySchema } from "@/lib/validation/invoices";
import { resolveInvoiceStatusDisplay } from "@/lib/constants/invoices";
import { minorToRupeesString } from "@/lib/utils/money";
import { LinkTabs } from "@/components/ui/LinkTabs";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { StatusStamp } from "@/components/ui/StatusStamp";
import { Button } from "@/components/ui/button";
import { ButtonLabel } from "@/components/ui/ButtonLabel";
import { PageHeader } from "@/components/ui/PageHeader";
import { DocumentListTable } from "@/components/documents/DocumentListTable";
import {
  buildRowCells,
  getListColumns,
  getSearchOptions,
  parseSearchFieldIds,
  resolveSearchPaths,
} from "@/lib/documents/listColumns";
import { findBusinessById } from "@/lib/db/queries/businesses";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";

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

  const business = await findBusinessById(context.activeBusinessId);
  const customFieldDefs = business?.documentCustomFieldDefs?.invoice ?? [];
  const columns = getListColumns("invoice", customFieldDefs);
  const searchFieldIds = parseSearchFieldIds(sp.qf);

  const listParams = {
    searchPaths: resolveSearchPaths(columns, searchFieldIds),
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
            <>
              <Button variant="outline" asChild className="hidden lg:inline-flex" aria-label="Bulk upload">
                <Link href="/sales/invoices/bulk-upload">
                  <Upload data-icon="inline-start" />
                  <ButtonLabel>Bulk upload</ButtonLabel>
                </Link>
              </Button>
              <Button asChild aria-label="New invoice">
                <Link href="/sales/invoices/new">
                  <Plus data-icon="inline-start" />
                  <ButtonLabel>New invoice</ButtonLabel>
                </Link>
              </Button>
            </>
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
          searchFields={{
            options: getSearchOptions(columns),
            urlSelected: searchFieldIds,
            storageKey: `mybilling:listSearch:${context.activeBusinessId}:invoice`,
          }}
        >
          <DateRangeFilter dateFrom={query.dateFrom} dateTo={query.dateTo} fyStartMonth={fyStartMonth} />
        </SearchInput>
      </div>

      <DocumentListTable
        docType="invoice"
        businessId={context.activeBusinessId}
        columns={columns}
        rows={items.map((doc) => {
          const id = String(doc._id);
          const inv = doc;
          return { id, cells: buildRowCells("invoice", doc, columns, customFieldDefs), status: (() => { const d = resolveInvoiceStatusDisplay(inv.status, inv.dueDate); return <StatusStamp variant={d.variant} seed={id}>{d.label}</StatusStamp>; })() };
        })}
        footer={{ total: `₹${minorToRupeesString(totals.totalMinor)}`, paid: `₹${minorToRupeesString(totals.paidMinor)}` }}
        basePath="/sales/invoices"
        canEdit={canEdit}
        emptyMessage="No invoices found."
      />

      <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
        <span>Pending: ₹{minorToRupeesString(totals.pendingMinor)}</span>
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/sales/invoices"
          searchParams={{ q: query.q, tab: query.tab, qf: searchFieldIds }}
        />
      </div>
    </div>
  );
}
