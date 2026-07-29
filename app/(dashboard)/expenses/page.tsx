import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listExpenses } from "@/lib/db/queries/expenses";
import { expenseListQuerySchema } from "@/lib/validation/expenses";
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

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "expenses", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const query = expenseListQuerySchema.parse({
    q: sp.q,
    categoryId: sp.categoryId,
    tab: sp.tab,
    page: sp.page,
  });

  const { items, page, totalPages } = await listExpenses(context.activeBusinessId, {
    search: query.q,
    categoryId: query.categoryId,
    tab: query.tab,
    page: query.page,
  });

  const canCreate = can(context.membership, "expenses", "create");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Expenses</h1>
        {canCreate ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/expenses/bulk-upload">
                <Upload data-icon="inline-start" />
                Bulk upload
              </Link>
            </Button>
            <Button asChild>
              <Link href="/expenses/new">
                <Plus data-icon="inline-start" />
                New expense
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      <LinkTabs
        tabs={TABS.map((t) => ({
          label: t.label,
          href: t.key === "all" ? "/expenses" : `/expenses?tab=${t.key}`,
          active: query.tab === t.key,
        }))}
      />

      <div className="mb-4">
        <SearchInput
          defaultValue={query.q}
          placeholder="Search supplier, description…"
          hiddenParams={{ tab: query.tab }}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={6} message="No expenses found." /> : null}
          {items.map((e) => {
            const id = String(e._id);
            return (
              <TableRow key={id}>
                <TableCell>{new Date(e.expenseDate).toLocaleDateString()}</TableCell>
                <TableCell>{e.supplierName ?? "—"}</TableCell>
                <TableCell>{e.description ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={e.status === "cancelled" ? "danger" : "success"}>
                    {e.status === "cancelled" ? "Cancelled" : "Recorded"}
                  </Badge>
                </TableCell>
                <TableCell>₹{minorToRupeesString(e.amountMinor)}</TableCell>
                <TableCell className="text-right">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/expenses/${id}`}>View</Link>
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
          basePath="/expenses"
          searchParams={{ q: query.q, tab: query.tab }}
        />
      </div>
    </div>
  );
}
