import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listQuotations } from "@/lib/db/queries/quotations";
import { quotationListQuerySchema } from "@/lib/validation/quotations";
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

const STATUS_LABELS = {
  draft: "Draft",
  open: "Open",
  partial: "Partial",
  closed: "Closed",
  cancelled: "Cancelled",
} as const;
const STATUS_BADGE_VARIANT = {
  draft: "outline",
  open: "warning",
  partial: "warning",
  closed: "success",
  cancelled: "danger",
} as const;

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "quotations", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const query = quotationListQuerySchema.parse({
    q: sp.q,
    customerId: sp.customerId,
    tab: sp.tab,
    page: sp.page,
  });

  const business = await findBusinessById(context.activeBusinessId);
  const customFieldDefs = business?.documentCustomFieldDefs?.quotation ?? [];
  const columns = getListColumns("quotation", customFieldDefs);
  const searchFieldIds = parseSearchFieldIds(sp.qf);

  const { items, page, totalPages } = await listQuotations(context.activeBusinessId, {
    searchPaths: resolveSearchPaths(columns, searchFieldIds),
    search: query.q,
    customerId: query.customerId,
    tab: query.tab,
    page: query.page,
  });

  const canCreate = can(context.membership, "quotations", "create");
  const canEdit = can(context.membership, "quotations", "edit");

  return (
    <div>
      <PageHeader
        title="Quotations"
        actions={
          canCreate ? (
            <Button asChild aria-label="New quotation">
              <Link href="/sales/quotations/new">
                <Plus data-icon="inline-start" />
                <ButtonLabel>New quotation</ButtonLabel>
              </Link>
            </Button>
          ) : null
        }
      />

      <LinkTabs
        tabs={TABS.map((t) => ({
          label: t.label,
          href: t.key === "all" ? "/sales/quotations" : `/sales/quotations?tab=${t.key}`,
          active: query.tab === t.key,
        }))}
      />

      <div className="mb-4">
        <SearchInput
          defaultValue={query.q}
          placeholder="Search quotation #, reference, customer…"
          hiddenParams={{ tab: query.tab }}
          searchFields={{
            options: getSearchOptions(columns),
            urlSelected: searchFieldIds,
            storageKey: `mybilling:listSearch:${context.activeBusinessId}:quotation`,
          }}
        />
      </div>

      <DocumentListTable
        docType="quotation"
        businessId={context.activeBusinessId}
        columns={columns}
        rows={items.map((doc) => {
          const id = String(doc._id);
          const q = doc;
          return { id, cells: buildRowCells("quotation", doc, columns, customFieldDefs), status: <StatusStamp variant={STATUS_BADGE_VARIANT[q.status]} seed={id}>{STATUS_LABELS[q.status]}</StatusStamp> };
        })}
        basePath="/sales/quotations"
        canEdit={canEdit}
        emptyMessage="No quotations found."
      />

      <div className="mt-2 flex items-center justify-end text-sm text-muted-foreground">
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/sales/quotations"
          searchParams={{ q: query.q, tab: query.tab, qf: searchFieldIds }}
        />
      </div>
    </div>
  );
}
