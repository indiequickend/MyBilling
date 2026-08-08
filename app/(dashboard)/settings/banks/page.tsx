import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listBankAccounts, getBankAccountBalance, listBankTransfers } from "@/lib/db/queries/bankAccounts";
import { minorToRupeesString } from "@/lib/utils/money";
import { BANK_ACCOUNT_TYPE_LABELS } from "@/lib/constants/payments";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { Button } from "@/components/ui/button";
import { ButtonLabel } from "@/components/ui/ButtonLabel";
import { PageHeader } from "@/components/ui/PageHeader";
import { RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setDefaultBankAccountAction, restoreBankAccountAction } from "./actions";
import { DeleteBankAccountButton } from "./DeleteBankAccountButton";
import { TransferFundsForm } from "./TransferFundsForm";

export default async function BanksPage() {
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "settings", "manage_banking")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const [active, deleted, transfers] = await Promise.all([
    listBankAccounts(context.activeBusinessId, "active"),
    listBankAccounts(context.activeBusinessId, "deleted"),
    listBankTransfers(context.activeBusinessId, { pageSize: 10 }),
  ]);

  const balances = await Promise.all(
    active.map((a) => getBankAccountBalance(String(a._id), context.activeBusinessId!)),
  );

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Banks"
        actions={
          <Button asChild aria-label="New account">
            <Link href="/settings/banks/new">
              <Plus data-icon="inline-start" />
              <ButtonLabel>New account</ButtonLabel>
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Default</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.length === 0 ? <TableEmptyState colSpan={5} message="No bank accounts yet." /> : null}
              {active.map((a, i) => (
                <TableRow key={String(a._id)}>
                  <TableCell>
                    <Link href={`/settings/banks/${String(a._id)}/edit`} className="font-medium hover:underline">
                      {a.name}
                    </Link>
                  </TableCell>
                  <TableCell>{BANK_ACCOUNT_TYPE_LABELS[a.type]}</TableCell>
                  <TableCell className="font-tabular tabular-nums">₹{minorToRupeesString(balances[i])}</TableCell>
                  <TableCell>
                    {a.isDefault ? (
                      <Badge variant="success">Default</Badge>
                    ) : (
                      <form action={setDefaultBankAccountAction}>
                        <input type="hidden" name="bankAccountId" value={String(a._id)} />
                        <Button type="submit" variant="outline" size="sm">
                          Set default
                        </Button>
                      </form>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DeleteBankAccountButton bankAccountId={String(a._id)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {deleted.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Deleted</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {deleted.map((a) => (
                  <TableRow key={String(a._id)}>
                    <TableCell>{a.name}</TableCell>
                    <TableCell className="text-right">
                      <form action={restoreBankAccountAction}>
                        <input type="hidden" name="bankAccountId" value={String(a._id)} />
                        <Button type="submit" variant="outline" size="sm" aria-label="Restore">
                          <RotateCcw data-icon="inline-start" />
                          <ButtonLabel>Restore</ButtonLabel>
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Transfer funds</CardTitle>
        </CardHeader>
        <CardContent>
          <TransferFundsForm accounts={active.map((a) => ({ id: String(a._id), name: a.name }))} />
        </CardContent>
      </Card>

      {transfers.items.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent transfers</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.items.map((t) => (
                  <TableRow key={String(t._id)}>
                    <TableCell>{new Date(t.transferDate).toLocaleDateString()}</TableCell>
                    <TableCell className="font-tabular tabular-nums">₹{minorToRupeesString(t.amountMinor)}</TableCell>
                    <TableCell>{t.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
