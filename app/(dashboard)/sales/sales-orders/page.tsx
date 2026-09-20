import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listSalesOrders } from "@/lib/db/queries/salesOrders";
import { salesOrderListQuerySchema } from "@/lib/validation/salesOrders";
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

  const business = await findBusinessById(context.activeBusinessId);
  const customFieldDefs = business?.documentCustomFieldDefs?.sales_order ?? [];
  const columns = getListColumns("sales_order", customFieldDefs);
  const searchFieldIds = parseSearchFieldIds(sp.qf);

  const { items, page, totalPages } = await listSalesOrders(context.activeBusinessId, {
    searchPaths: resolveSearchPaths(columns, searchFieldIds),
    search: query.q,
    customerId: query.customerId,
    tab: query.tab,
    page: query.page,
  });

  const canCreate = can(context.membership, "sales_orders", "create");
  const canEdit = can(context.membership, "sales_orders", "edit");

  return (
    <div>
      <PageHeader
        title="Sales Orders"
        actions={
          canCreate ? (
            <Button asChild aria-label="New sales order">
              <Link href="/sales/sales-orders/new">
                <Plus data-icon="inline-start" />
                <ButtonLabel>New sales order</ButtonLabel>
              </Link>
            </Button>
          ) : null
        }
      />

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
          searchFields={{
            options: getSearchOptions(columns),
            urlSelected: searchFieldIds,
            storageKey: `mybilling:listSearch:${context.activeBusinessId}:sales_order`,
          }}
        />
      </div>

      <DocumentListTable
        docType="sales_order"
        businessId={context.activeBusinessId}
        columns={columns}
        rows={items.map((doc) => {
          const id = String(doc._id);
          const so = doc;
          return { id, cells: buildRowCells("sales_order", doc, columns, customFieldDefs), status: <StatusStamp variant={STATUS_BADGE_VARIANT[so.status]} seed={id}>{STATUS_LABELS[so.status]}</StatusStamp> };
        })}
        basePath="/sales/sales-orders"
        canEdit={canEdit}
        emptyMessage="No sales orders found."
      />

      <div className="mt-2 flex items-center justify-end text-sm text-muted-foreground">
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/sales/sales-orders"
          searchParams={{ q: query.q, tab: query.tab, qf: searchFieldIds }}
        />
      </div>
    </div>
  );
}
