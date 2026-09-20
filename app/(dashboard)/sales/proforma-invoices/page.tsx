import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listProformaInvoices } from "@/lib/db/queries/proformaInvoices";
import { proformaInvoiceListQuerySchema } from "@/lib/validation/proformaInvoices";
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

export default async function ProformaInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "proforma_invoices", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const query = proformaInvoiceListQuerySchema.parse({
    q: sp.q,
    customerId: sp.customerId,
    tab: sp.tab,
    page: sp.page,
  });

  const business = await findBusinessById(context.activeBusinessId);
  const customFieldDefs = business?.documentCustomFieldDefs?.proforma_invoice ?? [];
  const columns = getListColumns("proforma_invoice", customFieldDefs);
  const searchFieldIds = parseSearchFieldIds(sp.qf);

  const { items, page, totalPages } = await listProformaInvoices(context.activeBusinessId, {
    searchPaths: resolveSearchPaths(columns, searchFieldIds),
    search: query.q,
    customerId: query.customerId,
    tab: query.tab,
    page: query.page,
  });

  const canCreate = can(context.membership, "proforma_invoices", "create");
  const canEdit = can(context.membership, "proforma_invoices", "edit");

  return (
    <div>
      <PageHeader
        title="Proforma Invoices"
        actions={
          canCreate ? (
            <>
              <Button variant="outline" asChild className="hidden lg:inline-flex" aria-label="Bulk upload">
                <Link href="/sales/proforma-invoices/bulk-upload">
                  <Upload data-icon="inline-start" />
                  <ButtonLabel>Bulk upload</ButtonLabel>
                </Link>
              </Button>
              <Button asChild aria-label="New proforma invoice">
                <Link href="/sales/proforma-invoices/new">
                  <Plus data-icon="inline-start" />
                  <ButtonLabel>New proforma invoice</ButtonLabel>
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <LinkTabs
        tabs={TABS.map((t) => ({
          label: t.label,
          href: t.key === "all" ? "/sales/proforma-invoices" : `/sales/proforma-invoices?tab=${t.key}`,
          active: query.tab === t.key,
        }))}
      />

      <div className="mb-4">
        <SearchInput
          defaultValue={query.q}
          placeholder="Search proforma #, reference, customer…"
          hiddenParams={{ tab: query.tab }}
          searchFields={{
            options: getSearchOptions(columns),
            urlSelected: searchFieldIds,
            storageKey: `mybilling:listSearch:${context.activeBusinessId}:proforma_invoice`,
          }}
        />
      </div>

      <DocumentListTable
        docType="proforma_invoice"
        businessId={context.activeBusinessId}
        columns={columns}
        rows={items.map((doc) => {
          const id = String(doc._id);
          const pi = doc;
          return { id, cells: buildRowCells("proforma_invoice", doc, columns, customFieldDefs), status: <StatusStamp variant={STATUS_BADGE_VARIANT[pi.status]} seed={id}>{STATUS_LABELS[pi.status]}</StatusStamp> };
        })}
        basePath="/sales/proforma-invoices"
        canEdit={canEdit}
        emptyMessage="No proforma invoices found."
      />

      <div className="mt-2 flex items-center justify-end text-sm text-muted-foreground">
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath="/sales/proforma-invoices"
          searchParams={{ q: query.q, tab: query.tab, qf: searchFieldIds }}
        />
      </div>
    </div>
  );
}
