import { redirect, notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { findJournalById } from "@/lib/db/queries/journals";
import { minorToRupeesString } from "@/lib/utils/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { softDeleteJournalAction } from "../actions";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  bank_account: "Bank/cash account",
  customer: "Customer",
  vendor: "Vendor",
  other: "Other",
};

export default async function JournalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getDashboardContext();
  if (!context) redirect("/login");
  if (!context.activeBusinessId || !context.membership) redirect("/");

  if (!can(context.membership, "payments", "view")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }

  const journal = await findJournalById(id, context.activeBusinessId);
  if (!journal) notFound();

  const canDelete = can(context.membership, "payments", "delete");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{journal.docNumber ?? "Journal"}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(journal.journalDate).toLocaleDateString()} — {journal.narration}
          </p>
        </div>
        {canDelete && !journal.deletedAt ? (
          <form action={softDeleteJournalAction}>
            <input type="hidden" name="journalId" value={String(journal._id)} />
            <Button type="submit" variant="outline" className="text-destructive">
              Delete
            </Button>
          </form>
        ) : null}
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {journal.lines.map((line, i) => (
                <TableRow key={i}>
                  <TableCell>{line.accountLabel}</TableCell>
                  <TableCell>{ACCOUNT_TYPE_LABELS[line.accountType] ?? line.accountType}</TableCell>
                  <TableCell>{line.note ?? "—"}</TableCell>
                  <TableCell className="text-right font-tabular tabular-nums">
                    {line.debitMinor > 0 ? `₹${minorToRupeesString(line.debitMinor)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-tabular tabular-nums">
                    {line.creditMinor > 0 ? `₹${minorToRupeesString(line.creditMinor)}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={3} className="text-right font-medium">
                  Total
                </TableCell>
                <TableCell className="text-right font-medium font-tabular tabular-nums">
                  ₹{minorToRupeesString(journal.totalMinor)}
                </TableCell>
                <TableCell className="text-right font-medium font-tabular tabular-nums">
                  ₹{minorToRupeesString(journal.totalMinor)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
