import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findBankAccountById } from "@/lib/db/queries/bankAccounts";
import { listStatementLines, listUnmatchedPayments } from "@/lib/db/queries/bankReconciliation";
import { minorToRupeesString } from "@/lib/utils/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ImportForm } from "../ImportForm";
import { matchStatementLineAction, unmatchStatementLineAction } from "../actions";

export default async function ReconcileAccountPage({
  params,
}: {
  params: Promise<{ bankAccountId: string }>;
}) {
  const { bankAccountId } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "payments", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const bankAccount = await findBankAccountById(bankAccountId, context.activeBusinessId);
  if (!bankAccount) notFound();

  const [{ items: unmatchedLines }, unmatchedPayments, { items: matchedLines }] = await Promise.all([
    listStatementLines(context.activeBusinessId, bankAccountId, { matched: false, pageSize: 100 }),
    listUnmatchedPayments(context.activeBusinessId, bankAccountId),
    listStatementLines(context.activeBusinessId, bankAccountId, { matched: true, pageSize: 20 }),
  ]);

  const canEdit = can(context.membership, "payments", "edit");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Reconcile — {bankAccount.name}</h1>
      </div>

      <ImportForm bankAccountId={bankAccountId} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Unmatched statement lines</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {canEdit ? <TableHead>Match to</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatchedLines.length === 0 ? (
                  <TableEmptyState colSpan={canEdit ? 4 : 3} message="Nothing unmatched." />
                ) : null}
                {unmatchedLines.map((line) => (
                  <TableRow key={String(line._id)}>
                    <TableCell>{new Date(line.statementDate).toLocaleDateString()}</TableCell>
                    <TableCell className="whitespace-normal">{line.description ?? "—"}</TableCell>
                    <TableCell className="text-right font-tabular tabular-nums">
                      {line.direction === "credit" ? "+" : "-"}₹{minorToRupeesString(line.amountMinor)}
                    </TableCell>
                    {canEdit ? (
                      <TableCell className="font-tabular tabular-nums">
                        <form action={matchStatementLineAction} className="flex gap-1">
                          <input type="hidden" name="lineId" value={String(line._id)} />
                          <input type="hidden" name="bankAccountId" value={bankAccountId} />
                          <select
                            name="paymentId"
                            required
                            className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs"
                          >
                            <option value="">Select payment…</option>
                            {unmatchedPayments
                              .filter((p) => (p.direction === "in") === (line.direction === "credit"))
                              .map((p) => (
                                <option key={String(p._id)} value={String(p._id)}>
                                  {new Date(p.paymentDate).toLocaleDateString()} — ₹
                                  {minorToRupeesString(p.amountMinor)}
                                </option>
                              ))}
                          </select>
                          <Button type="submit" size="sm" variant="outline">
                            Match
                          </Button>
                        </form>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Unmatched payments</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatchedPayments.length === 0 ? (
                  <TableEmptyState colSpan={3} message="Nothing unmatched." />
                ) : null}
                {unmatchedPayments.map((p) => (
                  <TableRow key={String(p._id)}>
                    <TableCell>{new Date(p.paymentDate).toLocaleDateString()}</TableCell>
                    <TableCell>{p.direction === "in" ? "Received" : "Given"}</TableCell>
                    <TableCell className="text-right font-tabular tabular-nums">₹{minorToRupeesString(p.amountMinor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recently matched</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {canEdit ? <TableHead className="w-10" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {matchedLines.length === 0 ? (
                <TableEmptyState colSpan={canEdit ? 4 : 3} message="No matched lines yet." />
              ) : null}
              {matchedLines.map((line) => (
                <TableRow key={String(line._id)}>
                  <TableCell>{new Date(line.statementDate).toLocaleDateString()}</TableCell>
                  <TableCell className="whitespace-normal">{line.description ?? "—"}</TableCell>
                  <TableCell className="text-right font-tabular tabular-nums">
                    {line.direction === "credit" ? "+" : "-"}₹{minorToRupeesString(line.amountMinor)}
                  </TableCell>
                  {canEdit ? (
                    <TableCell>
                      <form action={unmatchStatementLineAction}>
                        <input type="hidden" name="lineId" value={String(line._id)} />
                        <input type="hidden" name="bankAccountId" value={bankAccountId} />
                        <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                          Unmatch
                        </Button>
                      </form>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
