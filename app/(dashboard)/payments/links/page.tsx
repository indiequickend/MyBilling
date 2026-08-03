import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listPaymentLinks } from "@/lib/db/queries/paymentLinks";
import { minorToRupeesString } from "@/lib/utils/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { revokePaymentLinkAction } from "./actions";

export default async function PaymentLinksPage({
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

  const page = sp.page ? Number(sp.page) : 1;
  const { items, totalPages } = await listPaymentLinks(context.activeBusinessId, { page });
  const canCreate = can(context.membership, "payments", "create");
  const canRevoke = can(context.membership, "payments", "edit");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Payment Links</h1>
        {canCreate ? (
          <Button asChild>
            <Link href="/payments/links/new">
              <Plus data-icon="inline-start" />
              New payment link
            </Link>
          </Button>
        ) : null}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Created</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Note</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={6} message="No payment links yet." /> : null}
          {items.map((link) => {
            const isRevoked = !!link.revokedAt;
            const isExpired = new Date(link.expiresAt) < new Date();
            const status = isRevoked ? "Revoked" : isExpired ? "Expired" : "Active";
            const variant = isRevoked || isExpired ? "outline" : "success";
            return (
              <TableRow key={String(link._id)}>
                <TableCell>{new Date(link.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="font-tabular tabular-nums">₹{minorToRupeesString(link.amountMinor)}</TableCell>
                <TableCell>{link.note ?? "—"}</TableCell>
                <TableCell>{new Date(link.expiresAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge variant={variant}>{status}</Badge>
                </TableCell>
                <TableCell>
                  {canRevoke && !isRevoked && !isExpired ? (
                    <form action={revokePaymentLinkAction}>
                      <input type="hidden" name="paymentLinkId" value={String(link._id)} />
                      <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                        Revoke
                      </Button>
                    </form>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="mt-2 flex items-center justify-end text-sm text-muted-foreground">
        <Pagination page={page} totalPages={totalPages} basePath="/payments/links" searchParams={{}} />
      </div>
    </div>
  );
}
