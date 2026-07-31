import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listPurchases } from "@/lib/db/queries/purchases";
import { DOCUMENT_STATUS_BADGE_VARIANT, DOCUMENT_STATUS_LABELS } from "@/lib/constants/documents";
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

export default async function ProjectPurchasesPage({
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
  const { items, totalPages } = await listPurchases(context.activeBusinessId, { projectId: id, page });

  return (
    <div>
      <ProjectDetailTabs basePath={`/projects/${id}`} active="purchases" />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Purchase #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableEmptyState colSpan={5} message="No purchases linked to this project." />
          ) : null}
          {items.map((p) => (
            <TableRow key={String(p._id)}>
              <TableCell>
                <Link href={`/purchases/${String(p._id)}`} className="font-medium hover:underline">
                  {p.docNumber ?? "Draft"}
                </Link>
              </TableCell>
              <TableCell>{new Date(p.purchaseDate).toLocaleDateString()}</TableCell>
              <TableCell>{p.vendorSnapshot.displayName}</TableCell>
              <TableCell>
                <Badge variant={DOCUMENT_STATUS_BADGE_VARIANT[p.status]}>
                  {DOCUMENT_STATUS_LABELS[p.status]}
                </Badge>
              </TableCell>
              <TableCell>₹{minorToRupeesString(p.grandTotalMinor)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-4 flex justify-end">
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath={`/projects/${id}/purchases`}
          searchParams={{}}
        />
      </div>
    </div>
  );
}
