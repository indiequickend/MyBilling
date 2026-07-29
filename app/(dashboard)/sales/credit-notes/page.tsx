import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listCreditNotes } from "@/lib/db/queries/creditNotes";
import { creditNoteListQuerySchema } from "@/lib/validation/creditNotes";
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

const TABS = [
  { key: "all", label: "All" },
  { key: "issued", label: "Issued" },
  { key: "cancelled", label: "Cancelled" },
] as const;

const STATUS_LABELS = { draft: "Draft", issued: "Issued", cancelled: "Cancelled" } as const;
const STATUS_BADGE_VARIANT = { draft: "outline", issued: "success", cancelled: "danger" } as const;

export default async function CreditNotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "sales_credit_notes", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const query = creditNoteListQuerySchema.parse({
    q: sp.q,
    customerId: sp.customerId,
    tab: sp.tab,
    page: sp.page,
  });

  const { items, page, totalPages } = await listCreditNotes(context.activeBusinessId, {
    search: query.q,
    customerId: query.customerId,
    tab: query.tab,
    page: query.page,
  });

  const canCreate = can(context.membership, "sales_credit_notes", "create");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Credit Notes</h1>
        {canCreate ? (
          <Button asChild>
            <Link href="/sales/credit-notes/new">
              <Plus data-icon="inline-start" />
              New credit note
            </Link>
          </Button>
        ) : null}
      </div>

      <LinkTabs
        tabs={TABS.map((t) => ({
          label: t.label,
          href: t.key === "all" ? "/sales/credit-notes" : `/sales/credit-notes?tab=${t.key}`,
          active: query.tab === t.key,
        }))}
      />

      <div className="mb-4">
        <SearchInput
          defaultValue={query.q}
          placeholder="Search credit note #, customer…"
          hiddenParams={{ tab: query.tab }}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Credit note #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={6} message="No credit notes found." /> : null}
          {items.map((cn) => {
            const id = String(cn._id);
            return (
              <TableRow key={id} className="group">
                <TableCell>
                  <Link href={`/sales/credit-notes/${id}`} className="font-medium hover:underline">
                    {cn.docNumber ?? "Draft"}
                  </Link>
                </TableCell>
                <TableCell>{new Date(cn.creditNoteDate).toLocaleDateString()}</TableCell>
                <TableCell>{cn.customerSnapshot.displayName}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE_VARIANT[cn.status]}>{STATUS_LABELS[cn.status]}</Badge>
                </TableCell>
                <TableCell>₹{minorToRupeesString(cn.grandTotalMinor)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/sales/credit-notes/${id}`}>View</Link>
                    </Button>
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
          basePath="/sales/credit-notes"
          searchParams={{ q: query.q, tab: query.tab }}
        />
      </div>
    </div>
  );
}
