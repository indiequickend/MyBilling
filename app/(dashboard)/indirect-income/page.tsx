import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listIndirectIncome } from "@/lib/db/queries/indirectIncome";
import { indirectIncomeListQuerySchema } from "@/lib/validation/indirectIncome";
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
  { key: "recorded", label: "Recorded" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export default async function IndirectIncomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "indirect_income", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const query = indirectIncomeListQuerySchema.parse({
    q: sp.q,
    categoryId: sp.categoryId,
    tab: sp.tab,
    page: sp.page,
  });

  const { items, page, totalPages } = await listIndirectIncome(context.activeBusinessId, {
    search: query.q,
    categoryId: query.categoryId,
    tab: query.tab,
    page: query.page,
  });

  const canCreate = can(context.membership, "indirect_income", "create");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Indirect Income</h1>
        {canCreate ? (
          <Button asChild>
            <Link href="/indirect-income/new">
              <Plus data-icon="inline-start" />
              New entry
            </Link>
          </Button>
        ) : null}
      </div>

      <LinkTabs
        tabs={TABS.map((t) => ({
          label: t.label,
          href: t.key === "all" ? "/indirect-income" : `/indirect-income?tab=${t.key}`,
          active: query.tab === t.key,
        }))}
      />

      <div className="mb-4">
        <SearchInput
          defaultValue={query.q}
          placeholder="Search source, description…"
          hiddenParams={{ tab: query.tab }}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={6} message="No indirect income found." /> : null}
          {items.map((e) => {
            const id = String(e._id);
            return (
              <TableRow key={id}>
                <TableCell>{new Date(e.incomeDate).toLocaleDateString()}</TableCell>
                <TableCell>{e.sourceName ?? "—"}</TableCell>
                <TableCell>{e.description ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={e.status === "cancelled" ? "danger" : "success"}>
                    {e.status === "cancelled" ? "Cancelled" : "Recorded"}
                  </Badge>
                </TableCell>
                <TableCell className="font-tabular tabular-nums">₹{minorToRupeesString(e.amountMinor)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/indirect-income/${id}`}>View</Link>
                  </Button>
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
          basePath="/indirect-income"
          searchParams={{ q: query.q, tab: query.tab }}
        />
      </div>
    </div>
  );
}
