import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listExpenses } from "@/lib/db/queries/expenses";
import { minorToRupeesString } from "@/lib/utils/money";
import { ProjectDetailTabs } from "@/components/dashboard/ProjectDetailTabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/Pagination";

export default async function ProjectExpensesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");
  if (!can(context.membership, "projects", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const page = Number(sp.page ?? 1) || 1;
  const { items, totalPages } = await listExpenses(context.activeBusinessId, { projectId: id, page });

  return (
    <div>
      <ProjectDetailTabs basePath={`/projects/${id}`} active="expenses" />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableEmptyState colSpan={5} message="No expenses linked to this project." />
          ) : null}
          {items.map((e) => (
            <TableRow key={String(e._id)}>
              <TableCell>
                <Link href={`/expenses/${String(e._id)}`} className="font-medium hover:underline">
                  {new Date(e.expenseDate).toLocaleDateString()}
                </Link>
              </TableCell>
              <TableCell>{e.supplierName ?? "—"}</TableCell>
              <TableCell>{e.description ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={e.status === "cancelled" ? "danger" : "success"}>
                  {e.status === "cancelled" ? "Cancelled" : "Recorded"}
                </Badge>
              </TableCell>
              <TableCell className="font-tabular tabular-nums">₹{minorToRupeesString(e.amountMinor)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-4 flex justify-end">
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath={`/projects/${id}/expenses`}
          searchParams={{}}
        />
      </div>
    </div>
  );
}
