import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { getDashboardContext, getActiveBusinessFyStartMonth } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listPurchases, sumPurchaseTotals } from "@/lib/db/queries/purchases";
import { purchaseListQuerySchema } from "@/lib/validation/purchases";
import { DOCUMENT_STATUS_BADGE_VARIANT, DOCUMENT_STATUS_LABELS } from "@/lib/constants/documents";
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

  const business = await findBusinessById(context.activeBusinessId);
  const customFieldDefs = business?.documentCustomFieldDefs?.purchase ?? [];
  const columns = getListColumns("purchase", customFieldDefs);
  const searchFieldIds = parseSearchFieldIds(sp.qf);

  const listParams = {
    searchPaths: resolveSearchPaths(columns, searchFieldIds),
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
      <PageHeader
        title="Purchases"
        actions={
          canCreate ? (
            <>
              <Button variant="outline" asChild className="hidden lg:inline-flex" aria-label="Bulk upload">
                <Link href="/purchases/bulk-upload">
                  <Upload data-icon="inline-start" />
                  <ButtonLabel>Bulk upload</ButtonLabel>
                </Link>
              </Button>
              <Button asChild aria-label="New purchase">
                <Link href="/purchases/new">
                  <Plus data-icon="inline-start" />
                  <ButtonLabel>New purchase</ButtonLabel>
                </Link>
              </Button>
            </>
          ) : null
        }
      />

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
          searchFields={{
            options: getSearchOptions(columns),
            urlSelected: searchFieldIds,
            storageKey: `mybilling:listSearch:${context.activeBusinessId}:purchase`,
          }}
        >
          <DateRangeFilter dateFrom={query.dateFrom} dateTo={query.dateTo} fyStartMonth={fyStartMonth} />
        </SearchInput>
      </div>

      <DocumentListTable
        docType="purchase"
        businessId={context.activeBusinessId}
        columns={columns}
        rows={items.map((doc) => {
          const id = String(doc._id);
          const p = doc;
          return { id, cells: buildRowCells("purchase", doc, columns, customFieldDefs), status: <StatusStamp variant={DOCUMENT_STATUS_BADGE_VARIANT[p.status]} seed={id}>{DOCUMENT_STATUS_LABELS[p.status]}</StatusStamp> };
        })}
        footer={{ total: `₹${minorToRupeesString(totals.totalMinor)}`, paid: `₹${minorToRupeesString(totals.paidMinor)}` }}
        basePath="/purchases"
        canEdit={canEdit}
        emptyMessage="No purchases found."
      />

      <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
        <span>Pending: ₹{minorToRupeesString(totals.pendingMinor)}</span>
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/purchases"
          searchParams={{ q: query.q, tab: query.tab, qf: searchFieldIds }}
        />
      </div>
    </div>
  );
}
