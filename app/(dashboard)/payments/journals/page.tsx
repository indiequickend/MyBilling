import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listJournals } from "@/lib/db/queries/journals";
import { minorToRupeesString } from "@/lib/utils/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { Button } from "@/components/ui/button";
import { ButtonLabel } from "@/components/ui/ButtonLabel";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "payments", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const q = sp.q || undefined;
  const page = sp.page ? Number(sp.page) : 1;
  const { items, totalPages } = await listJournals(context.activeBusinessId, { search: q, page });
  const canCreate = can(context.membership, "payments", "create");

  return (
    <div>
      <PageHeader
        title="Journals"
        actions={
          canCreate ? (
            <Button asChild aria-label="New journal">
              <Link href="/payments/journals/new">
                <Plus data-icon="inline-start" />
                <ButtonLabel>New journal</ButtonLabel>
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-4">
        <SearchInput defaultValue={q} placeholder="Search narration…" />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Journal #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Narration</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={4} message="No journal entries yet." /> : null}
          {items.map((j) => (
            <TableRow key={String(j._id)}>
              <TableCell>
                <Link href={`/payments/journals/${String(j._id)}`} className="font-medium hover:underline">
                  {j.docNumber ?? "—"}
                </Link>
              </TableCell>
              <TableCell>{new Date(j.journalDate).toLocaleDateString()}</TableCell>
              <TableCell className="whitespace-normal">{j.narration}</TableCell>
              <TableCell className="text-right font-tabular tabular-nums">₹{minorToRupeesString(j.totalMinor)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-2 flex items-center justify-end text-sm text-muted-foreground">
        <Pagination page={page} totalPages={totalPages} basePath="/payments/journals" searchParams={{ q }} />
      </div>
    </div>
  );
}
