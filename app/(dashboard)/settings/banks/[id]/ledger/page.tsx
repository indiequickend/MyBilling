import { formatDate } from "@/lib/utils/date";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getDashboardContext, getActiveBusinessFyStartMonth } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { getBankLedger } from "@/lib/db/queries/bankLedger";
import { objectId } from "@/lib/validation/shared";
import { minorToRupeesString } from "@/lib/utils/money";
import { PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/PageHeader";
import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";

const PAGE_SIZE = 100;

const DOC_LINK_PREFIX: Record<string, string> = {
  invoice: "/sales/invoices",
  purchase: "/purchases",
  expense: "/expenses",
  indirect_income: "/indirect-income",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value: string | undefined): Date | undefined {
  if (!value || !ISO_DATE.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const money = (minor: number) => `₹${minorToRupeesString(minor)}`;

export default async function BankLedgerPage({
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

  if (!can(context.membership, "settings", "manage_banking")) {
    return <p className="text-sm text-destructive">You don&apos;t have permission to view this page.</p>;
  }
  if (!objectId.safeParse(id).success) notFound();

  const dateFromRaw = sp.dateFrom && ISO_DATE.test(sp.dateFrom) ? sp.dateFrom : undefined;
  const dateToRaw = sp.dateTo && ISO_DATE.test(sp.dateTo) ? sp.dateTo : undefined;
  const ledger = await getBankLedger(context.activeBusinessId, id, {
    dateFrom: parseIsoDate(dateFromRaw),
    dateTo: parseIsoDate(dateToRaw),
  });
  if (!ledger) notFound();

  const fyStartMonth = getActiveBusinessFyStartMonth(context);
  const hasRange = Boolean(dateFromRaw || dateToRaw);
  const totalPages = Math.max(1, Math.ceil(ledger.entries.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), totalPages);
  const pageEntries = ledger.entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const basePath = `/settings/banks/${ledger.account.id}/ledger`;

  return (
    <div>
      <PageHeader
        title={`${ledger.account.name} ledger`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/settings/banks">Back to banks</Link>
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">{hasRange ? "Opening (start of range)" : "Opening balance"}</p>
            <p className="text-lg font-semibold font-tabular tabular-nums">{money(ledger.openingMinor)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Money in</p>
            <p className="text-lg font-semibold font-tabular tabular-nums text-accent-mint-foreground">
              {money(ledger.totalInMinor)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Money out</p>
            <p className="text-lg font-semibold font-tabular tabular-nums text-destructive">
              {money(ledger.totalOutMinor)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">{hasRange ? "Closing (end of range)" : "Closing balance"}</p>
            <p className="text-lg font-semibold font-tabular tabular-nums">{money(ledger.closingMinor)}</p>
          </CardContent>
        </Card>
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <DateRangeFilter dateFrom={dateFromRaw} dateTo={dateToRaw} fyStartMonth={fyStartMonth} />
        <Button type="submit" variant="outline">
          Apply
        </Button>
        {hasRange ? (
          <Button variant="ghost" asChild>
            <Link href={basePath}>Clear</Link>
          </Button>
        ) : null}
        <span className="ml-auto text-sm text-muted-foreground">
          Current balance (all dates): <span className="font-medium text-foreground">{money(ledger.currentBalanceMinor)}</span>
        </span>
      </form>

      {ledger.unmatchedStatementLines > 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">
          {ledger.unmatchedStatementLines} imported bank-statement line
          {ledger.unmatchedStatementLines === 1 ? "" : "s"} for this account {ledger.unmatchedStatementLines === 1 ? "isn't" : "aren't"} matched
          to a payment yet —{" "}
          <Link href="/payments/reconciliation" className="underline">
            open reconciliation
          </Link>
          .
        </p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Mode</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="text-right">Money in</TableHead>
            <TableHead className="text-right">Money out</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead>Statement</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableCell colSpan={6} className="font-medium">
              {hasRange ? "Balance brought forward" : "Opening balance"}
            </TableCell>
            <TableCell className="text-right font-tabular tabular-nums font-medium">{money(ledger.openingMinor)}</TableCell>
            <TableCell />
          </TableRow>
          {ledger.entries.length === 0 ? <TableEmptyState colSpan={8} message="No transactions in this period." /> : null}
          {pageEntries.map((e) => (
            <TableRow key={`${e.kind}-${e.id}`}>
              <TableCell>{formatDate(e.date)}</TableCell>
              <TableCell>
                {e.description}
                {e.linkedDocumentType && e.linkedDocumentId && DOC_LINK_PREFIX[e.linkedDocumentType] ? (
                  <>
                    {" "}
                    <Link
                      href={`${DOC_LINK_PREFIX[e.linkedDocumentType]}/${e.linkedDocumentId}`}
                      className="text-xs text-muted-foreground underline"
                    >
                      view
                    </Link>
                  </>
                ) : null}
              </TableCell>
              <TableCell>{e.mode ? PAYMENT_MODE_LABELS[e.mode] : "Transfer"}</TableCell>
              <TableCell className="max-w-56 truncate">{e.referenceNote ?? ""}</TableCell>
              <TableCell className="text-right font-tabular tabular-nums">{e.inMinor ? money(e.inMinor) : ""}</TableCell>
              <TableCell className="text-right font-tabular tabular-nums">{e.outMinor ? money(e.outMinor) : ""}</TableCell>
              <TableCell className="text-right font-tabular tabular-nums">{money(e.balanceMinor)}</TableCell>
              <TableCell>
                {e.kind === "payment" ? (
                  e.statementMatched ? <Badge variant="success">Matched</Badge> : <span className="text-muted-foreground">—</span>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="mt-2 flex justify-end">
        <Pagination
          page={page}
          totalPages={totalPages}
          basePath={basePath}
          searchParams={{ dateFrom: dateFromRaw, dateTo: dateToRaw }}
        />
      </div>
    </div>
  );
}
