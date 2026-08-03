import { redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listPaymentsTimeline, sumPaymentsTimeline } from "@/lib/db/queries/payments";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import { DOCUMENT_TYPE_LABELS } from "@/lib/constants/documentTypes";
import { minorToRupeesString } from "@/lib/utils/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const DOC_LINK_PREFIX: Record<string, string> = {
  invoice: "/sales/invoices",
  purchase: "/purchases",
  expense: "/expenses",
  indirect_income: "/indirect-income",
};

export default async function PaymentsTimelinePage({
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

  const bankAccountId = sp.bankAccountId || undefined;
  const direction = sp.direction === "in" || sp.direction === "out" ? sp.direction : undefined;
  const q = sp.q || undefined;
  const page = sp.page ? Number(sp.page) : 1;

  const [bankAccounts, { items, page: currentPage, totalPages }, totals] = await Promise.all([
    listBankAccounts(context.activeBusinessId, "active"),
    listPaymentsTimeline(context.activeBusinessId, { bankAccountId, direction, search: q, page }),
    sumPaymentsTimeline(context.activeBusinessId, { bankAccountId, direction, search: q }),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">Payments Timeline</h1>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Net Balance</p>
            <p className="text-lg font-semibold">₹{minorToRupeesString(totals.netBalanceMinor)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">You Received</p>
            <p className="text-lg font-semibold text-accent-mint-foreground">
              ₹{minorToRupeesString(totals.receivedMinor)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">You Gave</p>
            <p className="text-lg font-semibold text-destructive">
              ₹{minorToRupeesString(totals.givenMinor)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4">
        <SearchInput defaultValue={q} placeholder="Search reference note…">
          <select
            name="bankAccountId"
            defaultValue={bankAccountId ?? ""}
            className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All accounts</option>
            {bankAccounts.map((a) => (
              <option key={String(a._id)} value={String(a._id)}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            name="direction"
            defaultValue={direction ?? ""}
            className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"
          >
            <option value="">In &amp; out</option>
            <option value="in">Received</option>
            <option value="out">Given</option>
          </select>
        </SearchInput>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Party</TableHead>
            <TableHead>Document</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead>Direction</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? <TableEmptyState colSpan={7} message="No payments found." /> : null}
          {items.map((p) => {
            const linkPrefix = p.linkedDocumentType ? DOC_LINK_PREFIX[p.linkedDocumentType] : undefined;
            return (
              <TableRow key={String(p._id)}>
                <TableCell>{new Date(p.paymentDate).toLocaleDateString()}</TableCell>
                <TableCell>{p.partyName ?? "—"}</TableCell>
                <TableCell>
                  {!p.linkedDocumentType ? (
                    <span className="text-muted-foreground">Advance / On account</span>
                  ) : linkPrefix ? (
                    <Link href={`${linkPrefix}/${String(p.linkedDocumentId)}`} className="hover:underline">
                      {p.linkedDocumentNumber ??
                        DOCUMENT_TYPE_LABELS[p.linkedDocumentType as keyof typeof DOCUMENT_TYPE_LABELS] ??
                        p.linkedDocumentType}
                    </Link>
                  ) : (
                    p.linkedDocumentType
                  )}
                </TableCell>
                <TableCell>{p.bankAccountName}</TableCell>
                <TableCell>{PAYMENT_MODE_LABELS[p.mode]}</TableCell>
                <TableCell>
                  <Badge variant={p.direction === "in" ? "success" : "danger"}>
                    {p.direction === "in" ? "Received" : "Given"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium font-tabular tabular-nums">
                  ₹{minorToRupeesString(p.amountMinor)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="mt-2 flex items-center justify-end text-sm text-muted-foreground">
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          basePath="/payments"
          searchParams={{ q, bankAccountId, direction }}
        />
      </div>
    </div>
  );
}
