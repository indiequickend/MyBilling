import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listPurchaseOrders } from "@/lib/db/queries/purchaseOrders";
import { purchaseOrderListQuerySchema } from "@/lib/validation/purchaseOrders";
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

  const business = await findBusinessById(context.activeBusinessId);
  const customFieldDefs = business?.documentCustomFieldDefs?.purchase_order ?? [];
  const columns = getListColumns("purchase_order", customFieldDefs);
  const searchFieldIds = parseSearchFieldIds(sp.qf);

  const { items, page, totalPages } = await listPurchaseOrders(context.activeBusinessId, {
    searchPaths: resolveSearchPaths(columns, searchFieldIds),
    search: query.q,
    vendorId: query.vendorId,
    tab: query.tab,
    page: query.page,
  });

  const canCreate = can(context.membership, "purchase_orders", "create");
  const canEdit = can(context.membership, "purchase_orders", "edit");

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        actions={
          canCreate ? (
            <>
              <Button variant="outline" asChild className="hidden lg:inline-flex" aria-label="Bulk upload">
                <Link href="/purchases/orders/bulk-upload">
                  <Upload data-icon="inline-start" />
                  <ButtonLabel>Bulk upload</ButtonLabel>
                </Link>
              </Button>
              <Button asChild aria-label="New purchase order">
                <Link href="/purchases/orders/new">
                  <Plus data-icon="inline-start" />
                  <ButtonLabel>New purchase order</ButtonLabel>
                </Link>
              </Button>
            </>
          ) : null
        }
      />

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
          searchFields={{
            options: getSearchOptions(columns),
            urlSelected: searchFieldIds,
            storageKey: `mybilling:listSearch:${context.activeBusinessId}:purchase_order`,
          }}
        />
      </div>

      <DocumentListTable
        docType="purchase_order"
        businessId={context.activeBusinessId}
        columns={columns}
        rows={items.map((doc) => {
          const id = String(doc._id);
          const po = doc;
          return { id, cells: buildRowCells("purchase_order", doc, columns, customFieldDefs), status: <StatusStamp variant={STATUS_BADGE_VARIANT[po.status]} seed={id}>{STATUS_LABELS[po.status]}</StatusStamp> };
        })}
        basePath="/purchases/orders"
        canEdit={canEdit}
        emptyMessage="No purchase orders found."
      />

      <div className="mt-2 flex items-center justify-end text-sm text-muted-foreground">
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/purchases/orders"
          searchParams={{ q: query.q, tab: query.tab, qf: searchFieldIds }}
        />
      </div>
    </div>
  );
}
