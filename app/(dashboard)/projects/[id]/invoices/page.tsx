import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listInvoices } from "@/lib/db/queries/invoices";
import { INVOICE_STATUS_BADGE_VARIANT, INVOICE_STATUS_LABELS } from "@/lib/constants/invoices";
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

export default async function ProjectInvoicesPage({
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
  const { items, totalPages } = await listInvoices(context.activeBusinessId, { projectId: id, page });

  return (
    <div>
      <ProjectDetailTabs basePath={`/projects/${id}`} active="invoices" />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableEmptyState colSpan={5} message="No invoices linked to this project." />
          ) : null}
          {items.map((inv) => (
            <TableRow key={String(inv._id)}>
              <TableCell>
                <Link href={`/sales/invoices/${String(inv._id)}`} className="font-medium hover:underline">
                  {inv.docNumber ?? "Draft"}
                </Link>
              </TableCell>
              <TableCell>{new Date(inv.invoiceDate).toLocaleDateString()}</TableCell>
              <TableCell>{inv.customerSnapshot.displayName}</TableCell>
              <TableCell>
                <Badge variant={INVOICE_STATUS_BADGE_VARIANT[inv.status]}>
                  {INVOICE_STATUS_LABELS[inv.status]}
                </Badge>
              </TableCell>
              <TableCell>₹{minorToRupeesString(inv.grandTotalMinor)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-4 flex justify-end">
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath={`/projects/${id}/invoices`}
          searchParams={{}}
        />
      </div>
    </div>
  );
}
