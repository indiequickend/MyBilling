import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { Button } from "@/components/ui/button";

export default async function ReconciliationPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "payments", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const bankAccounts = await listBankAccounts(context.activeBusinessId, "active");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Bank Reconciliation</h1>
        <p className="text-sm text-muted-foreground">
          Import a bank statement for an account to match it against recorded payments.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {bankAccounts.length === 0 ? (
            <TableEmptyState colSpan={2} message="No bank accounts yet." />
          ) : null}
          {bankAccounts.map((a) => (
            <TableRow key={String(a._id)}>
              <TableCell>{a.name}</TableCell>
              <TableCell>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/payments/reconciliation/${String(a._id)}`}>Reconcile</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
