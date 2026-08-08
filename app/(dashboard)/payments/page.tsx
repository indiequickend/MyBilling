import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { getDashboardContext } from "@/lib/auth/dashboardContext";
import { can } from "@/lib/rbac/can";
import { listPaymentsTimeline, sumPaymentsTimeline, isPaymentEditable } from "@/lib/db/queries/payments";
import { listBankAccounts } from "@/lib/db/queries/bankAccounts";
import { voidPaymentAction } from "./actions";
import { PAYMENT_MODE_LABELS } from "@/lib/constants/payments";
import { DOCUMENT_TYPE_LABELS } from "@/lib/constants/documentTypes";
import { minorToRupeesString } from "@/lib/utils/money";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableEmptyState } from "@/components/ui/TableEmptyState";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ButtonLabel } from "@/components/ui/ButtonLabel";
import { PageHeader } from "@/components/ui/PageHeader";

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

  const canCreate = can(context.membership, "payments", "create");
  const canEdit = can(context.membership, "payments", "edit");
  const canDelete = can(context.membership, "payments", "delete");
  const showActionsColumn = canEdit || canDelete;

  return (
    <div>
      <PageHeader
        title="Payments Timeline"
        actions={
          canCreate ? (
            <Button asChild aria-label="New payment">
              <Link href="/payments/new">
                <Plus data-icon="inline-start" />
                <ButtonLabel>New payment</ButtonLabel>
              </Link>
            </Button>
          ) : null
        }
      />

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
            {showActionsColumn ? <TableHead className="text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableEmptyState colSpan={showActionsColumn ? 8 : 7} message="No payments found." />
          ) : null}
          {items.map((p) => {
            const linkPrefix = p.linkedDocumentType ? DOC_LINK_PREFIX[p.linkedDocumentType] : undefined;
            const editable = isPaymentEditable(p);
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
                {showActionsColumn ? (
                  <TableCell className="text-right">
                    {editable ? (
                      <div className="flex justify-end gap-2">
                        {canEdit ? (
                          <Button variant="outline" size="sm" asChild aria-label="Edit payment">
                            <Link href={`/payments/${String(p._id)}/edit`}>
                              <Pencil data-icon="inline-start" />
                            </Link>
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <form action={voidPaymentAction}>
                            <input type="hidden" name="paymentId" value={String(p._id)} />
                            <Button
                              type="submit"
                              variant="outline"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              aria-label="Void payment"
                            >
                              <Trash2 data-icon="inline-start" />
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                ) : null}
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
