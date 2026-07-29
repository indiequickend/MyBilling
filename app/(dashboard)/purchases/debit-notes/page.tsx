import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listDebitNotes } from "@/lib/db/queries/debitNotes";
import { debitNoteListQuerySchema } from "@/lib/validation/debitNotes";
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

export default async function DebitNotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "debit_notes", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const query = debitNoteListQuerySchema.parse({
    q: sp.q,
    vendorId: sp.vendorId,
    tab: sp.tab,
    page: sp.page,
  });

  const { items, page, totalPages } = await listDebitNotes(context.activeBusinessId, {
    search: query.q,
    vendorId: query.vendorId,
    tab: query.tab,
    page: query.page,
  });

  const canCreate = can(context.membership, "debit_notes", "create");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Debit Notes</h1>
        {canCreate ? (
          <Button asChild>
            <Link href="/purchases/debit-notes/new">
              <Plus data-icon="inline-start" />
              New debit note
            </Link>
          </Button>
        ) : null}
      </div>

      <LinkTabs
        tabs={TABS.map((t) => ({
          label: t.label,
          href: t.key === "all" ? "/purchases/debit-notes" : `/purchases/debit-notes?tab=${t.key}`,
          active: query.tab === t.key,
        }))}
      />

      <div className="mb-4">
        <SearchInput
          defaultValue={query.q}
          placeholder="Search debit note #, vendor…"
          hiddenParams={{ tab: query.tab }}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Debit note #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={6} message="No debit notes found." /> : null}
          {items.map((dn) => {
            const id = String(dn._id);
            return (
              <TableRow key={id} className="group">
                <TableCell>
                  <Link href={`/purchases/debit-notes/${id}`} className="font-medium hover:underline">
                    {dn.docNumber ?? "Draft"}
                  </Link>
                </TableCell>
                <TableCell>{new Date(dn.debitNoteDate).toLocaleDateString()}</TableCell>
                <TableCell>{dn.vendorSnapshot.displayName}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE_VARIANT[dn.status]}>{STATUS_LABELS[dn.status]}</Badge>
                </TableCell>
                <TableCell>₹{minorToRupeesString(dn.grandTotalMinor)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/purchases/debit-notes/${id}`}>View</Link>
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
          basePath="/purchases/debit-notes"
          searchParams={{ q: query.q, tab: query.tab }}
        />
      </div>
    </div>
  );
}
